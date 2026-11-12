// tests/pdftools_ranges_test.mjs - page range parsing and result helpers for PDF tools
import assert from "assert";
import { parseRangeList, parseSplitGroups } from "../src/viewer/pdftools/ranges.js";
import { makeResult, PDF_MIME } from "../src/viewer/pdftools/result.js";

const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);

eq(parseRangeList("1-3,5", 6), [1, 2, 3, 5], "mixed ranges");
eq(parseRangeList("3,1,2", 4), [3, 1, 2], "order as typed");
eq(parseRangeList("1-3,3", 4), [1, 2, 3, 3], "duplicates kept");
eq(parseRangeList(" 2 , 4 ", 4), [2, 4], "whitespace tolerated");
eq(parseRangeList("2-2", 4), [2], "single-page range");
eq(parseRangeList("4", 4), [4], "last page");
for (const bad of ["0", "5-2", "abc", "10-", "", "   ", "1,,2", "5", "1-5", "-3", "1-2-3", "1.5", "0-2", "1,x"]) {
  assert.throws(() => parseRangeList(bad, 4), (e) => e instanceof Error && e.message.length > 5, `rejects "${bad}"`);
}
assert.throws(() => parseRangeList("1", 0), Error, "zero-page document rejected");
assert.throws(() => parseRangeList("99999999999999999999", 4), Error, "huge number rejected");

eq(parseSplitGroups("1-3,5", 6), [[1, 2, 3], [5]], "split groups");
eq(parseSplitGroups("", 3), [[1], [2], [3]], "empty = one per page");
eq(parseSplitGroups("  ", 2), [[1], [2]], "blank = one per page");
eq(parseSplitGroups("2,1", 3), [[2], [1]], "order kept");
assert.throws(() => parseSplitGroups("0", 3), Error, "split rejects 0");
assert.throws(() => parseSplitGroups("2-9", 3), Error, "split rejects out of range");
assert.throws(() => parseSplitGroups("", 0), Error, "split rejects zero pages");

assert.strictEqual(PDF_MIME, "application/pdf");
const files = [{ name: "a.pdf", bytes: new Uint8Array([1]), mime: PDF_MIME }];
const r = makeResult(files, ["w"]);
eq(r, { files, warnings: ["w"] }, "result shape");
eq(makeResult(files).warnings, [], "warnings default empty");
assert.throws(() => makeResult([], []), Error, "no files rejected");

console.log("pdftools_ranges_test: all passed");
