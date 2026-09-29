/**
 * Read-only Branch Consistency Audit — Phoenix production.
 * Job → Quote → Invoice → Payment. No mutations.
 */
const mysql = require("mysql2/promise");

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";

function sameBranch(a, b) {
  if (a == null && b == null) {
    return true;
  }
  return a != null && b != null && String(a) === String(b);
}

function isIssuedFrozenInvoice(invoice) {
  if (!invoice.branding_snapshot_json) {
    return false;
  }
  try {
    const parsed = JSON.parse(invoice.branding_snapshot_json);
    return Boolean(parsed.frozen_at || parsed.schema_version);
  } catch {
    return true;
  }
}

function isIssuedQuote(quote) {
  return quote.status !== "draft";
}

function classifyDocument(jobBranch, docBranch) {
  if (!jobBranch) {
    return "job_branch_null";
  }
  if (docBranch == null) {
    return "requires_sync";
  }
  if (!sameBranch(jobBranch, docBranch)) {
    return "mismatch";
  }
  return "consistent";
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [jobCounts] = await connection.query(
      `SELECT
         COUNT(*) AS total,
         SUM(branch_id IS NOT NULL) AS with_branch,
         SUM(branch_id IS NULL) AS without_branch
       FROM jobs WHERE organization_id = ?`,
      [PHOENIX_ORG_ID],
    );

    const [quotes] = await connection.query(
      `SELECT q.id, q.job_id, q.branch_id AS doc_branch_id, q.status,
              j.branch_id AS job_branch_id, j.service_city, j.service_state_or_region
       FROM quotes q
       INNER JOIN jobs j ON j.id = q.job_id
       WHERE q.organization_id = ?`,
      [PHOENIX_ORG_ID],
    );

    const [invoices] = await connection.query(
      `SELECT i.id, i.job_id, i.branch_id AS doc_branch_id, i.status, i.document_number,
              i.branding_snapshot_json,
              j.branch_id AS job_branch_id, j.service_city, j.service_state_or_region
       FROM invoices i
       INNER JOIN jobs j ON j.id = i.job_id
       WHERE i.organization_id = ?`,
      [PHOENIX_ORG_ID],
    );

    const [payments] = await connection.query(
      `SELECT p.id AS payment_id, p.invoice_id, i.branch_id AS invoice_branch_id,
              i.job_id, j.branch_id AS job_branch_id
       FROM invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       INNER JOIN jobs j ON j.id = i.job_id
       WHERE i.organization_id = ?`,
      [PHOENIX_ORG_ID],
    );

    const quoteRows = [];
    let quotesRequiresSync = 0;
    let quoteMismatches = 0;
    let quotesJobBranchNull = 0;
    let issuedQuotesAffected = 0;

    for (const q of quotes) {
      const category = classifyDocument(q.job_branch_id, q.doc_branch_id);
      const proposed = category === "requires_sync" || category === "mismatch" ? q.job_branch_id : null;
      const issued = isIssuedQuote(q);

      if (category === "requires_sync") {
        quotesRequiresSync += 1;
      }
      if (category === "mismatch") {
        quoteMismatches += 1;
      }
      if (category === "job_branch_null") {
        quotesJobBranchNull += 1;
      }
      if (issued && (category === "requires_sync" || category === "mismatch")) {
        issuedQuotesAffected += 1;
      }

      if (category !== "consistent") {
        quoteRows.push({
          entity: "quote",
          id: q.id,
          jobId: q.job_id,
          status: q.status,
          serviceCity: q.service_city,
          province: q.service_state_or_region,
          jobBranchId: q.job_branch_id,
          documentBranchId: q.doc_branch_id,
          category,
          issuedFrozen: issued,
          proposedBranchIdFromJob: proposed,
          snapshotNote: issued
            ? "Non-draft quote; review before changing branch_id — no snapshot column on quotes."
            : null,
        });
      } else if (q.doc_branch_id == null && q.job_branch_id == null) {
        quoteRows.push({
          entity: "quote",
          id: q.id,
          jobId: q.job_id,
          status: q.status,
          jobBranchId: null,
          documentBranchId: null,
          category: "consistent_both_null",
          proposedBranchIdFromJob: null,
        });
      }
    }

    const invoiceRows = [];
    let invoicesRequiresSync = 0;
    let invoiceMismatches = 0;
    let invoicesJobBranchNull = 0;
    let issuedFrozenAffected = 0;

    for (const i of invoices) {
      const category = classifyDocument(i.job_branch_id, i.doc_branch_id);
      const proposed = category === "requires_sync" || category === "mismatch" ? i.job_branch_id : null;
      const frozen = isIssuedFrozenInvoice(i);

      if (category === "requires_sync") {
        invoicesRequiresSync += 1;
      }
      if (category === "mismatch") {
        invoiceMismatches += 1;
      }
      if (category === "job_branch_null") {
        invoicesJobBranchNull += 1;
      }
      if (frozen && (category === "requires_sync" || category === "mismatch")) {
        issuedFrozenAffected += 1;
      }

      if (category !== "consistent") {
        let snapshotBranchCode = null;
        let snapshotSchemaVersion = null;
        if (i.branding_snapshot_json) {
          try {
            const parsed = JSON.parse(i.branding_snapshot_json);
            snapshotSchemaVersion = parsed.schema_version ?? null;
            snapshotBranchCode = parsed.branch?.branch_code ?? null;
          } catch {
            snapshotBranchCode = "parse_error";
          }
        }

        invoiceRows.push({
          entity: "invoice",
          id: i.id,
          jobId: i.job_id,
          documentNumber: i.document_number,
          status: i.status,
          serviceCity: i.service_city,
          province: i.service_state_or_region,
          jobBranchId: i.job_branch_id,
          documentBranchId: i.doc_branch_id,
          category,
          issuedFrozen: frozen,
          snapshotSchemaVersion,
          snapshotBranchCode,
          proposedBranchIdFromJob: proposed,
          snapshotNote: frozen
            ? "Issued frozen snapshot present — do not auto-rewrite snapshot; branch_id column sync only if separately approved."
            : null,
        });
      }
    }

    let paymentsAffectedIndirectly = 0;
    const paymentNotes = [];
    for (const p of payments) {
      const inv = invoices.find((row) => row.id === p.invoice_id);
      if (!inv) {
        continue;
      }
      const category = classifyDocument(inv.job_branch_id, inv.doc_branch_id);
      if (category === "requires_sync" || category === "mismatch") {
        paymentsAffectedIndirectly += 1;
        paymentNotes.push({
          paymentId: p.payment_id,
          invoiceId: p.invoice_id,
          invoiceBranchId: inv.doc_branch_id,
          jobBranchId: inv.job_branch_id,
          note: "Branch derives via invoice; indirect inconsistency if invoice.branch_id synced later.",
        });
      }
    }

    const branchMismatches = quoteMismatches + invoiceMismatches;

    const summary = {
      jobsWithBranch: Number(jobCounts[0].with_branch),
      jobsWithoutBranch: Number(jobCounts[0].without_branch),
      jobsTotal: Number(jobCounts[0].total),
      quotesTotal: quotes.length,
      invoicesTotal: invoices.length,
      paymentsTotal: payments.length,
      quotesRequiringBranchSync: quotesRequiresSync,
      invoicesRequiringBranchSync: invoicesRequiresSync,
      branchMismatches,
      quoteMismatches,
      invoiceMismatches,
      quotesJobBranchNull,
      invoicesJobBranchNull,
      issuedFrozenDocumentsAffected: issuedFrozenAffected + issuedQuotesAffected,
      issuedFrozenInvoicesAffected: issuedFrozenAffected,
      issuedNonDraftQuotesAffected: issuedQuotesAffected,
      paymentsAffectedIndirectly,
    };

    const dryRun = [...quoteRows, ...invoiceRows].filter(
      (row) =>
        row.category === "requires_sync"
        || row.category === "mismatch"
        || row.category === "job_branch_null",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          organizationId: PHOENIX_ORG_ID,
          database: process.env.DB_NAME,
          summary,
          dryRunProposedInheritanceFromJobBranchId: dryRun,
          paymentIndirectAudit: paymentNotes,
          readOnly: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
