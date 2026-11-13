// Lazy access to an open PDF's file data for the viewer's Tools control.
// Pure and node-testable: no DOM, no network, no storage. Nothing is read until the getter is called.

export const READ_ERROR_MESSAGE = "Could not read this PDF's data.";
export const READING_MESSAGE = "Reading the PDF…";

// read: async () => Uint8Array (for example the loaded PDF.js document's getData). Reads at most once at a time,
// caches a private copy, and hands every caller its own copy so a buffer PDF.js later detaches cannot matter.
// A failed read (rejects, throws, empty or not bytes) rejects with a readable error and is not cached.
export function createLazyBytes(read) {
  let cached = null;
  let pending = null;
  return async function getBytes() {
    if (!cached) {
      if (!pending) {
        pending = (async () => {
          try {
            const data = await read();
            if (!(data instanceof Uint8Array) || data.length === 0) throw new Error("empty");
            cached = data.slice();
          } catch {
            throw new Error(READ_ERROR_MESSAGE);
          } finally {
            pending = null;
          }
        })();
      }
      await pending;
    }
    return cached.slice();
  };
}

// Open-file PDFs: the viewer already holds the bytes.
export function createHeldBytes(bytes) {
  return async () => bytes;
}
