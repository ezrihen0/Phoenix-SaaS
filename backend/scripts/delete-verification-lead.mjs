/**
 * Remove activation-verify public booking artifact (submission + lead) when unambiguous.
 */
import mysql from "mysql2/promise";

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const LEAD_ID = process.env.VERIFY_LEAD_ID?.trim();
if (!LEAD_ID) {
  console.error("Set VERIFY_LEAD_ID to the lead UUID to delete.");
  process.exit(1);
}
const VERIFY_EMAIL = "verify@phoenixfireplace.com";
const VERIFY_NAME = "Phoenix Activation Verify";

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    await connection.beginTransaction();

    const [matches] = await connection.query(
      `SELECT id FROM leads
       WHERE organization_id = ? AND id = ? AND email = ? AND full_name = ?`,
      [PHOENIX_ORG_ID, LEAD_ID, VERIFY_EMAIL, VERIFY_NAME],
    );

    if (matches.length !== 1) {
      throw new Error(`Refusing delete: expected 1 lead match, got ${matches.length}.`);
    }

    const [subRows] = await connection.query(
      `SELECT id, organization_id, lead_id FROM public_booking_submissions WHERE lead_id = ?`,
      [LEAD_ID],
    );

    if (subRows.length > 1) {
      throw new Error(`Refusing delete: expected at most 1 booking submission, got ${subRows.length}.`);
    }

    if (subRows.length === 1 && subRows[0].organization_id !== PHOENIX_ORG_ID) {
      throw new Error("Refusing delete: booking submission organization mismatch.");
    }

    let deletedSubmissions = 0;
    if (subRows.length === 1) {
      const [subDel] = await connection.query(
        `DELETE FROM public_booking_submissions WHERE id = ? AND lead_id = ? AND organization_id = ?`,
        [subRows[0].id, LEAD_ID, PHOENIX_ORG_ID],
      );
      deletedSubmissions = subDel.affectedRows;
    }

    const [leadDel] = await connection.query(
      `DELETE FROM leads
       WHERE organization_id = ? AND id = ? AND email = ? AND full_name = ?`,
      [PHOENIX_ORG_ID, LEAD_ID, VERIFY_EMAIL, VERIFY_NAME],
    );

    if (leadDel.affectedRows !== 1) {
      throw new Error(`Lead delete affected ${leadDel.affectedRows} rows.`);
    }

    await connection.commit();

    console.log(
      JSON.stringify(
        {
          ok: true,
          deleted_public_booking_submissions: deletedSubmissions,
          deleted_leads: leadDel.affectedRows,
          lead_id: LEAD_ID,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error.message || error) }));
  process.exit(1);
});
