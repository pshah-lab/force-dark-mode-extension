// Decides whether the side panel should show a one-time card after the extension was installed or updated.
export const WELCOME_KEY = "welcomeState";

const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

// details is the chrome.runtime.onInstalled payload. Returns the state to store, or null for nothing.
export function buildWelcomeState(details, version) {
  if (!details || typeof details !== "object" || typeof version !== "string" || !VERSION.test(version)) return null;
  if (details.reason === "install") return { kind: "new", version, seen: false };
  if (details.reason === "update" && typeof details.previousVersion === "string" && details.previousVersion !== version) {
    return { kind: "update", version, seen: false };
  }
  return null;
}
