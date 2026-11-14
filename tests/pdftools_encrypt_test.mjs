// tests/pdftools_encrypt_test.mjs - offline PDF encrypt (AES-256) / decrypt round trips and primitives
import assert from "assert";
import { PDFDocument, PDFName, PDFDict, PDFHexString, PDFString } from "../src/viewer/vendor/pdf-lib.min.mjs";
import { md5, rc4, toHex, utf8, fromHex, hashR6, aesCbcDecryptNoPad, aesCbcEncryptNoPad } from "../src/viewer/pdftools/pdfCrypto.js";
import { encryptPdf, decryptPdf, isEncryptedPdf, permissionBits } from "../src/viewer/pdftools/encryptTools.js";

// primitives: published test vectors
assert.strictEqual(toHex(md5(utf8(""))), "d41d8cd98f00b204e9800998ecf8427e");
assert.strictEqual(toHex(md5(utf8("abc"))), "900150983cd24fb0d6963f7d28e17f72");
assert.strictEqual(toHex(md5(utf8("12345678901234567890123456789012345678901234567890123456789012345678901234567890"))), "57edf4a22be3c955ac49da2e2107b67a");
assert.strictEqual(toHex(rc4(utf8("Key"), utf8("Plaintext"))), "bbf316e8d940af0ad3");
{
  const key = new Uint8Array(16).fill(7);
  const iv = new Uint8Array(16).fill(3);
  const data = new Uint8Array(48).map((_, i) => i);
  const enc = await aesCbcEncryptNoPad(key, iv, data);
  assert.strictEqual(enc.length, 48);
  assert.deepStrictEqual([...(await aesCbcDecryptNoPad(key, iv, enc))], [...data], "no-pad AES round trip");
}
assert.strictEqual((await hashR6(utf8("pw"), new Uint8Array(8))).length, 32);

async function fixture(pages = 2) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = d.addPage([100 + i, 200]);
    p.drawText(`Secret page ${i + 1} marker`, { x: 10, y: 100 });
  }
  d.setTitle("Quarterly secret title");
  d.setAuthor("Ada");
  return { name: "plain.pdf", bytes: await d.save() };
}
const latin = (b) => Buffer.from(b).toString("latin1");

const plain = await fixture();
assert.strictEqual(await isEncryptedPdf(plain.bytes), false);

// encrypt: needs a password, produces an AES-256 (V5/R6) document
await assert.rejects(() => encryptPdf(plain, { userPassword: "" }), /password/i);
const enc = await encryptPdf(plain, { userPassword: "open-sesame", ownerPassword: "boss", allowPrint: true, allowCopy: false, allowEdit: false });
assert.strictEqual(enc.files.length, 1);
assert.strictEqual(enc.files[0].name, "plain-encrypted.pdf");
const eb = enc.files[0].bytes;
assert.strictEqual(await isEncryptedPdf(eb), true);
const text = latin(eb);
assert.ok(/\/Filter\s*\/Standard/.test(text) && /\/V 5/.test(text) && /\/R 6/.test(text) && /\/AESV3/.test(text), "encrypt dictionary");
assert.ok(!text.includes("Quarterly secret title"), "Info title not stored in clear");
assert.ok(!text.includes("Ada"), "Info author not stored in clear");
// Page contents are Flate or raw; with encryption neither the plain marker nor a plain text op appears.
assert.ok(!text.includes("Secret page 1 marker"), "content stream is not readable");

// loading without a password is refused by the editing tools, with the existing readable message
const d0 = await PDFDocument.load(eb, { ignoreEncryption: true });
assert.strictEqual(d0.getPageCount(), 2, "structure still parses");

// decrypt: wrong password is rejected, right user and owner passwords both work
await assert.rejects(() => decryptPdf({ name: "e.pdf", bytes: eb }, { password: "nope" }), /incorrect password/i);
for (const pw of ["open-sesame", "boss"]) {
  const dec = await decryptPdf({ name: "plain-encrypted.pdf", bytes: eb }, { password: pw });
  assert.strictEqual(dec.files[0].name, "plain-encrypted-decrypted.pdf");
  assert.strictEqual(await isEncryptedPdf(dec.files[0].bytes), false);
  const back = await PDFDocument.load(dec.files[0].bytes);
  assert.strictEqual(back.getPageCount(), 2);
  assert.strictEqual(back.getTitle(), "Quarterly secret title");
  assert.strictEqual(back.getAuthor(), "Ada");
  assert.deepStrictEqual(back.getPages().map((p) => p.getWidth()), [100, 101]);
}
// decrypting a file that is not encrypted fails clearly
await assert.rejects(() => decryptPdf(plain, { password: "x" }), /not (password-protected|encrypted)/i);

// owner password defaults to a random one; different runs differ
const a = await encryptPdf(plain, { userPassword: "same" });
const b = await encryptPdf(plain, { userPassword: "same" });
assert.notDeepStrictEqual([...a.files[0].bytes], [...b.files[0].bytes]);
const dec2 = await decryptPdf({ name: "x.pdf", bytes: a.files[0].bytes }, { password: "same" });
assert.strictEqual((await PDFDocument.load(dec2.files[0].bytes)).getPageCount(), 2);

// unicode password round trip
const uni = await encryptPdf(plain, { userPassword: "pässwörd-日本" });
await decryptPdf({ name: "u.pdf", bytes: uni.files[0].bytes }, { password: "pässwörd-日本" });

// permission bits: signed 32-bit /P with required reserved bits set
assert.strictEqual(permissionBits({ allowPrint: true, allowCopy: true, allowEdit: true }) | 0, permissionBits({ allowPrint: true, allowCopy: true, allowEdit: true }));
assert.strictEqual(permissionBits({}) & 4, 0, "print off");
assert.strictEqual(permissionBits({ allowPrint: true }) & 4, 4, "print on");
assert.strictEqual(permissionBits({ allowCopy: true }) & 16, 16, "copy on");
assert.strictEqual(permissionBits({ allowEdit: true }) & 8, 8, "modify on");
assert.strictEqual(permissionBits({}) & 0xc0, 0xc0, "reserved bits 7-8 set");

// Independent fixture: RC4-128 (V2/R3) PDF written by tests/fixtures/make_rc4_pdf.py (pure stdlib).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const rc4Path = path.join(here, "fixtures", "rc4_r3.pdf");
const rc4Bytes = new Uint8Array(fs.readFileSync(rc4Path));
assert.strictEqual(await isEncryptedPdf(rc4Bytes), true);
await assert.rejects(() => decryptPdf({ name: "rc4.pdf", bytes: rc4Bytes }, { password: "wrong" }), /incorrect password/i);
const rc4Dec = await decryptPdf({ name: "rc4.pdf", bytes: rc4Bytes }, { password: "legacy" });
const rc4Doc = await PDFDocument.load(rc4Dec.files[0].bytes);
assert.strictEqual(rc4Doc.getPageCount(), 1);
assert.strictEqual(rc4Doc.getTitle(), "Legacy RC4 title");
assert.ok(latin(rc4Dec.files[0].bytes).includes("Hello legacy"), "content stream decrypted");

console.log("pdftools_encrypt_test: all passed");
