const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_EOCD_COMMENT_SEARCH = 65557; // 22-byte EOCD + max 65535-byte comment
const MAX_ENTRY_SIZE = 50 * 1024 * 1024; // 50MB decompression ceiling
const MAX_ARCHIVE_SIZE = 256 * 1024 * 1024; // 256MB total decompressed output across all reads of one archive

function findEndOfCentralDirectory(view) {
  const searchStart = Math.max(0, view.byteLength - MAX_EOCD_COMMENT_SEARCH);
  for (let offset = view.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

function readCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset === -1) {
    throw new Error("Not a valid ZIP archive (End Of Central Directory not found)");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const entries = [];
  let offset = centralDirOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_DIR_SIGNATURE) break;

    const generalPurposeFlag = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + filenameLength);
    const name = new TextDecoder("utf-8").decode(nameBytes);

    entries.push({
      name,
      generalPurposeFlag,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + filenameLength + extraFieldLength + commentLength;
  }

  return entries;
}

// Rejects archives whose entries' local-header-plus-data ranges overlap or share
// a local header. Real archives never do this; a crafted one points many central
// directory entries at one small deflate stream to decompress it over and over.
// Entries whose local header is missing or out of range are skipped here (reading
// them yields null / an error as before, and they decompress nothing).
function assertNoOverlappingEntries(bytes, entries) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const extents = [];
  for (const entry of entries) {
    const start = entry.localHeaderOffset;
    if (start + 30 > view.byteLength || view.getUint32(start, true) !== LOCAL_HEADER_SIGNATURE) continue;
    const dataStart = start + 30 + view.getUint16(start + 26, true) + view.getUint16(start + 28, true);
    extents.push({ start, end: Math.min(dataStart + entry.compressedSize, view.byteLength) });
  }

  extents.sort((a, b) => a.start - b.start);
  for (let i = 1; i < extents.length; i += 1) {
    if (extents[i].start < extents[i - 1].end) {
      const error = new Error("This ZIP archive has overlapping entries and cannot be read safely.");
      error.code = "OVERLAPPING_ENTRIES";
      throw error;
    }
  }
}

// Per-archive state, keyed by the caller's byte array: the central directory is
// parsed (and validated) once, and `inflatedBytes` is the running total of
// decompressed output handed out for this archive.
const archives = new WeakMap();

function getArchive(bytes) {
  let archive = archives.get(bytes);
  if (!archive) {
    const entries = readCentralDirectory(bytes);
    assertNoOverlappingEntries(bytes, entries);
    archive = { entries, inflatedBytes: 0 };
    archives.set(bytes, archive);
  }
  return archive;
}

// Returns { bytes, truncated }. Stops reading once `limit` decompressed bytes
// are produced; `bytes` is then the prefix of exactly `limit` bytes.
async function inflate(compressedBytes, limit) {
  const decompressor = new DecompressionStream("deflate-raw");
  const writer = decompressor.writable.getWriter();
  // Not awaited: writes block on backpressure until the readable side is drained below.
  writer.write(compressedBytes).then(() => writer.close()).catch(() => {});

  const reader = decompressor.readable.getReader();
  const chunks = [];
  let totalLength = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (totalLength + value.length > limit) {
      chunks.push(value.subarray(0, limit - totalLength));
      totalLength = limit;
      truncated = true;
      reader.cancel().catch(() => {});
      break;
    }
    totalLength += value.length;
    chunks.push(value);
  }

  const result = new Uint8Array(totalLength);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }

  return { bytes: result, truncated };
}

export async function listZipEntryNames(bytes) {
  return getArchive(bytes).entries.map((entry) => entry.name);
}

// Contract: resolves to the entry text; null when the entry is missing or
// unsupported (bad header / unknown compression). An entry whose decompressed
// size exceeds `maxEntrySize` (default 50 MB) is NOT silently null: the call
// rejects with an Error whose `code` is "TOO_LARGE" and whose `partialText` is
// the decoded first `maxEntrySize` bytes, so callers can show a bounded prefix
// or treat it as unreadable. Encrypted entries reject with code "ENCRYPTED".
// The same TOO_LARGE rejection applies once the total decompressed output of all
// reads of one archive (the same `bytes` array) reaches `maxTotalSize` (default
// 256 MB), so a crafted archive cannot make many small reads add up to a huge
// amount of work. Archives with overlapping entries reject with code
// "OVERLAPPING_ENTRIES" (from here and from listZipEntryNames).
export async function readZipEntryText(
  bytes,
  entryName,
  { maxEntrySize = MAX_ENTRY_SIZE, maxTotalSize = MAX_ARCHIVE_SIZE } = {},
) {
  const archive = getArchive(bytes);
  const entry = archive.entries.find((candidate) => candidate.name === entryName);
  if (!entry) return null;

  const isEncrypted = (entry.generalPurposeFlag & 0x1) !== 0;
  if (isEncrypted) {
    const error = new Error("This entry is password-protected and cannot be decompressed.");
    error.code = "ENCRYPTED";
    throw error;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localOffset = entry.localHeaderOffset;
  if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) return null;

  const localFilenameLength = view.getUint16(localOffset + 26, true);
  const localExtraFieldLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + localFilenameLength + localExtraFieldLength;
  const compressedBytes = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  // Output allowed for this read: the per-entry cap, or what is left of the archive's budget.
  const limit = Math.max(0, Math.min(maxEntrySize, maxTotalSize - archive.inflatedBytes));

  let resultBytes;
  let tooLarge = false;
  if (entry.compressionMethod === 0) {
    tooLarge = compressedBytes.length > limit;
    resultBytes = tooLarge ? compressedBytes.subarray(0, limit) : compressedBytes;
    archive.inflatedBytes += resultBytes.length;
  } else if (entry.compressionMethod === 8) {
    if (limit === 0) {
      // Budget spent: refuse without starting a decompressor.
      resultBytes = new Uint8Array(0);
      tooLarge = true;
    } else {
      // Charge the whole allowance up front (so a stream that fails part-way is
      // still counted) and refund what a successful read did not use.
      archive.inflatedBytes += limit;
      const inflated = await inflate(compressedBytes, limit);
      archive.inflatedBytes -= limit - inflated.bytes.length;
      resultBytes = inflated.bytes;
      tooLarge = inflated.truncated;
    }
  } else {
    return null;
  }

  const text = new TextDecoder("utf-8").decode(resultBytes);
  if (tooLarge) {
    const error = new Error("This entry is too large to decompress in full.");
    error.code = "TOO_LARGE";
    error.partialText = text;
    throw error;
  }
  return text;
}

// Same as readZipEntryText, but an oversize entry (TOO_LARGE) resolves to null
// so callers that skip unreadable parts (e.g. PPTX slides) keep working.
// Every other error (e.g. ENCRYPTED) still propagates.
export async function readZipEntryTextOrNull(bytes, entryName, options) {
  try {
    return await readZipEntryText(bytes, entryName, options);
  } catch (error) {
    if (error && error.code === "TOO_LARGE") return null;
    throw error;
  }
}
