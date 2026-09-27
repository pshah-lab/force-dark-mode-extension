// tests/zip_reader_test.mjs
import assert from "assert";
import { listZipEntryNames, readZipEntryText } from "../src/shared/zipReader.js";

console.log("=========================================");
console.log("📦 Running ZIP Reader Tests");
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
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

function writeUint32(arr, offset, value) {
  new DataView(arr.buffer).setUint32(offset, value, true);
}
function writeUint16(arr, offset, value) {
  new DataView(arr.buffer).setUint16(offset, value, true);
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/**
 * Builds a real, minimal ZIP archive in memory for test fixtures.
 * entries: [{ name: string, data: Uint8Array, method: 0 | 8, generalPurposeFlag?: number }]
 */
async function buildZip(entries) {
  const parts = [];
  const centralParts = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const rawData = entry.data;
    const flag = entry.generalPurposeFlag ?? 0;
    const compressedData = entry.method === 8 ? await deflateRaw(rawData) : rawData;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, flag);
    writeUint16(localHeader, 8, entry.method);
    writeUint16(localHeader, 10, 0);
    writeUint16(localHeader, 12, 0);
    writeUint32(localHeader, 14, 0);
    writeUint32(localHeader, 18, compressedData.length);
    writeUint32(localHeader, 22, rawData.length);
    writeUint16(localHeader, 26, nameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    const localHeaderOffset = offset;
    parts.push(localHeader, compressedData);
    offset += localHeader.length + compressedData.length;

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, flag);
    writeUint16(centralHeader, 10, entry.method);
    writeUint16(centralHeader, 12, 0);
    writeUint16(centralHeader, 14, 0);
    writeUint32(centralHeader, 16, 0);
    writeUint32(centralHeader, 20, compressedData.length);
    writeUint32(centralHeader, 24, rawData.length);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, localHeaderOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const c of centralParts) {
    parts.push(c);
    centralDirSize += c.length;
    offset += c.length;
  }

  const eocd = new Uint8Array(22);
  writeUint32(eocd, 0, 0x06054b50);
  writeUint16(eocd, 4, 0);
  writeUint16(eocd, 6, 0);
  writeUint16(eocd, 8, entries.length);
  writeUint16(eocd, 10, entries.length);
  writeUint32(eocd, 12, centralDirSize);
  writeUint32(eocd, 16, centralDirOffset);
  writeUint16(eocd, 20, 0);
  parts.push(eocd);

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const p of parts) {
    result.set(p, pos);
    pos += p.length;
  }
  return result;
}

const enc = new TextEncoder();

await test("listZipEntryNames returns all entry names", async () => {
  const zip = await buildZip([
    { name: "word/document.xml", data: enc.encode("<w:document/>"), method: 8 },
    { name: "mimetype", data: enc.encode("stored"), method: 0 },
  ]);
  const names = await listZipEntryNames(zip);
  assert.deepStrictEqual(names, ["word/document.xml", "mimetype"]);
});

await test("readZipEntryText decompresses a deflate-raw entry", async () => {
  const zip = await buildZip([
    { name: "word/document.xml", data: enc.encode("<w:document>hello deflate</w:document>"), method: 8 },
  ]);
  const text = await readZipEntryText(zip, "word/document.xml");
  assert.strictEqual(text, "<w:document>hello deflate</w:document>");
});

await test("readZipEntryText reads a stored (uncompressed) entry", async () => {
  const zip = await buildZip([{ name: "mimetype", data: enc.encode("stored-no-compression"), method: 0 }]);
  const text = await readZipEntryText(zip, "mimetype");
  assert.strictEqual(text, "stored-no-compression");
});

await test("readZipEntryText returns null for a missing entry", async () => {
  const zip = await buildZip([{ name: "word/document.xml", data: enc.encode("x"), method: 0 }]);
  const text = await readZipEntryText(zip, "nope.xml");
  assert.strictEqual(text, null);
});

await test("readZipEntryText throws a distinct error for an encrypted entry", async () => {
  const zip = await buildZip([
    { name: "word/document.xml", data: enc.encode("secret"), method: 0, generalPurposeFlag: 0x1 },
  ]);
  await assert.rejects(async () => {
    await readZipEntryText(zip, "word/document.xml");
  }, /password-protected/);
});

await test("listZipEntryNames throws a clear error for a non-ZIP buffer", async () => {
  const notAZip = enc.encode("this is definitely not a zip file, no EOCD signature anywhere in here");
  await assert.rejects(async () => {
    await listZipEntryNames(notAZip);
  }, /Not a valid ZIP archive/);
});

await test("readZipEntryText's encrypted-entry error is tagged so callers can distinguish it from other failures", async () => {
  const zip = await buildZip([
    { name: "word/document.xml", data: enc.encode("secret"), method: 0, generalPurposeFlag: 0x1 },
  ]);
  try {
    await readZipEntryText(zip, "word/document.xml");
    assert.fail("expected readZipEntryText to throw");
  } catch (error) {
    assert.strictEqual(error.code, "ENCRYPTED");
  }
});

await test("a non-ZIP buffer's error is not tagged as ENCRYPTED", async () => {
  const notAZip = enc.encode("this is definitely not a zip file, no EOCD signature anywhere in here");
  try {
    await listZipEntryNames(notAZip);
    assert.fail("expected listZipEntryNames to throw");
  } catch (error) {
    assert.notStrictEqual(error.code, "ENCRYPTED");
  }
});

console.log("\n=========================================");
console.log(`🎉 ZIP Reader Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
