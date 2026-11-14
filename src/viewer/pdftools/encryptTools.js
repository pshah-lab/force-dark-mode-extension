// Encrypt / decrypt PDFs entirely offline. DOM-free, no network.
// Encrypt writes the PDF 2.0 standard security handler (AES-256, V5 / revision 6) using WebCrypto.
// Decrypt opens AES-256 (R6) files and the older RC4 / AES-128 handlers (R2-R4) when the password is
// right. Limits: pdf-lib cannot read encrypted files that store objects in compressed object streams,
// and a saved PDF's owner permissions are only advice that viewers may ignore.
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFRawStream, PDFStream, PDFString, PDFHexString, PDFNumber, PDFBool,
} from "../vendor/pdf-lib.min.mjs";
import { exportFileName } from "../convert/exportFormats.js";
import { makeResult, PDF_MIME } from "./result.js";
import { loadPdf } from "./loadPdf.js";
import {
  md5, rc4, randomBytes, concat, utf8, toHex, fromHex, equalBytes, hashR6,
  aesCbcEncryptNoPad, aesCbcDecryptNoPad, aesEncryptWithIv, aesDecryptWithIv,
} from "./pdfCrypto.js";

const LOAD_OPTS = { updateMetadata: false, ignoreEncryption: true };
const N = (s) => PDFName.of(s);
const PAD = fromHex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A");
const MAX_PASSWORD_BYTES = 127;

// PDF /P value. Bits: 3 print, 4 modify, 5 copy, 6 annotate; 7-8 and 13-32 are reserved and set.
export function permissionBits({ allowPrint = false, allowCopy = false, allowEdit = false } = {}) {
  let p = 0xfffff0c0;
  if (allowPrint) p |= 4 | 2048;
  if (allowEdit) p |= 8 | 32 | 256 | 1024;
  if (allowCopy) p |= 16 | 512;
  return p | 0;
}

const passwordBytes = (pw) => utf8(String(pw == null ? "" : pw).normalize("NFC")).slice(0, MAX_PASSWORD_BYTES);
const bytesOf = (obj) => (obj instanceof PDFString || obj instanceof PDFHexString ? obj.asBytes() : null);

// Every direct string inside a (non-stream) object, replaced through fn (async), recursing into dicts / arrays.
async function mapStrings(obj, fn) {
  if (obj instanceof PDFStream) return mapStrings(obj.dict, fn);
  if (obj instanceof PDFDict) {
    for (const [key, value] of obj.entries()) {
      const bytes = bytesOf(value);
      if (bytes) obj.set(key, PDFHexString.of(toHex(await fn(bytes))));
      else if (value instanceof PDFDict || value instanceof PDFArray) await mapStrings(value, fn);
    }
  } else if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) {
      const value = obj.get(i);
      const bytes = bytesOf(value);
      if (bytes) obj.set(i, PDFHexString.of(toHex(await fn(bytes))));
      else if (value instanceof PDFDict || value instanceof PDFArray) await mapStrings(value, fn);
    }
  }
}

function streamBytes(stream) {
  return stream instanceof PDFRawStream ? stream.contents : stream.getContents();
}

const isXrefStream = (s) => s.dict.get(N("Type")) === N("XRef");

// ---------------------------------------------------------------- encrypt (AES-256, R6)
export async function isEncryptedPdf(bytes) {
  const doc = await loadPdf(bytes, "this file", LOAD_OPTS);
  return !!doc.context.trailerInfo.Encrypt;
}

export async function encryptPdf(input, options = {}) {
  const userPw = passwordBytes(options.userPassword);
  if (userPw.length === 0) throw new Error("Enter a password to protect the PDF with.");
  const ownerText = options.ownerPassword == null ? "" : String(options.ownerPassword);
  const ownerPw = ownerText ? passwordBytes(ownerText) : randomBytes(24).map((b) => 33 + (b % 90));
  const doc = await loadPdf(input.bytes, input.name, LOAD_OPTS);
  const ctx = doc.context;
  if (ctx.trailerInfo.Encrypt) throw new Error(`${input.name} is already password-protected. Decrypt it first.`);

  const fileKey = randomBytes(32);
  const zeroIv = new Uint8Array(16);
  const [uValSalt, uKeySalt, oValSalt, oKeySalt] = [randomBytes(8), randomBytes(8), randomBytes(8), randomBytes(8)];
  const U = concat(await hashR6(userPw, uValSalt), uValSalt, uKeySalt);
  const UE = await aesCbcEncryptNoPad(await hashR6(userPw, uKeySalt), zeroIv, fileKey);
  const O = concat(await hashR6(ownerPw, oValSalt, U), oValSalt, oKeySalt);
  const OE = await aesCbcEncryptNoPad(await hashR6(ownerPw, oKeySalt, U), zeroIv, fileKey);
  const P = permissionBits(options);
  const perms = new Uint8Array(16);
  new DataView(perms.buffer).setUint32(0, P >>> 0, true);
  perms.set([0xff, 0xff, 0xff, 0xff, 0x54, 0x61, 0x64, 0x62], 4); // "T" "adb"
  perms.set(randomBytes(4), 12);
  const Perms = await aesCbcEncryptNoPad(fileKey, zeroIv, perms); // AES-256-ECB, one block

  const encrypt = (bytes) => aesEncryptWithIv(fileKey, bytes);
  const entries = Array.from(ctx.enumerateIndirectObjects());
  for (const [ref, obj] of entries) {
    if (obj instanceof PDFStream) {
      if (isXrefStream(obj)) continue;
      await mapStrings(obj.dict, encrypt);
      const encrypted = await encrypt(streamBytes(obj));
      ctx.assign(ref, PDFRawStream.of(obj.dict, encrypted));
    } else {
      await mapStrings(obj, encrypt);
    }
  }

  const cf = ctx.obj({ StdCF: { AuthEvent: "DocOpen", CFM: "AESV3", Length: 32 } });
  const dict = ctx.obj({
    Filter: "Standard", V: 5, R: 6, Length: 256, P,
    CF: cf, StmF: "StdCF", StrF: "StdCF",
    O: PDFHexString.of(toHex(O)), U: PDFHexString.of(toHex(U)),
    OE: PDFHexString.of(toHex(OE)), UE: PDFHexString.of(toHex(UE)),
    Perms: PDFHexString.of(toHex(Perms)),
  });
  ctx.trailerInfo.Encrypt = ctx.register(dict);
  if (!ctx.trailerInfo.ID) {
    const id = PDFHexString.of(toHex(randomBytes(16)));
    ctx.trailerInfo.ID = ctx.obj([id, id]);
  }
  const bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  return makeResult([{ name: exportFileName(input.name, "pdf", "-encrypted"), bytes, mime: PDF_MIME }], [
    "Open permissions are only advice: some PDF programs ignore them. The password to open the file is what protects it.",
  ]);
}

// ---------------------------------------------------------------- decrypt
const WRONG = "Incorrect password.";

function legacyFileKey(pw, enc) {
  const keyLen = enc.R === 2 ? 5 : enc.length / 8;
  const parts = [pw.length >= 32 ? pw.slice(0, 32) : concat(pw, PAD.slice(0, 32 - pw.length)), enc.O.slice(0, 32)];
  const p = new Uint8Array(4);
  new DataView(p.buffer).setInt32(0, enc.P, true);
  parts.push(p, enc.id0);
  if (enc.R >= 4 && !enc.encryptMetadata) parts.push(new Uint8Array([255, 255, 255, 255]));
  let h = md5(concat(...parts));
  if (enc.R >= 3) for (let i = 0; i < 50; i++) h = md5(h.slice(0, keyLen));
  return h.slice(0, keyLen);
}

function legacyUserOk(key, enc) {
  if (enc.R === 2) return equalBytes(rc4(key, PAD), enc.U.slice(0, 32));
  let h = rc4(key, md5(concat(PAD, enc.id0)));
  for (let i = 1; i <= 19; i++) h = rc4(key.map((b) => b ^ i), h);
  return equalBytes(h, enc.U.slice(0, 16));
}

// An owner password unlocks the user password stored (encrypted) in /O.
function legacyUserPasswordFromOwner(opw, enc) {
  const keyLen = enc.R === 2 ? 5 : enc.length / 8;
  let h = md5(opw.length >= 32 ? opw.slice(0, 32) : concat(opw, PAD.slice(0, 32 - opw.length)));
  if (enc.R >= 3) for (let i = 0; i < 50; i++) h = md5(h);
  const key = h.slice(0, keyLen);
  let data = enc.O.slice(0, 32);
  if (enc.R === 2) return rc4(key, data);
  for (let i = 19; i >= 0; i--) data = rc4(key.map((b) => b ^ i), data);
  return data;
}

async function openR6(pw, enc) {
  const U = enc.U.slice(0, 48);
  const O = enc.O.slice(0, 48);
  const zeroIv = new Uint8Array(16);
  if (equalBytes(await hashR6(pw, U.slice(32, 40)), U.slice(0, 32))) {
    return aesCbcDecryptNoPad(await hashR6(pw, U.slice(40, 48)), zeroIv, enc.UE.slice(0, 32));
  }
  if (equalBytes(await hashR6(pw, O.slice(32, 40), U), O.slice(0, 32))) {
    return aesCbcDecryptNoPad(await hashR6(pw, O.slice(40, 48), U), zeroIv, enc.OE.slice(0, 32));
  }
  throw new Error(WRONG);
}

function readEncrypt(ctx) {
  const dict = ctx.lookup(ctx.trailerInfo.Encrypt, PDFDict);
  const num = (k, d) => {
    const v = dict.lookup(N(k));
    return v instanceof PDFNumber ? v.asNumber() : d;
  };
  const str = (k) => {
    const v = bytesOf(dict.lookup(N(k)));
    return v || new Uint8Array(0);
  };
  const filter = dict.lookup(N("Filter"));
  if (!filter || filter.decodeText() !== "Standard") throw new Error("This PDF uses a security handler that is not supported.");
  const V = num("V", 0);
  const R = num("R", 2);
  let method = "RC4";
  if (V >= 4) {
    const cfName = dict.lookup(N("StmF"));
    const cf = dict.lookup(N("CF"));
    const std = cf instanceof PDFDict && cfName ? cf.lookup(cfName, PDFDict) : null;
    const cfm = std && std.lookup(N("CFM"));
    method = cfm ? cfm.decodeText() : "None";
    if (method === "V2") method = "RC4";
    else if (method === "AESV2") method = "AES128";
    else if (method === "AESV3") method = "AES256";
    else throw new Error("This PDF uses an encryption method that is not supported.");
  }
  if (V > 5 || R > 6 || V === 3) throw new Error("This PDF uses an encryption method that is not supported.");
  const idArr = ctx.trailerInfo.ID && ctx.lookup(ctx.trailerInfo.ID, PDFArray);
  const id0 = (idArr && bytesOf(idArr.lookup(0))) || new Uint8Array(0);
  const em = dict.lookup(N("EncryptMetadata"));
  return {
    dict, V, R, P: num("P", 0) | 0, method, id0,
    length: V === 1 ? 40 : num("Length", 40),
    O: str("O"), U: str("U"), OE: str("OE"), UE: str("UE"),
    encryptMetadata: !(em instanceof PDFBool) || em.asBoolean(),
  };
}

export async function decryptPdf(input, { password = "" } = {}) {
  let doc;
  try {
    doc = await PDFDocument.load(input.bytes, LOAD_OPTS);
  } catch {
    throw new Error(`${input.name} could not be read. It may be corrupt, or encrypted with compressed object streams, which this offline tool cannot open yet.`);
  }
  const ctx = doc.context;
  if (!ctx.trailerInfo.Encrypt) throw new Error(`${input.name} is not password-protected, so there is nothing to decrypt.`);
  const enc = readEncrypt(ctx);
  const pw = passwordBytes(password);

  let key;
  if (enc.method === "AES256") {
    key = await openR6(pw, enc);
  } else {
    key = legacyFileKey(pw, enc);
    if (!legacyUserOk(key, enc)) {
      key = legacyFileKey(legacyUserPasswordFromOwner(pw, enc), enc);
      if (!legacyUserOk(key, enc)) throw new Error(WRONG);
    }
  }

  const encryptRef = ctx.trailerInfo.Encrypt;
  const objectKey = (ref) => {
    const tail = new Uint8Array([ref.objectNumber & 255, (ref.objectNumber >> 8) & 255, (ref.objectNumber >> 16) & 255, ref.generationNumber & 255, (ref.generationNumber >> 8) & 255]);
    const salt = enc.method === "AES128" ? utf8("sAlT") : new Uint8Array(0);
    return md5(concat(key, tail, salt)).slice(0, Math.min(key.length + 5, 16));
  };
  const decryptFor = (ref) => async (bytes) => {
    if (enc.method === "AES256") return aesDecryptWithIv(key, bytes);
    const k = objectKey(ref);
    return enc.method === "AES128" ? aesDecryptWithIv(k, bytes) : rc4(k, bytes);
  };

  for (const [ref, obj] of Array.from(ctx.enumerateIndirectObjects())) {
    if (ref === encryptRef || (encryptRef instanceof PDFRef && ref.tag === encryptRef.tag)) continue;
    const fn = decryptFor(ref);
    if (obj instanceof PDFStream) {
      if (isXrefStream(obj)) continue;
      await mapStrings(obj.dict, fn);
      const isMeta = obj.dict.get(N("Type")) === N("Metadata");
      const plain = isMeta && !enc.encryptMetadata ? streamBytes(obj) : await fn(streamBytes(obj));
      ctx.assign(ref, PDFRawStream.of(obj.dict, plain));
    } else {
      await mapStrings(obj, fn);
    }
  }
  if (encryptRef instanceof PDFRef) ctx.delete(encryptRef);
  delete ctx.trailerInfo.Encrypt;
  const bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  return makeResult([{ name: exportFileName(input.name, "pdf", "-decrypted"), bytes, mime: PDF_MIME }], []);
}
