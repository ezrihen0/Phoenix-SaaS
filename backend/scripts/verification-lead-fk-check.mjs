import mysql from "mysql2/promise";

const LEAD_ID = "c399045f-3b6d-4146-8e2d-132b3be6fb55";

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [[pbs]] = await connection.query(
  "SELECT COUNT(*) AS c FROM public_booking_submissions WHERE lead_id = ?",
  [LEAD_ID],
);
const [[rc]] = await connection.query(
  "SELECT COUNT(*) AS c FROM recent_calls WHERE matched_lead_id = ?",
  [LEAD_ID],
);

console.log(
  JSON.stringify({
    ok: true,
    lead_id: LEAD_ID,
    public_booking_submissions: Number(pbs.c),
    recent_calls_matched: Number(rc.c),
  }),
);

await connection.end();
