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

  async function deleteMyData() {
    // Read the id and disable local telemetry first, inside the exclusive section, so any
    // recordUsage/send that starts from now on is a no-op and cannot re-create server data.
    let id = null;
    try {
      await exclusive(async () => {
        const s = await storage.get(STATE_KEY);
        if (s && typeof s.id === "string") id = s.id;
        await storage.remove(STATE_KEY);
      });
    } catch (e) {
      // ignore
    }
    // A heartbeat that was already on the wire must settle before the delete is posted.
    try {
      if (inFlight) await inFlight;
    } catch (e) {
      // ignore
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
      // Retry only if the first removal failed; never wipe a state created by a later opt-in.
      await exclusive(async () => {
        const s = await storage.get(STATE_KEY);
        if (s && s.id === id) await storage.remove(STATE_KEY);
      });
    } catch (e) {
      // ignore
    }
    return { serverConfirmed };
  }

  return { setConsent, recordUsage, send, preview, deleteMyData };
}

// Routes the four telemetry message types. Returns undefined for any other message so the
// caller can fall through; otherwise a Promise of the reply. The caller must already have
// verified sender.id === chrome.runtime.id. Never rejects.
export function handleTelemetryMessage(telemetry, msg) {
  if (!msg || typeof msg !== "object") return undefined;
  switch (msg.type) {
    case "USAGE":
      return telemetry.recordUsage(msg).then(() => ({ ok: true }), () => ({ ok: false }));
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
