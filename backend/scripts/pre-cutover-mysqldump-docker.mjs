/**
 * Logical backup via Docker mysql client (no secrets logged).
 * Requires BACKUP_MYSQL_URL (mysql://user:pass@host:port/db).
 */
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const rawUrl = process.env.BACKUP_MYSQL_URL?.trim();
const outputPath =
  process.env.BACKUP_OUTPUT_PATH?.trim()
  || "backend/_runtime_harness/wizfield-pre-phoenix-cutover-20261003.sql.gz";

if (!rawUrl) {
  console.error(JSON.stringify({ ok: false, error: "BACKUP_MYSQL_URL is required." }));
  process.exit(1);
}

const url = new URL(rawUrl);
const host = url.hostname;
const port = url.port || "3306";
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.replace(/^\//, "") || "wizfield";

const args = [
  "run",
  "--rm",
  "mysql:9",
  "mysqldump",
  `-h${host}`,
  `-P${port}`,
  `-u${user}`,
  `-p${password}`,
  "--single-transaction",
  "--routines",
  "--triggers",
  database,
];

const dump = execFileSync("docker", args, { maxBuffer: 512 * 1024 * 1024 });

await pipeline(Readable.from(dump), createGzip(), createWriteStream(outputPath));

console.log(
  JSON.stringify(
    {
      ok: true,
      backup: {
        path: outputPath,
        bytes_uncompressed: dump.length,
        database,
        host,
        port,
        timestamp: new Date().toISOString(),
      },
    },
    null,
    2,
  ),
);
