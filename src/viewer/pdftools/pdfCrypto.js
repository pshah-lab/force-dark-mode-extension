// Crypto primitives for PDF encryption: MD5, RC4, AES-CBC helpers on WebCrypto, and the ISO 32000-2
// (PDF 2.0, revision 6) password hash. DOM-free, offline, no network: only crypto.subtle / getRandomValues.

const subtle = () => globalThis.crypto.subtle;

export function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export const utf8 = (s) => new TextEncoder().encode(String(s));
export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function fromHex(h) {
  const out = new Uint8Array(h.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// ---------------------------------------------------------------- MD5 (RFC 1321)
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);

export function md5(data) {
  const len = data.length;
  const padded = new Uint8Array(((len + 8) >> 6 << 6) + 64);
  padded.set(data);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, (len << 3) >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(len / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < padded.length; off += 64) {
    const m = new Uint32Array(16);
    for (let i = 0; i < 16; i++) m[i] = dv.getUint32(off + i * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      f = (f + a + MD5_K[i] + m[g]) >>> 0;
      a = d; d = c; c = b;
      const s = MD5_S[(i >> 4) * 4 + (i % 4)];
      b = (b + ((f << s) | (f >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => odv.setUint32(i * 4, v, true));
  return out;
}

// ---------------------------------------------------------------- RC4
export function rc4(key, data) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

// ---------------------------------------------------------------- AES-CBC on WebCrypto
const importKey = (raw) => subtle().importKey("raw", raw, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);

// Encrypt with no padding: data must be a multiple of 16 bytes.
export async function aesCbcEncryptNoPad(rawKey, iv, data) {
  const out = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv }, await importKey(rawKey), data));
  return out.slice(0, data.length);
}

// Decrypt with no padding: append one block that decrypts to a full padding block, then drop it.
export async function aesCbcDecryptNoPad(rawKey, iv, data) {
  const key = await importKey(rawKey);
  const lastBlock = data.length >= 16 ? data.slice(data.length - 16) : iv;
  const padBlock = new Uint8Array(16).fill(16);
  const forged = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv: lastBlock }, key, padBlock)).slice(0, 16);
  const joined = concat(data, forged);
  const out = new Uint8Array(await subtle().decrypt({ name: "AES-CBC", iv }, key, joined));
  return out.slice(0, data.length);
}

// PDF stream / string encryption: random IV prepended, PKCS#7 padding.
export async function aesEncryptWithIv(rawKey, data) {
  const iv = randomBytes(16);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-CBC", iv }, await importKey(rawKey), data));
  return concat(iv, ct);
}

export async function aesDecryptWithIv(rawKey, data) {
  if (data.length === 0) return data;
  if (data.length < 32 || data.length % 16 !== 0) throw new Error("Encrypted data has an invalid length.");
  const iv = data.slice(0, 16);
  return new Uint8Array(await subtle().decrypt({ name: "AES-CBC", iv }, await importKey(rawKey), data.slice(16)));
}

// ---------------------------------------------------------------- Algorithm 2.B (revision 6 hash)
export async function hashR6(password, salt, udata = new Uint8Array(0)) {
  let k = new Uint8Array(await subtle().digest("SHA-256", concat(password, salt, udata)));
  let e = new Uint8Array(1);
  for (let i = 0; i < 64 || e[e.length - 1] > i - 32; i++) {
    const unit = concat(password, k, udata);
    const k1 = new Uint8Array(unit.length * 64);
    for (let j = 0; j < 64; j++) k1.set(unit, j * unit.length);
    e = await aesCbcEncryptNoPad(k.slice(0, 16), k.slice(16, 32), k1);
    let sum = 0;
    for (let j = 0; j < 16; j++) sum += e[j];
    const algo = ["SHA-256", "SHA-384", "SHA-512"][sum % 3];
    k = new Uint8Array(await subtle().digest(algo, e));
  }
  return k.slice(0, 32);
}
