// The opt-in daily usage report: consent state, the per-day tally, the send and the delete.
// Network I/O goes through the injected `post` (postJson in network.js, the only fetch in the extension).
// Nothing is created or sent until setConsent(true). Every report is checked with validateReport right before it is
// sent; a report that fails the check is never sent. The tally keeps hashes of host names, never the names.
import {
  utcDay,
  emptyTally,
  recordEngine,
  recordSite,
  buildReport,
  validateReport,
  isUuid,
  ENGINES,
} from "../shared/usageReport.js";

export const INGEST_URL = "https://pshah.fun/api/darkmode-telemetry";
export const DELETE_URL = "https://pshah.fun/api/darkmode-telemetry-delete";

// Same key as the 2.0.x opt-in, so people who opted in there keep their ID if they confirm. consentVersion 2 marks
// consent given to what this version sends; a state without it is a 2.0.x opt-in that has not confirmed yet.
const STATE_KEY = "telemetryState";
const CARD_KEY = "usageCardState";
const MAX_PENDING_DELETES = 20;
const REFRESH_AFTER_SUCCESS_MS = 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isSending = (s) => isObject(s) && s.enabled === true && isUuid(s.id) && s.consentVersion === 2;
const isLegacyOptIn = (s) =>
  isObject(s) && s.enabled === true && typeof s.id === "string" && s.id.length > 0 && s.consentVersion !== 2;
const pendingIds = (s) =>
  isObject(s) && Array.isArray(s.pendingDeleteIds)
    ? [...new Set(s.pendingDeleteIds.filter((x) => typeof x === "string" && x.length > 0))]
    : [];

const isTally = (t) =>
  isObject(t) &&
  typeof t.day === "string" &&
  isObject(t.engines) &&
  ENGINES.every((e) => typeof t.engines[e] === "boolean") &&
  Array.isArray(t.sites) &&
  t.sites.every((n) => Number.isInteger(n));

const signature = (tally) => `${ENGINES.map((e) => (tally.engines[e] ? 1 : 0)).join("")}:${tally.sites.length}`;

export function createUsage({
  storage,
  post,
  now = () => new Date(),
  version,
  randomUUID = () => globalThis.crypto.randomUUID(),
}) {
  let inFlight = null;
  // Serialises read-modify-write of the stored state so racing events cannot clobber each other.
  let chain = Promise.resolve();
  const exclusive = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };

  // First report of the day goes out at once; later changes to the day's engines or site count refresh that day's
  // row at most once an hour; a failed attempt is retried after five minutes.
  function shouldSend(state, tally, today, nowMs) {
    const sentToday = state.lastSentDay === today;
    if (sentToday && state.lastSentSig === signature(tally)) return false;
    if (typeof state.lastAttemptAt === "number") {
      const lastWasSuccess = state.lastSentAt === state.lastAttemptAt;
      const wait = sentToday && lastWasSuccess ? REFRESH_AFTER_SUCCESS_MS : RETRY_AFTER_FAILURE_MS;
      if (nowMs - state.lastAttemptAt < wait) return false;
    }
    return true;
  }

  async function doSend(today) {
    try {
      const state = await exclusive(() => storage.get(STATE_KEY));
      if (!isSending(state) || !isTally(state.tally) || state.tally.day !== today) return false;
      const report = buildReport({ id: state.id, version, tally: state.tally });
      if (!validateReport(report)) return false;
      const attemptedAt = now().getTime();
      let ok = false;
      try {
        const res = await post(INGEST_URL, report);
        ok = !!(res && res.ok);
      } catch (e) {
        ok = false;
      }
      await exclusive(async () => {
        const latest = await storage.get(STATE_KEY);
        if (!isSending(latest) || latest.id !== state.id) return;
        const next = { ...latest, lastAttemptAt: attemptedAt };
        if (ok) {
          next.lastSentDay = report.day;
          next.lastSentSig = signature(state.tally);
          next.lastSentAt = attemptedAt;
        }
        await storage.set(STATE_KEY, next);
      });
      return ok;
    } catch (e) {
      return false;
    }
  }

  function send(today) {
    if (!inFlight) {
      inFlight = doSend(today).finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  // Called by the worker when a page had dark mode applied. Never rejects.
  async function recordDarkApplied({ engine, host } = {}) {
    try {
      const current = now();
      const today = utcDay(current);
      const needsSend = await exclusive(async () => {
        const state = await storage.get(STATE_KEY);
        if (!isSending(state)) return false;
        const base = isTally(state.tally) && state.tally.day === today ? state.tally : emptyTally(today);
        const tally = recordSite(recordEngine(base, engine), host);
        const next = { ...state, tally };
        await storage.set(STATE_KEY, next);
        return shouldSend(next, tally, today, current.getTime());
      });
      if (needsSend) await send(today);
    } catch (e) {
      // never surface usage failures
    }
  }

  // Which card, if any, the side panel should show. A 2.0.x opt-in is asked to confirm; everyone else who has not
  // decided is asked once.
  async function status() {
    try {
      const state = await storage.get(STATE_KEY);
      if (isSending(state)) return { enabled: true, consentNeeded: null };
      if (isLegacyOptIn(state)) return { enabled: false, consentNeeded: "reconfirm" };
      const card = await storage.get(CARD_KEY);
      return { enabled: false, consentNeeded: isObject(card) && card.decided === true ? null : "ask" };
    } catch (e) {
      return { enabled: false, consentNeeded: null };
    }
  }

  async function postDelete(id) {
    try {
      const res = await post(DELETE_URL, { id });
      // A 400 means the server will never accept this ID, so retrying forever would only add noise.
      return !!(res && (res.ok || res.status === 400));
    } catch (e) {
      return false;
    }
  }

  // Posts a delete for every id, then forgets only the confirmed ones. The key is removed once nothing is left,
  // unless a newer opt-in is stored there, in which case only its pending list is cleaned.
  async function flushDeletes(ids) {
    // A report that was already on the wire must settle before the delete is posted.
    try {
      if (inFlight) await inFlight;
    } catch (e) {
      // ignore
    }
    const confirmed = [];
    for (const id of ids) {
      if (await postDelete(id)) confirmed.push(id);
    }
    if (confirmed.length) {
      try {
        await exclusive(async () => {
          const s = await storage.get(STATE_KEY);
          if (!isObject(s)) return;
          const rest = pendingIds(s).filter((x) => !confirmed.includes(x));
          if (rest.length) {
            await storage.set(STATE_KEY, { ...s, pendingDeleteIds: rest });
          } else if (s.enabled === true) {
            const { pendingDeleteIds, ...keep } = s;
            await storage.set(STATE_KEY, keep);
          } else {
            await storage.remove(STATE_KEY);
          }
        });
      } catch (e) {
        // the ids stay pending and are retried later (delete is idempotent)
      }
    }
    return confirmed.length === ids.length;
  }

  async function enable() {
    await exclusive(async () => {
      const prev = await storage.get(STATE_KEY);
      await storage.set(CARD_KEY, { decided: true });
      if (isSending(prev)) return;
      const pending = pendingIds(prev);
      if (isLegacyOptIn(prev)) {
        await storage.set(STATE_KEY, { ...prev, consentVersion: 2 });
        return;
      }
      let id = randomUUID();
      while (pending.includes(id)) id = randomUUID();
      await storage.set(STATE_KEY, {
        enabled: true,
        id,
        consentVersion: 2,
        lastSentDay: null,
        tally: null,
        ...(pending.length ? { pendingDeleteIds: pending } : {}),
      });
    });
    return { ok: true };
  }

  // Turning off stops everything first (inside the exclusive section), then deletes what the server holds.
  async function disable() {
    let ids = [];
    await exclusive(async () => {
      const prev = await storage.get(STATE_KEY);
      ids = pendingIds(prev);
      if (isObject(prev) && typeof prev.id === "string" && prev.id.length > 0 && !ids.includes(prev.id)) ids.push(prev.id);
      ids = ids.slice(-MAX_PENDING_DELETES);
      await storage.set(CARD_KEY, { decided: true });
      if (ids.length) {
        await storage.set(STATE_KEY, { enabled: false, pendingDeleteIds: ids });
      } else if (prev !== undefined && prev !== null) {
        await storage.remove(STATE_KEY);
      }
    });
    if (!ids.length) return { ok: true, nothingToDelete: true };
    return { ok: true, serverConfirmed: await flushDeletes(ids) };
  }

  async function setConsent(enabled) {
    try {
      return enabled === true ? await enable() : await disable();
    } catch (e) {
      return { ok: false };
    }
  }

  // Retries deletes that never got a confirmation. Called on worker start; never rejects.
  async function retryPendingDelete() {
    try {
      const ids = await exclusive(async () => pendingIds(await storage.get(STATE_KEY)));
      if (!ids.length) return { nothingToDelete: true };
      return { serverConfirmed: await flushDeletes(ids) };
    } catch (e) {
      return { serverConfirmed: false };
    }
  }

  return { setConsent, recordDarkApplied, status, retryPendingDelete };
}
