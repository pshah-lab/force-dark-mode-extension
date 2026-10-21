// tests/zip_reader_test.mjs
import assert from "assert";
import fs from "fs";
import { fileURLToPath } from "url";
import { listZipEntryNames, readZipEntryText, readZipEntryTextOrNull } from "../src/shared/zipReader.js";

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

await test("readZipEntryText rejects with TOO_LARGE and a bounded partialText for an oversize deflate entry", async () => {
  const zip = await buildZip([{ name: "big.xml", data: enc.encode("a".repeat(5000)), method: 8 }]);
  const error = await readZipEntryText(zip, "big.xml", { maxEntrySize: 1000 }).catch((e) => e);
  assert.ok(error instanceof Error);
  assert.strictEqual(error.code, "TOO_LARGE");
  assert.strictEqual(error.partialText, "a".repeat(1000));
});

await test("readZipEntryText rejects with TOO_LARGE for an oversize stored entry", async () => {
  const zip = await buildZip([{ name: "big.xml", data: enc.encode("b".repeat(300)), method: 0 }]);
  const error = await readZipEntryText(zip, "big.xml", { maxEntrySize: 100 }).catch((e) => e);
  assert.strictEqual(error.code, "TOO_LARGE");
  assert.strictEqual(error.partialText, "b".repeat(100));
});

await test("readZipEntryText reads an entry exactly at the cap", async () => {
  const zip = await buildZip([{ name: "ok.xml", data: enc.encode("c".repeat(100)), method: 8 }]);
  assert.strictEqual(await readZipEntryText(zip, "ok.xml", { maxEntrySize: 100 }), "c".repeat(100));
});

await test("readZipEntryText still throws ENCRYPTED when a size cap is given", async () => {
  const zip = await buildZip([
    { name: "s.xml", data: enc.encode("secret"), method: 0, generalPurposeFlag: 0x1 },
  ]);
  const error = await readZipEntryText(zip, "s.xml", { maxEntrySize: 1000 }).catch((e) => e);
  assert.strictEqual(error.code, "ENCRYPTED");
});

await test("readZipEntryTextOrNull returns null for an oversize entry (slide is skipped)", async () => {
  const zip = await buildZip([{ name: "ppt/slides/slide1.xml", data: enc.encode("d".repeat(5000)), method: 8 }]);
  assert.strictEqual(await readZipEntryTextOrNull(zip, "ppt/slides/slide1.xml", { maxEntrySize: 1000 }), null);
});

await test("readZipEntryTextOrNull returns text for a normal entry and null for a missing one", async () => {
  const zip = await buildZip([{ name: "a.xml", data: enc.encode("hello"), method: 8 }]);
  assert.strictEqual(await readZipEntryTextOrNull(zip, "a.xml"), "hello");
  assert.strictEqual(await readZipEntryTextOrNull(zip, "nope.xml"), null);
});

await test("readZipEntryTextOrNull still propagates ENCRYPTED", async () => {
  const zip = await buildZip([
    { name: "s.xml", data: enc.encode("secret"), method: 0, generalPurposeFlag: 0x1 },
  ]);
  const error = await readZipEntryTextOrNull(zip, "s.xml").catch((e) => e);
  assert.strictEqual(error.code, "ENCRYPTED");
});

// ---- Decompression-amplification hardening (overlapping entries, archive budget) ----

// Hostile archive: ONE small deflate stream, many central-directory entries that all
// point at its local header (the "zip quine"/overlap amplification shape).
async function buildSharedStreamZip(names, rawData) {
  const enc = new TextEncoder();
  const compressed = await deflateRaw(rawData);
  const firstName = enc.encode(names[0]);
  const local = new Uint8Array(30 + firstName.length);
  writeUint32(local, 0, 0x04034b50);
  writeUint16(local, 4, 20);
  writeUint16(local, 8, 8);
  writeUint32(local, 18, compressed.length);
  writeUint32(local, 22, rawData.length);
  writeUint16(local, 26, firstName.length);
  local.set(firstName, 30);

  const parts = [local, compressed];
  let offset = local.length + compressed.length;
  const centralStart = offset;
  for (const name of names) {
    const nameBytes = enc.encode(name);
    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 10, 8);
    writeUint32(central, 20, compressed.length);
    writeUint32(central, 24, rawData.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint32(central, 42, 0); // every entry shares the one local header at offset 0
    central.set(nameBytes, 46);
    parts.push(central);
    offset += central.length;
  }
  const eocd = new Uint8Array(22);
  writeUint32(eocd, 0, 0x06054b50);
  writeUint16(eocd, 8, names.length);
  writeUint16(eocd, 10, names.length);
  writeUint32(eocd, 12, offset - centralStart);
  writeUint32(eocd, 16, centralStart);
  parts.push(eocd);

  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function eocdCentralOffset(zip) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  return view.getUint32(zip.length - 22 + 16, true);
}

await test("an archive whose entries share one local header is rejected as OVERLAPPING_ENTRIES", async () => {
  const names = Array.from({ length: 50 }, (_, i) => `ppt/slides/slide${i + 1}.xml`);
  const zip = await buildSharedStreamZip(names, enc.encode("a".repeat(100000)));
  const listError = await listZipEntryNames(zip).catch((e) => e);
  assert.ok(listError instanceof Error, "listing should reject");
  assert.strictEqual(listError.code, "OVERLAPPING_ENTRIES");
  const readError = await readZipEntryText(zip, "ppt/slides/slide7.xml").catch((e) => e);
  assert.strictEqual(readError.code, "OVERLAPPING_ENTRIES");
});

await test("readZipEntryTextOrNull does not swallow OVERLAPPING_ENTRIES", async () => {
  const names = ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"];
  const zip = await buildSharedStreamZip(names, enc.encode("a".repeat(1000)));
  const error = await readZipEntryTextOrNull(zip, "ppt/slides/slide1.xml").catch((e) => e);
  assert.strictEqual(error.code, "OVERLAPPING_ENTRIES");
});

await test("an entry whose claimed data range covers the next entry is rejected as OVERLAPPING_ENTRIES", async () => {
  const zip = await buildZip([
    { name: "a.xml", data: enc.encode("a".repeat(200)), method: 0 },
    { name: "b.xml", data: enc.encode("b".repeat(200)), method: 0 },
  ]);
  // Inflate a.xml's claimed compressedSize so its data range runs over b.xml's local header.
  writeUint32(zip, eocdCentralOffset(zip) + 20, 400);
  const error = await listZipEntryNames(zip).catch((e) => e);
  assert.strictEqual(error.code, "OVERLAPPING_ENTRIES");
});

await test("adjacent, non-overlapping entries (including empty ones) are still accepted", async () => {
  const zip = await buildZip([
    { name: "dir/", data: new Uint8Array(0), method: 0 },
    { name: "a.xml", data: enc.encode("alpha"), method: 8 },
    { name: "empty.xml", data: new Uint8Array(0), method: 0 },
    { name: "b.xml", data: enc.encode("beta"), method: 0 },
  ]);
  assert.deepStrictEqual(await listZipEntryNames(zip), ["dir/", "a.xml", "empty.xml", "b.xml"]);
  assert.strictEqual(await readZipEntryText(zip, "a.xml"), "alpha");
  assert.strictEqual(await readZipEntryText(zip, "b.xml"), "beta");
});

await test("decompressed output is capped per archive: a later read hits the cumulative budget (TOO_LARGE)", async () => {
  const zip = await buildZip([
    { name: "one.xml", data: enc.encode("a".repeat(1000)), method: 8 },
    { name: "two.xml", data: enc.encode("b".repeat(1000)), method: 8 },
    { name: "three.xml", data: enc.encode("c".repeat(1000)), method: 8 },
  ]);
  const options = { maxTotalSize: 2500 };
  assert.strictEqual(await readZipEntryText(zip, "one.xml", options), "a".repeat(1000));
  assert.strictEqual(await readZipEntryText(zip, "two.xml", options), "b".repeat(1000));
  const error = await readZipEntryText(zip, "three.xml", options).catch((e) => e);
  assert.ok(error instanceof Error, "third read should exceed the budget");
  assert.strictEqual(error.code, "TOO_LARGE");
  assert.strictEqual(error.partialText, "c".repeat(500));
});

await test("once the archive budget is spent every further read is TOO_LARGE with no output", async () => {
  const zip = await buildZip([
    { name: "one.xml", data: enc.encode("a".repeat(1000)), method: 8 },
    { name: "two.xml", data: enc.encode("b".repeat(10)), method: 8 },
    { name: "three.xml", data: enc.encode("c".repeat(10)), method: 0 },
  ]);
  const options = { maxTotalSize: 1000 };
  assert.strictEqual(await readZipEntryText(zip, "one.xml", options), "a".repeat(1000));
  for (const name of ["two.xml", "three.xml", "two.xml"]) {
    const error = await readZipEntryText(zip, name, options).catch((e) => e);
    assert.strictEqual(error.code, "TOO_LARGE", name);
    assert.strictEqual(error.partialText, "", name);
  }
  assert.strictEqual(await readZipEntryTextOrNull(zip, "two.xml", options), null);
});

await test("re-reading the same entry is charged against the archive budget", async () => {
  const zip = await buildZip([{ name: "a.xml", data: enc.encode("a".repeat(600)), method: 8 }]);
  const options = { maxTotalSize: 1000 };
  assert.strictEqual(await readZipEntryText(zip, "a.xml", options), "a".repeat(600));
  const error = await readZipEntryText(zip, "a.xml", options).catch((e) => e);
  assert.strictEqual(error.code, "TOO_LARGE");
  assert.strictEqual(error.partialText, "a".repeat(400));
});

await test("the decompression budget is per archive, not global", async () => {
  const entries = [{ name: "a.xml", data: enc.encode("a".repeat(800)), method: 8 }];
  const options = { maxTotalSize: 1000 };
  const first = await buildZip(entries);
  const second = await buildZip(entries);
  assert.strictEqual(await readZipEntryText(first, "a.xml", options), "a".repeat(800));
  assert.strictEqual(await readZipEntryText(second, "a.xml", options), "a".repeat(800));
});

await test("the default per-archive budget is far above any real document", async () => {
  const zip = await buildZip([{ name: "big.xml", data: enc.encode("x".repeat(2_000_000)), method: 8 }]);
  for (let i = 0; i < 5; i += 1) {
    assert.strictEqual((await readZipEntryText(zip, "big.xml")).length, 2_000_000);
  }
});

await test("the central directory is parsed once per archive, not once per read", async () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({ name: `e${i}.xml`, data: enc.encode("x"), method: 0 }));
  const zip = await buildZip(entries);
  const RealTextDecoder = globalThis.TextDecoder;
  let constructed = 0;
  globalThis.TextDecoder = class extends RealTextDecoder {
    constructor(...args) {
      super(...args);
      constructed += 1;
    }
  };
  try {
    for (let i = 0; i < 50; i += 1) {
      await readZipEntryText(zip, "missing.xml");
    }
    await listZipEntryNames(zip);
  } finally {
    globalThis.TextDecoder = RealTextDecoder;
  }
  // One parse (about 200 names) is allowed; 51 parses would be about 10,000.
  assert.ok(constructed < 1000, `central directory re-parsed on every call (${constructed} decoders)`);
});

await test("the repository's sample .docx/.pptx/.xlsx fixtures still list and read in full", async () => {
  const fixtures = fileURLToPath(new URL("../test-fixtures/", import.meta.url));
  for (const file of ["sample.docx", "sample.pptx", "sample.xlsx"]) {
    const bytes = new Uint8Array(fs.readFileSync(fixtures + file));
    const names = await listZipEntryNames(bytes);
    assert.ok(names.length > 0, file);
    let readable = 0;
    for (const name of names) {
      const text = await readZipEntryText(bytes, name);
      if (text !== null) readable += 1;
    }
    assert.ok(readable > 0, `${file} has no readable entries`);
  }
});

console.log("\n=========================================");
console.log(`🎉 ZIP Reader Results: ${passed} passed, ${failed} failed`);
console.log("=========================================\n");

if (failed > 0) {
  process.exit(1);
}
