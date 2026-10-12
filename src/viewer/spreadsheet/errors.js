// Classifies parse-stage failures. Only genuine allocation failures count as
// "out of memory"; a RangeError from a bad zip offset (DataView bounds) is corruption.
const MEMORY_MESSAGE = /memory|allocat|Invalid (string|array|typed array|array buffer) length/i;

export function isMemoryError(error) {
  if (!error) return false;
  if (error.name === "NotReadableError") return true;
  if (error instanceof RangeError || error instanceof Error) {
    return MEMORY_MESSAGE.test(String(error.message));
  }
  return false;
}
