// tests/zip_writer_test.mjs
import assert from "assert";
import { crc32, createZip } from "../src/viewer/convert/zipWriter.js";
import { listZipEntryNames, readZipEntryText } from "../src/shared/zipReader.js";

console.log("=========================================");
console.log("🗜️  Running ZIP Writer Tests");
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

await test("crc32 matches the standard check value", () => {
  assert.strictEqual(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.strictEqual(crc32(new Uint8Array(0)), 0);
});

await test("round-trips text entries through the existing zip reader", async () => {
  const zip = createZip([
    { name: "a.txt", data: "hello" },
    { name: "dir/b.csv", data: "x,y\r\n1,2\r\n" },
  ]);
  assert.ok(zip instanceof Uint8Array);
  assert.deepStrictEqual(await listZipEntryNames(zip), ["a.txt", "dir/b.csv"]);
  assert.strictEqual(await readZipEntryText(zip, "a.txt"), "hello");
  assert.strictEqual(await readZipEntryText(zip, "dir/b.csv"), "x,y\r\n1,2\r\n");
});

await test("stores Unicode names and content as UTF-8 with the UTF-8 flag set", async () => {
  const zip = createZip([{ name: "café-日本.txt", data: "naïve 🌙" }]);
  assert.deepStrictEqual(await listZipEntryNames(zip), ["café-日本.txt"]);
  assert.strictEqual(await readZipEntryText(zip, "café-日本.txt"), "naïve 🌙");
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.strictEqual(view.getUint16(6, true) & 0x0800, 0x0800, "general purpose bit 11 (UTF-8) set");
  assert.strictEqual(view.getUint16(8, true), 0, "store-only (method 0)");
});

await test("binary entries keep their bytes and CRC in both headers", async () => {
  const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 1, 2]);
  const zip = createZip([{ name: "p.png", data }]);
  const view = new DataView(zip.buffer);
  assert.strictEqual(view.getUint32(14, true), crc32(data), "local header CRC");
  assert.strictEqual(view.getUint32(18, true), data.length);
  const nameLen = view.getUint16(26, true);
  assert.deepStrictEqual([...zip.subarray(30 + nameLen, 30 + nameLen + data.length)], [...data]);
  const cd = 30 + nameLen + data.length;
  assert.strictEqual(view.getUint32(cd, true), 0x02014b50);
  assert.strictEqual(view.getUint32(cd + 16, true), crc32(data), "central directory CRC");
});

await test("empty archive is a valid 22-byte EOCD", async () => {
  const zip = createZip([]);
  assert.strictEqual(zip.length, 22);
  assert.deepStrictEqual(await listZipEntryNames(zip), []);
});

await test("rejects duplicate or unsafe entry names", () => {
  assert.throws(() => createZip([{ name: "a", data: "" }, { name: "a", data: "" }]));
  assert.throws(() => createZip([{ name: "../evil", data: "" }]));
  assert.throws(() => createZip([{ name: "/abs", data: "" }]));
  assert.throws(() => createZip([{ name: "", data: "" }]));
});

console.log(`\n🎉 ZIP writer tests complete. Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
