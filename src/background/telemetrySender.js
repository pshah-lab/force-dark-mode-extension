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

const STATE_KEY = "telemetryState";

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

  const readState = async () => {
    const s = await storage.get(STATE_KEY);
    return s && s.enabled === true && typeof s.id === "string" ? s : null;
  };

  const currentTally = (state, today) =>
    state.tally && state.tally.day === today ? state.tally : emptyTally(today);

  const heartbeatFor = (state, today) =>
    buildHeartbeat({ id: state.id, version, tally: currentTally(state, today), env: buildEnv(env()) });

  async function doSend() {
    try {
      const state = await readState();
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

  async function setConsent(enabled) {
    await exclusive(async () => {
      if (enabled === true) {
        const existing = await readState();
        if (existing) return;
        await storage.set(STATE_KEY, {
          enabled: true,
          id: globalThis.crypto.randomUUID(),
          lastSentDay: null,
          tally: null,
        });
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

  async function preview() {
    try {
      const state = await readState();
      if (!state) return { enabled: false, heartbeat: null };
      return { enabled: true, heartbeat: heartbeatFor(state, utcDay(now())) };
    } catch (e) {
      return { enabled: false, heartbeat: null };
    }
  }

  async function deleteMyData() {
    // Let any pending heartbeat and queued state writes settle first, so a late ingest cannot
    // recreate server data for an ID we have just asked to delete.
    try {
      if (inFlight) await inFlight;
    } catch (e) {
      // ignore
    }
    try {
      await chain;
    } catch (e) {
      // ignore
    }
    let id = null;
    try {
      const s = await storage.get(STATE_KEY);
      if (s && typeof s.id === "string") id = s.id;
    } catch (e) {
      id = null;
    }
    let serverConfirmed = false;
    if (id) {
      try {
        const res = await fetchFn(DELETE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        serverConfirmed = !!(res && res.ok);
      } catch (e) {
        serverConfirmed = false;
      }
    }
    try {
      await exclusive(() => storage.remove(STATE_KEY));
    } catch (e) {
      // ignore
    }
    return { serverConfirmed };
  }

  return { setConsent, recordUsage, send, preview, deleteMyData };
}
