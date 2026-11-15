// Compress a PDF offline. DOM-free, no network.
// What it can do: store raw (unfiltered) streams with Flate, pack objects into object streams, optionally
// drop document metadata, and (in a browser, via an injected hook) re-encode large JPEG images at lower
// quality. What it cannot do: shrink PDFs whose content is already compressed and lean; in that case the
// original bytes are returned unchanged and the result says so.
import { PDFName, PDFRawStream, PDFStream, PDFNumber } from "../vendor/pdf-lib.min.mjs";
import { exportFileName } from "../convert/exportFormats.js";
import { makeResult, PDF_MIME } from "./result.js";
import { loadPdf } from "./loadPdf.js";
import { stripMetadata } from "./stripMetadata.js";

const N = (s) => PDFName.of(s);
const QUALITY = { medium: { quality: 0.7, maxSide: 2000 }, low: { quality: 0.5, maxSide: 1400 } };
const MIN_RAW = 128;

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function size(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

const num = (dict, key) => {
  const v = dict.lookup(N(key));
  return v instanceof PDFNumber ? v.asNumber() : 0;
};

function isPlainJpegImage(stream) {
  const d = stream.dict;
  if (d.get(N("Subtype")) !== N("Image")) return false;
  if (d.get(N("Filter")) !== N("DCTDecode")) return false;
  const cs = d.get(N("ColorSpace"));
  if (cs !== N("DeviceRGB")) return false; // canvas output is RGB; gray or CMYK sources are left alone
  if (num(d, "BitsPerComponent") !== 8) return false;
  return !d.has(N("Decode")) && !d.has(N("Mask")) && !d.has(N("ImageMask"));
}

export async function compressPdf(input, options = {}, hooks = {}) {
  let source = input;
  if (options.removeMetadata) source = { name: input.name, bytes: (await stripMetadata(input)).files[0].bytes };
  const doc = await loadPdf(source.bytes, input.name, { updateMetadata: false });
  const ctx = doc.context;
  const recompress = hooks.recompressJpeg;
  const preset = QUALITY[options.imageQuality];

  for (const [ref, obj] of Array.from(ctx.enumerateIndirectObjects())) {
    if (!(obj instanceof PDFStream)) continue;
    const d = obj.dict;
    if (d.get(N("Type")) === N("XRef") || d.get(N("Type")) === N("ObjStm")) continue;
    let contents = obj instanceof PDFRawStream ? obj.contents : obj.getContents();
    let replaced = false;

    if (preset && typeof recompress === "function" && obj instanceof PDFRawStream && isPlainJpegImage(obj)) {
      const result = await recompress(contents, { width: num(d, "Width"), height: num(d, "Height"), ...preset });
      if (result && result.bytes && result.bytes.length < contents.length * 0.9) {
        contents = result.bytes;
        d.set(N("Width"), PDFNumber.of(result.width));
        d.set(N("Height"), PDFNumber.of(result.height));
        replaced = true;
      }
    }
    if (!d.has(N("Filter")) && !d.has(N("DecodeParms")) && contents.length >= MIN_RAW) {
      const packed = await deflate(contents);
      if (packed.length < contents.length) {
        d.set(N("Filter"), N("FlateDecode"));
        contents = packed;
        replaced = true;
      }
    }
    if (replaced) ctx.assign(ref, PDFRawStream.of(d, contents));
  }

  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  const before = input.bytes.length;
  const name = exportFileName(input.name, "pdf", "-compressed");
  if (bytes.length >= before) {
    return {
      ...makeResult([{ name, bytes: input.bytes, mime: PDF_MIME }], []),
      notes: [`This PDF could not be made smaller (${size(before)}). Its content is already compressed; the original file is returned unchanged.`],
    };
  }
  const pct = Math.round((1 - bytes.length / before) * 100);
  return {
    ...makeResult([{ name, bytes, mime: PDF_MIME }], []),
    notes: [`Reduced ${size(before)} to ${size(bytes.length)} by ${pct}%.`],
  };
}
