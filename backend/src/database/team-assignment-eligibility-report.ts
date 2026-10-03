import "dotenv/config";
import "reflect-metadata";

import mysql from "mysql2/promise";

import { buildDataSourceOptions } from "./typeorm.config";

type Row = {
  organization_id: string;
  organization_name: string;
  assignable_state: "null" | "true" | "false";
  member_count: number;
};

async function main() {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Assignment eligibility report supports MySQL only.");
  }

  const connection = await mysql.createConnection({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    user: options.username ?? "root",
    password: options.password ?? "",
    database: options.database,
  });

  try {
    const [rows] = await connection.query(
      `
        SELECT
          m.organization_id,
          o.name AS organization_name,
          CASE
            WHEN m.assignable_to_jobs IS NULL THEN 'null'
            WHEN m.assignable_to_jobs = 1 THEN 'true'
            ELSE 'false'
          END AS assignable_state,
          COUNT(*) AS member_count
        FROM memberships m
        INNER JOIN organizations o ON o.id = m.organization_id
        WHERE m.status IN ('active', 'invited', 'suspended')
        GROUP BY m.organization_id, o.name, assignable_state
        ORDER BY o.name ASC, assignable_state ASC
      `,
    );

    const [nullOrgs] = await connection.query(
      `
        SELECT organization_id, COUNT(*) AS null_count
        FROM memberships
        WHERE status IN ('active', 'invited', 'suspended')
          AND assignable_to_jobs IS NULL
        GROUP BY organization_id
      `,
    );

    const breakdown = rows as Row[];
    const organizationsWithNullAssignable = nullOrgs as Array<{ organization_id: string; null_count: number }>;

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      database: options.database,
      breakdown,
      organizationsWithNullAssignable,
      totalNullMemberships: organizationsWithNullAssignable.reduce((sum, row) => sum + Number(row.null_count), 0),
    }, null, 2));
  } finally {
    await connection.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
