/**
 * Resolve Michael report failed imports on Phoenix production (read match + update payloads).
 * Does NOT run import — call POST .../retry-failed-imports after this script.
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

config({ path: resolve(process.cwd(), "backend/.env") });

const PHOENIX_ORG_ID = "8d5bc762-eb13-43e5-85a1-723477adb47c";
const BATCH_ID = "da410a3f-658b-4c8a-8c9f-7baba6b06da6";

function normalizeEmail(value) {
  return value?.trim().toLowerCase() ?? null;
}

function normalizePostal(value) {
  return value?.replace(/\s+/g, "").trim().toUpperCase() ?? "";
}

function normalizeName(value) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeAddressLine1(value) {
  return value?.trim().toLowerCase().replace(/\./g, "") ?? "";
}

function addressKey(line1, postal) {
  return `${normalizeAddressLine1(line1)}|${normalizePostal(postal)}`;
}

function connectProduction() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const railwayJson = execSync(`${npx} --yes @railway/cli variables --service MySQL --json`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const mysqlVars = JSON.parse(railwayJson);
  const publicUrl = new URL(mysqlVars.MYSQL_PUBLIC_URL);
  publicUrl.pathname = "/wizfield";
  return mysql.createConnection({
    host: publicUrl.hostname,
    port: Number(publicUrl.port || 3306),
    user: decodeURIComponent(publicUrl.username),
    password: decodeURIComponent(publicUrl.password),
    database: "wizfield",
  });
}

async function loadCustomers(connection) {
  const [rows] = await connection.query(
    `SELECT id, full_name, email, phone, service_address_line_1, service_address_line_2,
            service_city, service_postal_code, service_state_or_region
     FROM customers WHERE organization_id = ?`,
    [PHOENIX_ORG_ID],
  );
  return rows;
}

function scoreCustomerMatch(customer, payload) {
  const reasons = [];
  const payloadEmail = normalizeEmail(payload.customerEmail);
  const customerEmail = normalizeEmail(customer.email);

  if (payloadEmail && customerEmail && payloadEmail === customerEmail) {
    reasons.push("email_exact");
  }

  if (normalizeName(customer.full_name) === normalizeName(payload.customerName)) {
    reasons.push("name_exact");
  }

  if (
    addressKey(customer.service_address_line_1, customer.service_postal_code) ===
    addressKey(payload.serviceAddressLine1, payload.servicePostalCode)
  ) {
    reasons.push("address_exact");
  }

  return reasons;
}

function pickCustomer(customers, payload) {
  const scored = customers
    .map((customer) => ({ customer, reasons: scoreCustomerMatch(customer, payload) }))
    .filter((entry) => entry.reasons.length > 0);

  if (scored.length === 0) {
    return { action: "create", customerId: null, reasons: ["no_match"] };
  }

  const emailExact = scored.filter((entry) => entry.reasons.includes("email_exact"));
  if (emailExact.length === 1) {
    return {
      action: "link",
      customerId: emailExact[0].customer.id,
      reasons: emailExact[0].reasons,
    };
  }
  if (emailExact.length > 1) {
    const nameAligned = emailExact.filter(
      (entry) => entry.reasons.includes("name_exact") || entry.reasons.includes("address_exact"),
    );
    if (nameAligned.length === 1) {
      return { action: "link", customerId: nameAligned[0].customer.id, reasons: nameAligned[0].reasons };
    }
    return { action: "ambiguous", customerId: null, reasons: ["multiple_email_matches"], candidates: emailExact };
  }

  const strong = scored.filter(
    (entry) => entry.reasons.includes("name_exact") && entry.reasons.includes("address_exact"),
  );
  if (strong.length === 1) {
    return { action: "link", customerId: strong[0].customer.id, reasons: strong[0].reasons };
  }

  const addressOnly = scored.filter((entry) => entry.reasons.includes("address_exact"));
  if (addressOnly.length === 1) {
    const entry = addressOnly[0];
    const placeholderName = /^customer\s+\d+$/i.test(payload.customerName.trim());
    const firstNameOnly = !payload.customerName.includes(" ") && payload.customerName.trim().length > 0;
    if (placeholderName || entry.reasons.includes("name_exact")) {
      return { action: "link", customerId: entry.customer.id, reasons: entry.reasons };
    }
    if (!firstNameOnly) {
      return { action: "link", customerId: entry.customer.id, reasons: entry.reasons };
    }
    return { action: "ambiguous", customerId: null, reasons: ["address_only_first_name"], candidates: addressOnly };
  }

  const nameOnly = scored.filter((entry) => entry.reasons.includes("name_exact"));
  if (nameOnly.length === 1 && !payload.customerName.includes(" ") === false) {
    /* full name exact single */
  }
  if (nameOnly.length === 1) {
    const onlyFirstName = !payload.customerName.trim().includes(" ");
    if (!onlyFirstName) {
      return { action: "link", customerId: nameOnly[0].customer.id, reasons: nameOnly[0].reasons };
    }
    return { action: "ambiguous", customerId: null, reasons: ["first_name_only_match"], candidates: nameOnly };
  }

  if (strong.length > 1) {
    return { action: "ambiguous", customerId: null, reasons: ["multiple_name_address"], candidates: strong };
  }

  return { action: "create", customerId: null, reasons: ["no_confident_match"] };
}

async function main() {
  const connection = await connectProduction();
  const report = [];

  try {
    const customers = await loadCustomers(connection);
    const [entries] = await connection.query(
      `SELECT id, client_row_key, sort_order, status, payload_json, customer_id, job_id, invoice_id
       FROM phoenix_field_historical_report_entries
       WHERE batch_id = ? AND organization_id = ?
       ORDER BY sort_order ASC`,
      [BATCH_ID, PHOENIX_ORG_ID],
    );

    for (const entry of entries) {
      if (entry.status === "imported") {
        report.push({
          entryId: entry.id,
          customerName: entry.payload_json.customerName,
          status: "skipped_imported",
          customerId: entry.customer_id,
          invoiceId: entry.invoice_id,
        });
        continue;
      }

      if (entry.status !== "failed") {
        continue;
      }

      const payload = typeof entry.payload_json === "string" ? JSON.parse(entry.payload_json) : entry.payload_json;
      const decision = pickCustomer(customers, payload);

      if (decision.action === "link") {
        payload.customerId = decision.customerId;
        payload.createNewCustomer = false;
      } else if (decision.action === "create") {
        payload.customerId = null;
        payload.createNewCustomer = true;
      } else {
        report.push({
          entryId: entry.id,
          customerName: payload.customerName,
          status: "unresolved_ambiguous",
          decision,
        });
        continue;
      }

      await connection.query(
        `UPDATE phoenix_field_historical_report_entries
         SET payload_json = ?, last_error_code = NULL, last_error_message = NULL
         WHERE id = ? AND organization_id = ?`,
        [JSON.stringify(payload), entry.id, PHOENIX_ORG_ID],
      );

      report.push({
        entryId: entry.id,
        customerName: payload.customerName,
        status: decision.action,
        customerId: payload.customerId,
        matchReasons: decision.reasons,
      });
    }

    console.log(JSON.stringify({ batchId: BATCH_ID, resolved: report }, null, 2));
  } finally {
    await connection.end();
  }
}

void main();
