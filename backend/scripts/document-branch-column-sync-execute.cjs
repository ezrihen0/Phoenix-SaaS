/**
 * Controlled production sync: quotes/invoices.branch_id from parent jobs.branch_id.
 * Phoenix org only; column updates only — no status, PDFs, snapshots, payments.
 */
const mysql = require("mysql2/promise");

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const ONTARIO_BRANCH_ID = "70ea744e-ce6d-4e5b-9384-a8f377493f27";
const CANONICAL_JOB_ID = "a8995096-bfc3-4f12-a1a0-55c86c8effc6";

const QUOTE_ID = "f14b9b5a-58a7-46b0-8519-6e3cea891eb6";
const INVOICE_ID = "cc8e393a-b29f-41d2-a6b3-9188251ed596";

const EXCLUDED_INVOICE_ID = "ed1359d4-48a4-4ad1-8704-041c3bb65e89";

async function loadPreconditions(connection) {
  const [jobs] = await connection.query(
    `SELECT id, organization_id, branch_id FROM jobs WHERE id = ?`,
    [CANONICAL_JOB_ID],
  );
  const [quotes] = await connection.query(
    `SELECT id, organization_id, job_id, branch_id, status FROM quotes WHERE id = ?`,
    [QUOTE_ID],
  );
  const [invoices] = await connection.query(
    `SELECT id, organization_id, job_id, branch_id, status, branding_snapshot_json
     FROM invoices WHERE id = ?`,
    [INVOICE_ID],
  );
  return { job: jobs[0], quote: quotes[0], invoice: invoices[0] };
}

function validatePreconditions(ctx) {
  const errors = [];
  const { job, quote, invoice } = ctx;

  if (!job || job.organization_id !== PHOENIX_ORG_ID) {
    errors.push("canonical job missing or not Phoenix org");
  } else if (job.branch_id !== ONTARIO_BRANCH_ID) {
    errors.push(`job.branch_id expected Ontario ${ONTARIO_BRANCH_ID}, got ${job.branch_id}`);
  }

  if (!quote || quote.organization_id !== PHOENIX_ORG_ID) {
    errors.push("quote missing or not Phoenix org");
  } else {
    if (quote.branch_id != null) {
      errors.push(`quote.branch_id must be NULL, got ${quote.branch_id}`);
    }
    if (quote.job_id !== CANONICAL_JOB_ID) {
      errors.push(`quote.job_id expected ${CANONICAL_JOB_ID}, got ${quote.job_id}`);
    }
  }

  if (!invoice || invoice.organization_id !== PHOENIX_ORG_ID) {
    errors.push("invoice missing or not Phoenix org");
  } else {
    if (invoice.branch_id != null) {
      errors.push(`invoice.branch_id must be NULL, got ${invoice.branch_id}`);
    }
    if (invoice.job_id !== CANONICAL_JOB_ID) {
      errors.push(`invoice.job_id expected ${CANONICAL_JOB_ID}, got ${invoice.job_id}`);
    }
  }

  return errors;
}

async function postCommitSnapshot(connection) {
  const [quoteRow] = await connection.query(
    `SELECT q.id, q.branch_id, q.status, j.branch_id AS job_branch_id
     FROM quotes q INNER JOIN jobs j ON j.id = q.job_id WHERE q.id = ?`,
    [QUOTE_ID],
  );
  const [invoiceRows] = await connection.query(
    `SELECT i.id, i.branch_id, i.status, j.branch_id AS job_branch_id
     FROM invoices i INNER JOIN jobs j ON j.id = i.job_id
     WHERE i.organization_id = ? ORDER BY i.id`,
    [PHOENIX_ORG_ID],
  );
  const [payments] = await connection.query(
    `SELECT p.id, p.invoice_id, i.branch_id AS invoice_branch_id
     FROM invoice_payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     WHERE i.organization_id = ?`,
    [PHOENIX_ORG_ID],
  );

  const excluded = invoiceRows.find((r) => r.id === EXCLUDED_INVOICE_ID);
  const synced = invoiceRows.find((r) => r.id === INVOICE_ID);

  return {
    quote: quoteRow[0],
    invoiceSynced: synced,
    invoiceExcluded: excluded,
    allInvoices: invoiceRows,
    payments,
  };
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
    const pre = await loadPreconditions(connection);
    const preErrors = validatePreconditions(pre);
    if (preErrors.length > 0) {
      console.log(
        JSON.stringify(
          { ok: false, phase: "preconditions", errors: preErrors, pre },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    const quoteStatusBefore = pre.quote.status;
    const invoiceStatusBefore = pre.invoice.status;
    const invoiceSnapshotBefore = pre.invoice.branding_snapshot_json;

    await connection.beginTransaction();

    const [quoteUpdate] = await connection.query(
      `UPDATE quotes q
       INNER JOIN jobs j ON j.id = q.job_id
       SET q.branch_id = j.branch_id
       WHERE q.id = ?
         AND q.organization_id = ?
         AND q.branch_id IS NULL
         AND q.job_id = ?
         AND j.organization_id = ?
         AND j.branch_id = ?`,
      [
        QUOTE_ID,
        PHOENIX_ORG_ID,
        CANONICAL_JOB_ID,
        PHOENIX_ORG_ID,
        ONTARIO_BRANCH_ID,
      ],
    );

    const [invoiceUpdate] = await connection.query(
      `UPDATE invoices i
       INNER JOIN jobs j ON j.id = i.job_id
       SET i.branch_id = j.branch_id
       WHERE i.id = ?
         AND i.organization_id = ?
         AND i.branch_id IS NULL
         AND i.job_id = ?
         AND j.organization_id = ?
         AND j.branch_id = ?`,
      [
        INVOICE_ID,
        PHOENIX_ORG_ID,
        CANONICAL_JOB_ID,
        PHOENIX_ORG_ID,
        ONTARIO_BRANCH_ID,
      ],
    );

    const quoteAffected = quoteUpdate.affectedRows ?? 0;
    const invoiceAffected = invoiceUpdate.affectedRows ?? 0;

    if (quoteAffected !== 1 || invoiceAffected !== 1) {
      await connection.rollback();
      console.log(
        JSON.stringify(
          {
            ok: false,
            phase: "update_assertion",
            error: "expected exactly 1 quote and 1 invoice updated",
            quoteAffectedRows: quoteAffected,
            invoiceAffectedRows: invoiceAffected,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    const [quoteAfter] = await connection.query(
      `SELECT status, branch_id FROM quotes WHERE id = ?`,
      [QUOTE_ID],
    );
    const [invoiceAfter] = await connection.query(
      `SELECT status, branch_id, branding_snapshot_json FROM invoices WHERE id = ?`,
      [INVOICE_ID],
    );

    if (quoteAfter[0].status !== quoteStatusBefore) {
      await connection.rollback();
      console.log(
        JSON.stringify({ ok: false, phase: "status_guard", entity: "quote" }, null, 2),
      );
      process.exit(1);
    }
    if (invoiceAfter[0].status !== invoiceStatusBefore) {
      await connection.rollback();
      console.log(
        JSON.stringify({ ok: false, phase: "status_guard", entity: "invoice" }, null, 2),
      );
      process.exit(1);
    }
    if (invoiceAfter[0].branding_snapshot_json !== invoiceSnapshotBefore) {
      await connection.rollback();
      console.log(
        JSON.stringify({ ok: false, phase: "snapshot_guard", entity: "invoice" }, null, 2),
      );
      process.exit(1);
    }
    if (quoteAfter[0].branch_id !== ONTARIO_BRANCH_ID) {
      await connection.rollback();
      console.log(
        JSON.stringify({ ok: false, phase: "branch_assertion", entity: "quote" }, null, 2),
      );
      process.exit(1);
    }
    if (invoiceAfter[0].branch_id !== ONTARIO_BRANCH_ID) {
      await connection.rollback();
      console.log(
        JSON.stringify({ ok: false, phase: "branch_assertion", entity: "invoice" }, null, 2),
      );
      process.exit(1);
    }

    await connection.commit();

    const post = await postCommitSnapshot(connection);
    const pass =
      post.quote?.branch_id === ONTARIO_BRANCH_ID
      && post.quote?.job_branch_id === ONTARIO_BRANCH_ID
      && post.invoiceSynced?.branch_id === ONTARIO_BRANCH_ID
      && post.invoiceExcluded?.branch_id == null;

    console.log(
      JSON.stringify(
        {
          ok: pass,
          phase: "complete",
          transaction: {
            committed: true,
            quoteAffectedRows: quoteAffected,
            invoiceAffectedRows: invoiceAffected,
            branchIdDerivedFromJob: ONTARIO_BRANCH_ID,
            quoteId: QUOTE_ID,
            invoiceId: INVOICE_ID,
            jobId: CANONICAL_JOB_ID,
            statusUnchanged: {
              quote: quoteStatusBefore,
              invoice: invoiceStatusBefore,
            },
            snapshotUnchanged: true,
            paymentsUntouched: true,
          },
          postCommit: post,
        },
        null,
        2,
      ),
    );

    process.exit(pass ? 0 : 1);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
