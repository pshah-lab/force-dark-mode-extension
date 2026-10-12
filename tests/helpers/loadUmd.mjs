// Loads classic-script UMD files into one fresh vm context (package is "type": "module").
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadUmd(relPaths = []) {
  const ctx = vm.createContext({});
  const files = ["src/shared/colorUtils.js", ...relPaths.filter((p) => p !== "src/shared/colorUtils.js")];
  for (const rel of files) {
    vm.runInContext(fs.readFileSync(path.join(rootDir, rel), "utf8"), ctx, { filename: rel });
  }
  return ctx;
}
