/**
 * Phase 13 — read-only finance tenant/orphan audit (no mutations on production rows).
 */
import "dotenv/config";
import "reflect-metadata";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DataSource } from "typeorm";

import { buildDataSourceOptions } from "./typeorm.config";

const backendRoot = join(__dirname, "..", "..");
const outputDir = join(backendRoot, "_runtime_harness", "finance-part13");

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  const queries: Record<string, unknown> = {};

  const crossOrgInvoiceJob = await dataSource.query(`
    SELECT COUNT(*) AS c
    FROM invoices i
    INNER JOIN jobs j ON j.id = i.job_id
    WHERE i.organization_id <> j.organization_id
  `);
  queries.invoice_job_org_mismatch = Number(crossOrgInvoiceJob[0]?.c ?? 0);

  const crossOrgQuoteJob = await dataSource.query(`
    SELECT COUNT(*) AS c
    FROM quotes q
    INNER JOIN jobs j ON j.id = q.job_id
    WHERE q.organization_id <> j.organization_id
  `);
  queries.quote_job_org_mismatch = Number(crossOrgQuoteJob[0]?.c ?? 0);

  const crossOrgPaymentInvoice = await dataSource.query(`
    SELECT COUNT(*) AS c
    FROM invoice_payments p
    INNER JOIN invoices i ON i.id = p.invoice_id
    WHERE p.organization_id <> i.organization_id
  `);
  queries.payment_invoice_org_mismatch = Number(crossOrgPaymentInvoice[0]?.c ?? 0);

  const crossOrgDocumentInvoice = await dataSource.query(`
    SELECT COUNT(*) AS c
    FROM invoice_documents d
    INNER JOIN invoices i ON i.id = d.invoice_id
    WHERE d.organization_id <> i.organization_id
  `);
  queries.document_invoice_org_mismatch = Number(crossOrgDocumentInvoice[0]?.c ?? 0);

  const orphanDocuments = await dataSource.query(`
    SELECT COUNT(*) AS c
    FROM invoice_documents d
    LEFT JOIN invoices i ON i.id = d.invoice_id
    WHERE i.id IS NULL
  `);
  queries.invoice_documents_without_invoice = Number(orphanDocuments[0]?.c ?? 0);

  const auditCounts = await dataSource.query(`
    SELECT action, COUNT(*) AS c
    FROM finance_audit_events
    GROUP BY action
    ORDER BY action
  `);

  await dataSource.destroy();

  mkdirSync(outputDir, { recursive: true });
  const artifact = {
    generated_at: new Date().toISOString(),
    mode: "read_only",
    tenant_invariant_counts: queries,
    finance_audit_action_counts: auditCounts,
    policy:
      "Cross-org mismatch counts should be zero. Non-zero values require triage; Phase 13 does not auto-repair production data.",
  };

  const outPath = join(outputDir, "phase13-readonly-audit.json");
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));

  const hasMismatch = Object.values(queries).some((value) => typeof value === "number" && value > 0);
  console.log(JSON.stringify({ ok: !hasMismatch, outPath, tenant_invariant_counts: queries }, null, 2));

  if (hasMismatch) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
