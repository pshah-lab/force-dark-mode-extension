// tests/pdftools_lazy_bytes_test.mjs - lazy, once-only PDF bytes getter for the viewer Tools control
import assert from "assert";
const queue = []; let passed = 0, failed = 0;
const test = (n, f) => queue.push({ n, f });
const mod = await import("../src/tools/lazyBytes.js").catch((e) => ({ loadError: e }));
const need = () => { if (mod.loadError) throw mod.loadError; return mod; };
const MSG = "Could not read this PDF's data.";

test("nothing is read until the getter is called", () => {
  const { createLazyBytes } = need();
  let calls = 0;
  createLazyBytes(async () => { calls += 1; return new Uint8Array([1]); });
  assert.strictEqual(calls, 0);
});
test("reads once, caches, and returns independent copies", async () => {
  const { createLazyBytes } = need();
  let calls = 0; const source = new Uint8Array([1, 2, 3]);
  const get = createLazyBytes(async () => { calls += 1; return source; });
  const a = await get(); const b = await get();
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual([...a], [1, 2, 3]);
  assert.notStrictEqual(a, b); assert.notStrictEqual(a.buffer, source.buffer);
  source.fill(9); // PDF.js detaching/mutating later must not touch the copy
  assert.deepStrictEqual([...await get()], [1, 2, 3]);
});
test("concurrent calls share one read", async () => {
  const { createLazyBytes } = need();
  let calls = 0;
  const get = createLazyBytes(async () => { calls += 1; return new Uint8Array([5]); });
  await Promise.all([get(), get(), get()]);
  assert.strictEqual(calls, 1);
});
test("rejecting, empty, non-bytes and throwing reads give the readable error and are retried", async () => {
  const { createLazyBytes } = need();
  for (const read of [async () => { throw new Error("destroyed"); }, async () => new Uint8Array(0), async () => null, async () => "x", () => { throw new Error("sync"); }]) {
    const get = createLazyBytes(read);
    await assert.rejects(get(), (e) => e.message === MSG);
  }
  let n = 0;
  const flaky = createLazyBytes(async () => { n += 1; if (n === 1) throw new Error("x"); return new Uint8Array([1]); });
  await assert.rejects(flaky(), (e) => e.message === MSG);
  assert.deepStrictEqual([...await flaky()], [1], "a failure is not cached");
});
test("held bytes are returned as-is without any read", async () => {
  const { createHeldBytes } = need();
  const held = new Uint8Array([7, 8]);
  assert.strictEqual(await createHeldBytes(held)(), held);
});
test("exports the message and status copy", () => {
  const m = need();
  assert.strictEqual(m.READ_ERROR_MESSAGE, MSG);
  assert.strictEqual(m.READING_MESSAGE, "Reading the PDF…");
});

for (const { n, f } of queue) { try { await f(); passed++; console.log("PASS", n); } catch (e) { failed++; console.log("FAIL", n, "\n", e.message); } }
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
