// tests/spreadsheet_errors_test.mjs
import assert from "assert";
import { readFileSync } from "fs";
import { isMemoryError } from "../src/viewer/spreadsheet/errors.js";
import { parseXlsx } from "../src/viewer/spreadsheet/xlsxParser.js";

console.log("=========================================");
console.log("🧯 Running Spreadsheet Error Classification Tests");
console.log("=========================================\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

const sample = new Uint8Array(readFileSync(new URL("../test-fixtures/sample.xlsx", import.meta.url)));

function findEocd(bytes) {
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i;
  }
  throw new Error("EOCD not found");
}

async function parseError(bytes) {
  try {
    await parseXlsx(bytes);
  } catch (error) {
    return error;
  }
  return null;
}

await test("corrupt EOCD central-directory offset is not classified as memory error", async () => {
  const bytes = sample.slice();
  const eocd = findEocd(bytes);
  new DataView(bytes.buffer).setUint32(eocd + 16, 0x7fffffff, true);
  const error = await parseError(bytes);
  assert.ok(error, "parseXlsx should reject a corrupt workbook");
  assert.strictEqual(isMemoryError(error), false, `misclassified: ${error.name}: ${error.message}`);
});

await test("corrupt local-header offset is not classified as memory error", async () => {
  const bytes = sample.slice();
  const view = new DataView(bytes.buffer);
  const eocd = findEocd(bytes);
  const cdStart = view.getUint32(eocd + 16, true);
  assert.strictEqual(view.getUint32(cdStart, true), 0x02014b50, "central directory signature");
  // Corrupt the local-header offset of every central-directory entry so the
  // corruption is hit regardless of which parts the parser reads.
  const entryCount = view.getUint16(eocd + 10, true);
  let pos = cdStart;
  for (let i = 0; i < entryCount; i++) {
    assert.strictEqual(view.getUint32(pos, true), 0x02014b50, "central directory entry signature");
    view.setUint32(pos + 42, 0x7fffffff, true);
    pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
  const error = await parseError(bytes);
  assert.ok(error, "parseXlsx should reject a corrupt workbook");
  assert.strictEqual(isMemoryError(error), false, `misclassified: ${error.name}: ${error.message}`);
});

await test("allocation failures are memory errors", () => {
  assert.strictEqual(isMemoryError(new RangeError("Array buffer allocation failed")), true);
  assert.strictEqual(isMemoryError(new RangeError("Invalid array length")), true);
  assert.strictEqual(isMemoryError(new RangeError("Invalid string length")), true);
});

await test("NotReadableError is a memory error", () => {
  const error = new Error("could not be read");
  error.name = "NotReadableError";
  assert.strictEqual(isMemoryError(error), true);
});

await test("DataView bounds RangeError is not a memory error", () => {
  assert.strictEqual(isMemoryError(new RangeError("Offset is outside the bounds of the DataView")), false);
});

await test("plain errors and nullish values are not memory errors", () => {
  assert.strictEqual(isMemoryError(new Error("x")), false);
  assert.strictEqual(isMemoryError(null), false);
  assert.strictEqual(isMemoryError(undefined), false);
});

console.log(`\n🎉 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
