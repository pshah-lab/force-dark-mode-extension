// Opt-in anonymous usage metrics: consent state, daily heartbeat and delete.
// This is the ONLY file in the extension that performs network I/O for telemetry.
// Nothing is created or sent until setConsent(true). Every heartbeat is checked with
// validateHeartbeat immediately before sending; a failing heartbeat is never sent.
import {
  utcDay,
  emptyTally,
  sanitizeUsage,
  recordUsage as applyUsage,
  buildEnv,
  buildHeartbeat,
  validateHeartbeat,
} from "../shared/telemetry.js";

export const INGEST_URL = "https://pshah.fun/api/darkmode-telemetry";
export const DELETE_URL = "https://pshah.fun/api/darkmode-telemetry-delete";
// Placeholder id for the example report shown before opt-in. Validly shaped, obviously fake,
// never stored and never sent.
export const EXAMPLE_ID = "00000000-0000-4000-8000-000000000000";

const STATE_KEY = "telemetryState";
// Install ids whose server deletion has not been confirmed yet. Kept only so the delete can be
// retried; they are never put in a heartbeat and never re-used as the reporting id.
const MAX_PENDING_DELETES = 20;

export function createTelemetry({
  storage,
  fetchFn = (...a) => globalThis.fetch(...a),
  now = () => new Date(),
  version,
  env = () => ({ userAgent: "", lang: "" }),
}) {
  let inFlight = null;
  // Serialises read-modify-write of the stored state so racing events cannot clobber each other.
  let chain = Promise.resolve();
  const exclusive = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };

  const isEnabled = (s) => !!(s && s.enabled === true && typeof s.id === "string");
  // Only an enabled state is ever used for sending; {enabled:false, pendingDeleteIds} reads as null.
  const readState = async () => {
    const s = await storage.get(STATE_KEY);
    return isEnabled(s) ? s : null;
  };
  const pendingIds = (s) =>
    s && typeof s === "object" && Array.isArray(s.pendingDeleteIds)
      ? [...new Set(s.pendingDeleteIds.filter((x) => typeof x === "string" && x.length > 0))]
      : [];

  const currentTally = (state, today) =>
    state.tally && state.tally.day === today ? state.tally : emptyTally(today);

  const heartbeatFor = (state, today) =>
    buildHeartbeat({ id: state.id, version, tally: currentTally(state, today), env: buildEnv(env()) });

  async function doSend() {
    try {
      // Checked inside the exclusive section so it is ordered against deleteMyData/setConsent.
      const state = await exclusive(readState);
      if (!state) return false;
      const today = utcDay(now());
      const heartbeat = heartbeatFor(state, today);
      if (!validateHeartbeat(heartbeat)) return false;
      const res = await fetchFn(INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(heartbeat),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!res || !res.ok) return false;
      await exclusive(async () => {
        const latest = await readState();
        if (latest && latest.id === state.id) {
          await storage.set(STATE_KEY, { ...latest, lastSentDay: heartbeat.day });
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  function send() {
    if (!inFlight) {
      inFlight = doSend().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  // Opting in always creates a NEW id. Opting out discards the id (spec). In both cases any ids
  // still waiting for a confirmed server delete are carried over so the delete is not lost.
  async function setConsent(enabled) {
    await exclusive(async () => {
      const prev = await storage.get(STATE_KEY);
      const pending = pendingIds(prev);
      if (enabled === true) {
        if (isEnabled(prev)) return;
        let id = globalThis.crypto.randomUUID();
        while (pending.includes(id)) id = globalThis.crypto.randomUUID();
        await storage.set(STATE_KEY, {
          enabled: true,
          id,
          lastSentDay: null,
          tally: null,
          ...(pending.length ? { pendingDeleteIds: pending } : {}),
        });
      } else if (pending.length) {
        await storage.set(STATE_KEY, { enabled: false, pendingDeleteIds: pending });
      } else {
        await storage.remove(STATE_KEY);
      }
    });
  }

  async function recordUsage(msg) {
    try {
      const usage = sanitizeUsage(msg);
      if (!usage) return;
      const today = utcDay(now());
      const needsSend = await exclusive(async () => {
        const state = await readState();
        if (!state) return false;
        const tally = applyUsage(currentTally(state, today), usage);
        await storage.set(STATE_KEY, { ...state, tally });
        return state.lastSentDay !== today;
      });
      if (!needsSend) return;
      // Re-check: a racing event may have completed the day's send while we queued.
      const latest = await readState();
      if (latest && latest.lastSentDay !== today) await send();
    } catch (e) {
      // never surface telemetry failures
    }
  }

  // Read-only: never writes storage, never creates an id, never sends. When usage stats are off
  // it returns an example report (empty tally for today, placeholder id) so the user can see the
  // shape of what would be sent before opting in.
  async function preview() {
    try {
      const state = await readState();
      const today = utcDay(now());
      if (!state) {
        return { enabled: false, heartbeat: heartbeatFor({ id: EXAMPLE_ID, tally: null }, today), example: true };
      }
      return { enabled: true, heartbeat: heartbeatFor(state, today) };
    } catch (e) {
      return { enabled: false, heartbeat: null };
    }
  }

  async function postDelete(id) {
    try {
      const res = await fetchFn(DELETE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      return !!(res && res.ok);
    } catch (e) {
      return false;
    }
  }

  // Posts a delete for every id, then removes only the confirmed ones from pendingDeleteIds.
  // Never touches the enabled state of a later opt-in; the key is removed only when nothing is left.
  async function flushDeletes(ids) {
    // A heartbeat that was already on the wire must settle before the delete is posted.
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
          if (!s || typeof s !== "object") return;
          const rest = pendingIds(s).filter((x) => !confirmed.includes(x));
          if (rest.length) {
            await storage.set(STATE_KEY, { ...s, pendingDeleteIds: rest });
          } else if (isEnabled(s)) {
            const { pendingDeleteIds, ...keep } = s;
            await storage.set(STATE_KEY, keep);
          } else {
            await storage.remove(STATE_KEY);
          }
        });
      } catch (e) {
        // ignore: the ids stay pending and are retried later (delete is idempotent)
      }
    }
    return confirmed.length === ids.length;
  }

  // Retries deletes that never got a 2xx. Called on worker start; never rejects.
  async function retryPendingDelete() {
    let ids = [];
    try {
      ids = await exclusive(async () => pendingIds(await storage.get(STATE_KEY)));
    } catch (e) {
      return { serverConfirmed: false };
    }
    if (!ids.length) return { serverConfirmed: false, nothingToDelete: true };
    return { serverConfirmed: await flushDeletes(ids) };
  }

  async function deleteMyData() {
    // Disable local telemetry first, inside the exclusive section, so any recordUsage/send that
    // starts from now on is a no-op and cannot re-create server data. The current id joins any ids
    // still pending from an earlier failed delete; all of them are kept until the server confirms.
    let ids = [];
    try {
      await exclusive(async () => {
        let s;
        try {
          s = await storage.get(STATE_KEY);
        } catch (e) {
          // Cannot read the id; still make sure nothing more is sent (best effort).
          try {
            await storage.remove(STATE_KEY);
          } catch (e2) {
            // ignore
          }
          throw e;
        }
        ids = pendingIds(s);
        if (s && typeof s === "object" && typeof s.id === "string" && !ids.includes(s.id)) ids.push(s.id);
        ids = ids.slice(-MAX_PENDING_DELETES);
        if (ids.length) {
          try {
            await storage.set(STATE_KEY, { enabled: false, pendingDeleteIds: ids });
          } catch (e) {
            await storage.remove(STATE_KEY);
          }
        } else if (s !== undefined && s !== null) {
          await storage.remove(STATE_KEY);
        }
      });
    } catch (e) {
      if (!ids.length) return { serverConfirmed: false };
    }
    if (!ids.length) return { serverConfirmed: false, nothingToDelete: true };
    return { serverConfirmed: await flushDeletes(ids) };
  }

  return { setConsent, recordUsage, send, preview, deleteMyData, retryPendingDelete };
}

// Routes the four telemetry message types. Returns undefined for any other message so the
// caller can fall through; otherwise a Promise of the reply. The caller must already have
// verified sender.id === chrome.runtime.id. Never rejects.
export function handleTelemetryMessage(telemetry, msg) {
  if (!msg || typeof msg !== "object") return undefined;
  switch (msg.type) {
    case "USAGE": {
      // sanitizeUsage accepts exactly one key, so the routing "type" must not reach it.
      const { type, ...usage } = msg;
      return telemetry.recordUsage(usage).then(() => ({ ok: true }), () => ({ ok: false }));
    }
    case "TELEMETRY_CONSENT":
      if (typeof msg.enabled !== "boolean") return Promise.resolve({ ok: false });
      return telemetry.setConsent(msg.enabled === true).then(() => ({ ok: true }), () => ({ ok: false }));
    case "TELEMETRY_STATUS":
      return telemetry.preview().catch(() => ({ enabled: false, heartbeat: null }));
    case "TELEMETRY_DELETE":
      return telemetry.deleteMyData().catch(() => ({ serverConfirmed: false }));
    default:
      return undefined;
  }
}
