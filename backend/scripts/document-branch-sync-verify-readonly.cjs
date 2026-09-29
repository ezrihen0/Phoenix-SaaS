/**
 * Read-only post-sync verification for document branch column sync.
 */
const mysql = require("mysql2/promise");

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const ONTARIO = "70ea744e-ce6d-4e5b-9384-a8f377493f27";
const QUOTE_ID = "f14b9b5a-58a7-46b0-8519-6e3cea891eb6";
const INVOICE_SYNCED = "cc8e393a-b29f-41d2-a6b3-9188251ed596";
const INVOICE_EXCLUDED = "ed1359d4-48a4-4ad1-8704-041c3bb65e89";
const PAYMENT_ID = "3f55e20b-a088-46e7-9e58-949143aeb4b7";

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [q] = await connection.query(
      `SELECT id, branch_id, status FROM quotes WHERE id = ?`,
      [QUOTE_ID],
    );
    const [inv] = await connection.query(
      `SELECT id, branch_id, status FROM invoices WHERE id IN (?, ?)`,
      [INVOICE_SYNCED, INVOICE_EXCLUDED],
    );
    const [pay] = await connection.query(
      `SELECT p.id, p.invoice_id, i.branch_id AS invoice_branch_id
       FROM invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       WHERE p.id = ?`,
      [PAYMENT_ID],
    );
    console.log(JSON.stringify({ ok: true, quote: q[0], invoices: inv, payment: pay[0] }, null, 2));
  } finally {
    await connection.end();
  }
}
main();
