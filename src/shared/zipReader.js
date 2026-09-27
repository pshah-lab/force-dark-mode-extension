const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_EOCD_COMMENT_SEARCH = 65557; // 22-byte EOCD + max 65535-byte comment
const MAX_ENTRY_SIZE = 50 * 1024 * 1024; // 50MB decompression ceiling

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

async function inflate(compressedBytes) {
  const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalLength += value.length;
    if (totalLength > MAX_ENTRY_SIZE) return null;
    chunks.push(value);
  }

  const result = new Uint8Array(totalLength);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }

  return result;
}

export async function listZipEntryNames(bytes) {
  return readCentralDirectory(bytes).map((entry) => entry.name);
}

export async function readZipEntryText(bytes, entryName) {
  const entries = readCentralDirectory(bytes);
  const entry = entries.find((candidate) => candidate.name === entryName);
  if (!entry) return null;

  const isEncrypted = (entry.generalPurposeFlag & 0x1) !== 0;
  if (isEncrypted) {
    const error = new Error("This entry is password-protected and cannot be decompressed.");
    error.code = "ENCRYPTED";
    throw error;
  }
  if (entry.uncompressedSize > MAX_ENTRY_SIZE) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const localOffset = entry.localHeaderOffset;
  if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) return null;

  const localFilenameLength = view.getUint16(localOffset + 26, true);
  const localExtraFieldLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + localFilenameLength + localExtraFieldLength;
  const compressedBytes = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  let resultBytes;
  if (entry.compressionMethod === 0) {
    resultBytes = compressedBytes;
  } else if (entry.compressionMethod === 8) {
    resultBytes = await inflate(compressedBytes);
    if (resultBytes === null) return null;
  } else {
    return null;
  }

  return new TextDecoder("utf-8").decode(resultBytes);
}
