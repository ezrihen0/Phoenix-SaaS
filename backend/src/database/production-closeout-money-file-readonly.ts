/**
 * Read-only Phoenix money + file integrity snapshot (closeout F9/F10).
 * Run: npm run production-closeout:money-file:readonly --workspace backend
 */
import "dotenv/config";

import mysql from "mysql2/promise";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { buildDataSourceOptions } from "./typeorm.config";
import { PHOENIX_ORG_ID } from "./workiz/workiz-production-mutation-guard";

const OUTPUT_DIR = join(__dirname, "..", "..", "_runtime_harness", "production-closeout-2026-09");
const IMPORT_SOURCE = "workiz_historical_import";

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("production-closeout:money-file:readonly supports MySQL only.");
  }
  return options as MysqlConnectionOptions;
}

async function main() {
  const options = requireMySqlOptions();
  const connection = await mysql.createConnection({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    user: options.username ?? "root",
    password: options.password ?? "",
    database: options.database as string,
  });

  const [[invoiceStats]] = await connection.query(
    `SELECT COUNT(*) AS invoiceCount,
            SUM(CASE WHEN branding_snapshot_json LIKE ? THEN 1 ELSE 0 END) AS importedCount,
            SUM(CASE WHEN branding_snapshot_json NOT LIKE ? OR branding_snapshot_json IS NULL THEN 1 ELSE 0 END) AS nativeCount,
            SUM(total_cents) AS totalInvoiceCents,
            SUM(CASE WHEN status <> 'paid' THEN total_cents ELSE 0 END) AS outstandingCents
     FROM invoices WHERE organization_id = ?`,
    [`%${IMPORT_SOURCE}%`, `%${IMPORT_SOURCE}%`, PHOENIX_ORG_ID],
  ) as [{ invoiceCount: number; importedCount: number; nativeCount: number; totalInvoiceCents: number; outstandingCents: number }[], unknown];

  const [[paymentStats]] = await connection.query(
    `SELECT COUNT(*) AS paymentCount, COALESCE(SUM(amount_cents),0) AS paymentTotalCents
     FROM invoice_payments WHERE organization_id = ?`,
    [PHOENIX_ORG_ID],
  ) as [{ paymentCount: number; paymentTotalCents: number }[], unknown];

  const [[docStats]] = await connection.query(
    `SELECT COUNT(*) AS docCount,
            SUM(CASE WHEN storage_path IS NULL OR storage_path = '' THEN 1 ELSE 0 END) AS missingPathCount
     FROM invoice_documents WHERE organization_id = ?`,
    [PHOENIX_ORG_ID],
  ) as [{ docCount: number; missingPathCount: number }[], unknown];

  const [[photoStats]] = await connection.query(
    `SELECT COUNT(*) AS photoCount FROM inspection_photos WHERE organization_id = ?`,
    [PHOENIX_ORG_ID],
  ) as [{ photoCount: number }[], unknown];

  const [crossOrgPayments] = await connection.query(
    `SELECT COUNT(*) AS c FROM invoice_payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     WHERE p.organization_id = ? AND i.organization_id <> p.organization_id`,
    [PHOENIX_ORG_ID],
  ) as [{ c: number }[], unknown];

  const [docRows] = await connection.query(
    `SELECT id, storage_path FROM invoice_documents WHERE organization_id = ? LIMIT 5000`,
    [PHOENIX_ORG_ID],
  ) as [{ id: string; storage_path: string }[], unknown];

  let missingFiles = 0;
  for (const row of docRows) {
    if (!row.storage_path) {
      missingFiles += 1;
      continue;
    }
    try {
      await access(join(process.cwd(), row.storage_path));
    } catch {
      missingFiles += 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    phoenixOrganizationId: PHOENIX_ORG_ID,
    money: {
      invoiceCount: Number(invoiceStats.invoiceCount),
      importedInvoiceCount: Number(invoiceStats.importedCount),
      nativeInvoiceCount: Number(invoiceStats.nativeCount),
      paymentCount: Number(paymentStats.paymentCount),
      totalInvoiceCents: Number(invoiceStats.totalInvoiceCents),
      outstandingCents: Number(invoiceStats.outstandingCents),
      paymentLedgerTotalCents: Number(paymentStats.paymentTotalCents),
      crossOrgPaymentMismatches: Number((crossOrgPayments as { c: number }[])[0]?.c ?? 0),
    },
    files: {
      invoiceDocuments: Number(docStats.docCount),
      invoiceDocumentsMissingPath: Number(docStats.missingPathCount),
      invoiceDocumentsMissingFileOnDisk: missingFiles,
      inspectionPhotos: Number(photoStats.photoCount),
      knownProvenanceGap: ["RZISD4"],
    },
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, "money-file-integrity-readonly.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`report_written:${outPath}`);
  await connection.end();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
