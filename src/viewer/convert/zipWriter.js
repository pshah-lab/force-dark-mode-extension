// Minimal store-only (no compression) ZIP writer for viewer exports.
// Local-only: builds the archive in memory; no ZIP64, so the caller keeps
// entries and totals well under 4 GB / 65535 entries (exports are capped far below).

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const MAX_ENTRIES = 0xffff;
const MAX_TOTAL = 0xffffffff;
// Fixed DOS timestamp (1980-01-01 00:00): exports carry no clock data.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

export function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function assertSafeName(name, seen) {
  if (typeof name !== "string" || name === "") throw new Error("ZIP entry name must be a non-empty string");
  if (name.startsWith("/") || name.includes("\\") || name.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`Unsafe ZIP entry name: ${name}`);
  }
  if (seen.has(name)) throw new Error(`Duplicate ZIP entry name: ${name}`);
  seen.add(name);
}

// entries: [{ name: string, data: string | Uint8Array }] -> Uint8Array
export function createZip(entries) {
  if (entries.length > MAX_ENTRIES) throw new Error("Too many entries for a ZIP archive");
  const encoder = new TextEncoder();
  const seen = new Set();
  const prepared = entries.map(({ name, data }) => {
    assertSafeName(name, seen);
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    return { nameBytes: encoder.encode(name), bytes, crc: crc32(bytes) };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const e of prepared) {
    localSize += 30 + e.nameBytes.length + e.bytes.length;
    centralSize += 46 + e.nameBytes.length;
  }
  const total = localSize + centralSize + 22;
  if (total > MAX_TOTAL) throw new Error("Export is too large for a ZIP archive");

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let pos = 0;
  const offsets = [];

  for (const e of prepared) {
    offsets.push(pos);
    view.setUint32(pos, LOCAL_HEADER_SIGNATURE, true);
    view.setUint16(pos + 4, 20, true); // version needed
    view.setUint16(pos + 6, FLAG_UTF8, true);
    view.setUint16(pos + 8, 0, true); // stored
    view.setUint16(pos + 10, DOS_TIME, true);
    view.setUint16(pos + 12, DOS_DATE, true);
    view.setUint32(pos + 14, e.crc, true);
    view.setUint32(pos + 18, e.bytes.length, true);
    view.setUint32(pos + 22, e.bytes.length, true);
    view.setUint16(pos + 26, e.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true);
    out.set(e.nameBytes, pos + 30);
    out.set(e.bytes, pos + 30 + e.nameBytes.length);
    pos += 30 + e.nameBytes.length + e.bytes.length;
  }

  const centralStart = pos;
  prepared.forEach((e, i) => {
    view.setUint32(pos, CENTRAL_DIR_SIGNATURE, true);
    view.setUint16(pos + 4, 20, true); // version made by
    view.setUint16(pos + 6, 20, true); // version needed
    view.setUint16(pos + 8, FLAG_UTF8, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, DOS_TIME, true);
    view.setUint16(pos + 14, DOS_DATE, true);
    view.setUint32(pos + 16, e.crc, true);
    view.setUint32(pos + 20, e.bytes.length, true);
    view.setUint32(pos + 24, e.bytes.length, true);
    view.setUint16(pos + 28, e.nameBytes.length, true);
    // extra length, comment length, disk number, internal/external attrs stay 0
    view.setUint32(pos + 42, offsets[i], true);
    out.set(e.nameBytes, pos + 46);
    pos += 46 + e.nameBytes.length;
  });

  view.setUint32(pos, EOCD_SIGNATURE, true);
  view.setUint16(pos + 8, prepared.length, true);
  view.setUint16(pos + 10, prepared.length, true);
  view.setUint32(pos + 12, pos - centralStart, true);
  view.setUint32(pos + 16, centralStart, true);
  return out;
}
