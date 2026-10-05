/**
 * Backfill technicians rows for active system-role technician memberships (Phoenix org).
 * Safe to re-run; uses same logic as ensureTechnicianForOrganizationMembership.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, {
  encoding: "utf8",
});
const publicUrl = new URL(JSON.parse(railwayJson).MYSQL_PUBLIC_URL);

const connection = await mysql.createConnection({
  host: publicUrl.hostname,
  port: publicUrl.port || 3306,
  user: decodeURIComponent(publicUrl.username),
  password: decodeURIComponent(publicUrl.password),
  database: "wizfield",
});

const [memberships] = await connection.query(
  `SELECT m.user_id, p.full_name, p.phone, u.is_active
   FROM memberships m
   JOIN users u ON u.id = m.user_id
   JOIN profiles p ON p.auth_user_id = m.user_id
   WHERE m.organization_id = ?
     AND m.status = 'active'
     AND m.role = 'technician'
     AND u.is_active = 1`,
  [PHOENIX_ORG_ID],
);

const results = [];

for (const row of memberships) {
  const displayName = String(row.full_name ?? "").trim() || "Technician";
  const [existing] = await connection.query(
    `SELECT id, is_active FROM technicians WHERE organization_id = ? AND auth_user_id = ? LIMIT 1`,
    [PHOENIX_ORG_ID, row.user_id],
  );

  if (existing.length > 0) {
    await connection.query(
      `UPDATE technicians SET is_active = 1, display_name = ?, phone = ? WHERE id = ?`,
      [displayName, row.phone ?? null, existing[0].id],
    );
    results.push({ user_id: row.user_id, action: "updated", technician_id: existing[0].id, displayName });
    continue;
  }

  const technicianId = randomUUID();
  await connection.query(
    `INSERT INTO technicians
      (id, organization_id, auth_user_id, display_name, phone, specialties, is_active, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, JSON_ARRAY(), 1, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [technicianId, PHOENIX_ORG_ID, row.user_id, displayName, row.phone ?? null],
  );
  results.push({ user_id: row.user_id, action: "created", technician_id: technicianId, displayName });
}

const [roster] = await connection.query(
  `SELECT id, display_name, auth_user_id, is_active FROM technicians WHERE organization_id = ? ORDER BY display_name`,
  [PHOENIX_ORG_ID],
);

console.log(JSON.stringify({ synced: results, roster }, null, 2));
await connection.end();
