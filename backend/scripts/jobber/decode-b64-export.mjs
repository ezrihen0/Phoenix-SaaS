import fs from "node:fs";
import path from "node:path";

const [outName, b64] = process.argv.slice(2);
if (!outName || !b64) {
  console.error("Usage: node decode-b64-export.mjs <filename> <base64>");
  process.exit(1);
}

const dir = path.resolve(process.cwd(), "data/jobber-export");
fs.mkdirSync(dir, { recursive: true });
const text = Buffer.from(b64, "base64").toString("utf8");
fs.writeFileSync(path.join(dir, outName), text, "utf8");
console.log(`Wrote ${path.join(dir, outName)} (${text.length} chars)`);
