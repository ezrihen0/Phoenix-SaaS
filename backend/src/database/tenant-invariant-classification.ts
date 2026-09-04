/**
 * Read-only tenant invariant classification for production closeout (WF-AUDIT-P2-004).
 * Run: npm run tenant-invariant:classify:readonly --workspace backend
 */
import "dotenv/config";

import mysql from "mysql2/promise";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { requiredTables } from "./schema-manifest";
import { buildDataSourceOptions } from "./typeorm.config";
import { PHOENIX_ORG_ID, PHOENIX_ORG_SLUG } from "./workiz/workiz-production-mutation-guard";

type TenantClass = "A" | "B" | "C" | "D";

type TableClassification = {
  table: string;
  class: TenantClass;
  rationale: string;
  organizationColumn: string | null;
  schemaNullable: boolean | null;
  onDeleteSetNull: string[];
  totalRows: number | null;
  nullOrgRows: number | null;
  crossOrgMismatchRows: number | null;
  appScopingNote: string;
  launchNeed: string;
};

type SchemaColumnRow = {
  tableName: string;
  columnName: string;
  isNullable: string;
};

type FkMeta = {
  table: string;
  column: string;
  referencedTable: string;
  deleteRule: string;
};

const OUTPUT_DIR = join(__dirname, "..", "..", "_runtime_harness", "production-closeout-2026-09");

/** Manual classification — validated against schema + production counts at runtime. */
const TABLE_CLASS: Record<string, { class: TenantClass; rationale: string; appScopingNote: string; launchNeed: string; orgColumn?: string }> = {
  customers: { class: "A", rationale: "Core CRM tenant root", appScopingNote: "All CRM services filter organization_id from ActorContext", launchNeed: "App invariant + clean data sufficient" },
  leads: { class: "A", rationale: "Core CRM tenant root", appScopingNote: "Org-scoped queries in CRM services", launchNeed: "App invariant + clean data sufficient" },
  jobs: { class: "A", rationale: "Core CRM tenant root", appScopingNote: "Org-scoped queries; job access contract checks", launchNeed: "App invariant + clean data sufficient" },
  quotes: { class: "A", rationale: "Core CRM document", appScopingNote: "Org-scoped via job/customer relations", launchNeed: "App invariant + clean data sufficient" },
  quote_line_items: { class: "A", rationale: "Core CRM line items", appScopingNote: "Scoped through quote/org services", launchNeed: "App invariant + clean data sufficient" },
  invoices: { class: "A", rationale: "Core financial document", appScopingNote: "Org-scoped; payment recording validates org", launchNeed: "App invariant + clean data sufficient" },
  invoice_line_items: { class: "A", rationale: "Core financial line items", appScopingNote: "Scoped through invoice/org", launchNeed: "App invariant + clean data sufficient" },
  invoice_payments: { class: "A", rationale: "Payment ledger", appScopingNote: "Org-scoped in recording service", launchNeed: "App invariant + clean data sufficient" },
  invoice_documents: { class: "A", rationale: "Invoice attachments", appScopingNote: "Org-scoped document service", launchNeed: "App invariant + clean data sufficient" },
  warranty_certificates: { class: "A", rationale: "Post-job warranty records", appScopingNote: "Org-scoped warranty service", launchNeed: "App invariant + clean data sufficient" },
  services: { class: "A", rationale: "Org service catalog", appScopingNote: "Org-scoped settings/CRM", launchNeed: "App invariant + clean data sufficient" },
  technicians: { class: "A", rationale: "Org workforce", appScopingNote: "Org-scoped technician queries", launchNeed: "App invariant + clean data sufficient" },
  job_notes: { class: "A", rationale: "Job sub-records", appScopingNote: "Org-scoped via job", launchNeed: "App invariant + clean data sufficient" },
  job_status_events: { class: "A", rationale: "Job audit trail", appScopingNote: "Org-scoped via job", launchNeed: "App invariant + clean data sufficient" },
  inspections: { class: "A", rationale: "Inspection workspace", appScopingNote: "Org-scoped; isolation smoke PASS", launchNeed: "App invariant + clean data sufficient" },
  inspection_items: { class: "A", rationale: "Inspection sub-records", appScopingNote: "Org-scoped via inspection", launchNeed: "App invariant + clean data sufficient" },
  inspection_photos: { class: "A", rationale: "Inspection media", appScopingNote: "Org-scoped upload/retrieval", launchNeed: "App invariant + clean data sufficient" },
  inspection_required_fields: { class: "A", rationale: "Inspection config", appScopingNote: "Org-scoped via inspection", launchNeed: "App invariant + clean data sufficient" },
  pricebook_items: { class: "A", rationale: "Org pricebook", appScopingNote: "Org-scoped; snapshot isolation smoke", launchNeed: "App invariant + clean data sufficient" },
  pricebook_categories: { class: "A", rationale: "Org pricebook categories", appScopingNote: "Org-scoped category catalog", launchNeed: "App invariant + clean data sufficient" },
  pricebook_systems: { class: "A", rationale: "Org pricebook systems", appScopingNote: "Org-scoped system catalog", launchNeed: "App invariant + clean data sufficient" },
  pricebook_bundles: { class: "A", rationale: "Org pricebook bundles", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  pricebook_bundle_items: { class: "A", rationale: "Org pricebook bundle lines", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  pricebook_bundle_requirements: { class: "A", rationale: "Org pricebook bundle category requirements", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  inventory_items: { class: "A", rationale: "Org inventory", appScopingNote: "Org-scoped inventory service", launchNeed: "App invariant + clean data sufficient" },
  inventory_locations: { class: "A", rationale: "Org inventory locations", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  inventory_movements: { class: "A", rationale: "Org inventory movements", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  organization_settings: { class: "A", rationale: "Per-org configuration", appScopingNote: "Keyed by organization_id", launchNeed: "App invariant + clean data sufficient" },
  portal_magic_links: { class: "A", rationale: "Customer portal access", appScopingNote: "Org-scoped portal isolation smoke", launchNeed: "App invariant + clean data sufficient" },
  portal_sessions: { class: "A", rationale: "Customer portal sessions", appScopingNote: "Org-scoped portal service", launchNeed: "App invariant + clean data sufficient" },
  portal_access_events: { class: "A", rationale: "Portal audit", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  public_booking_submissions: { class: "A", rationale: "Org-bound public intake", appScopingNote: "Derived from org slug; isolation smoke", launchNeed: "App invariant + clean data sufficient" },
  memberships: { class: "A", rationale: "User-org membership", appScopingNote: "Auth resolves active org from membership", launchNeed: "App invariant + clean data sufficient", orgColumn: "organization_id" },
  organization_custom_roles: { class: "A", rationale: "Org RBAC", appScopingNote: "Team service org-scoped", launchNeed: "App invariant + clean data sufficient" },
  organization_team_entitlements: { class: "A", rationale: "Org seat limits", appScopingNote: "Team entitlement enforcement", launchNeed: "App invariant + clean data sufficient" },
  organization_enabled_languages: { class: "A", rationale: "Org language config", appScopingNote: "Language store org-scoped", launchNeed: "App invariant + clean data sufficient" },
  organization_language_entitlements: { class: "A", rationale: "Org language billing", appScopingNote: "Entitlement reprojection org-scoped", launchNeed: "App invariant + clean data sufficient" },
  organization_billing: { class: "A", rationale: "Org billing coverage link", appScopingNote: "Billing orchestration org-scoped", launchNeed: "App invariant + clean data sufficient" },
  controlled_access_grants: { class: "A", rationale: "Org operational access grants", appScopingNote: "Evaluated per organization_id", launchNeed: "App invariant + clean data sufficient" },
  customer_output_translation_records: { class: "A", rationale: "Org translation artifacts", appScopingNote: "Language store org-scoped", launchNeed: "App invariant + clean data sufficient" },
  translation_usage_ledger: { class: "A", rationale: "Org translation metering", appScopingNote: "Org-scoped ledger", launchNeed: "App invariant + clean data sufficient" },
  user_organization_language_preferences: { class: "A", rationale: "Per-user org language prefs", appScopingNote: "Preference isolation smoke", launchNeed: "App invariant + clean data sufficient" },
  home_ai_conversations: { class: "A", rationale: "Org AI sessions", appScopingNote: "Home AI org isolation smoke", launchNeed: "App invariant + clean data sufficient" },
  home_ai_messages: { class: "A", rationale: "Org AI messages", appScopingNote: "Scoped via conversation org", launchNeed: "App invariant + clean data sufficient" },
  ai_recommendation_runs: { class: "A", rationale: "Org AI recommendations", appScopingNote: "Org-scoped AI services", launchNeed: "App invariant + clean data sufficient" },
  ai_operator_drafts: { class: "A", rationale: "Org operator drafts", appScopingNote: "Copilot isolation smoke", launchNeed: "App invariant + clean data sufficient" },
  automation_templates: { class: "A", rationale: "Org automations", appScopingNote: "Org-scoped automation service", launchNeed: "App invariant + clean data sufficient" },
  automation_rules: { class: "A", rationale: "Org automations", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  automation_runs: { class: "A", rationale: "Org automation runs", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  automation_logs: { class: "A", rationale: "Org automation logs", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  automation_pending_actions: { class: "A", rationale: "Org automation queue", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  automation_scheduled_runs: { class: "A", rationale: "Org scheduled automations", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  automation_settings: { class: "A", rationale: "Org automation settings", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  crm_tasks: { class: "A", rationale: "Org CRM tasks", appScopingNote: "Org-scoped task queries", launchNeed: "App invariant + clean data sufficient" },
  marketing_profiles: { class: "A", rationale: "Org marketing profile", appScopingNote: "Marketing org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_connected_channels: { class: "A", rationale: "Org marketing channels", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_campaigns: { class: "A", rationale: "Org campaigns", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_campaign_items: { class: "A", rationale: "Org campaign items", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_automation_rules: { class: "A", rationale: "Org marketing automation", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_automation_runs: { class: "A", rationale: "Org marketing automation runs", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_opportunities: { class: "A", rationale: "Org marketing opportunities", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_content_drafts: { class: "A", rationale: "Org content drafts", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_content_variants: { class: "A", rationale: "Org content variants", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_oauth_states: { class: "A", rationale: "Org OAuth state", appScopingNote: "Org-scoped OAuth callback", launchNeed: "App invariant + clean data sufficient" },
  marketing_publish_jobs: { class: "A", rationale: "Org publish jobs", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  marketing_publish_attempts: { class: "A", rationale: "Org publish attempts", appScopingNote: "Org-scoped", launchNeed: "App invariant + clean data sufficient" },
  invoice_service_intelligence: { class: "C", rationale: "Historical Workiz classification artifacts", appScopingNote: "Historical import pipeline; read via service intelligence tools", launchNeed: "Historical data; no launch hardening required" },
  invoice_service_intelligence_components: { class: "C", rationale: "Historical classification components", appScopingNote: "Historical import metadata", launchNeed: "Historical data; no launch hardening required" },
  users: { class: "B", rationale: "Global identity; tenancy via memberships", appScopingNote: "Not tenant-owned; cross-org via membership only", launchNeed: "N/A — by design" },
  profiles: { class: "B", rationale: "Global user profile", appScopingNote: "Linked to users, not org rows", launchNeed: "N/A — by design" },
  auth_sessions: { class: "B", rationale: "Global sessions", appScopingNote: "Session resolves active org separately", launchNeed: "N/A — by design" },
  organizations: { class: "B", rationale: "Tenant registry root", appScopingNote: "Platform tenant table", launchNeed: "N/A — by design" },
  billing_accounts: { class: "B", rationale: "Cross-org payer layer (intentional)", appScopingNote: "Shared billing; org allocation via subscription items", launchNeed: "N/A — documented shared billing model" },
  billing_account_subscription_items: { class: "B", rationale: "Cross-org subscription allocation", appScopingNote: "allocated_organization_id nullable by design", launchNeed: "N/A — billing multi-org smoke PASS" },
  platform_operator_grants: { class: "B", rationale: "Platform operator capability", appScopingNote: "Platform-level grants", launchNeed: "N/A — by design" },
  team_rbac_audit_events: { class: "B", rationale: "Audit with nullable actor refs", appScopingNote: "Org_id present; user FK SET NULL on delete", launchNeed: "Audit retention; not operational leak path" },
  typeorm_migrations: { class: "B", rationale: "Migration bookkeeping", appScopingNote: "Not application data", launchNeed: "N/A" },
  stripe_webhook_event_receipts: { class: "B", rationale: "Dormant Stripe durability schema", appScopingNote: "Stripe runtime removed", launchNeed: "N/A — deferred SaaS billing" },
  voice_flows: { class: "B", rationale: "Deployment-wide Telnyx catalog", appScopingNote: "Not per-tenant in current schema", launchNeed: "Telephony deferred; not Phoenix CRM blocker" },
  sms_templates: { class: "C", rationale: "Raw-SQL telephony table; global in legacy schema", appScopingNote: "Telephony disabled for Phoenix launch", launchNeed: "Post-launch telephony hardening" },
  call_flow_configs: { class: "C", rationale: "Raw-SQL telephony; global settings", appScopingNote: "Telephony disabled", launchNeed: "Post-launch telephony hardening" },
  call_flow_business_hours: { class: "C", rationale: "Raw-SQL telephony", appScopingNote: "Telephony disabled", launchNeed: "Post-launch telephony hardening" },
  call_flow_ivr_options: { class: "C", rationale: "Raw-SQL telephony", appScopingNote: "Telephony disabled", launchNeed: "Post-launch telephony hardening" },
  callback_tasks: { class: "C", rationale: "Raw-SQL telephony", appScopingNote: "Isolation smoke exists; telephony optional", launchNeed: "Post-launch telephony hardening" },
  missed_call_sms_settings: { class: "C", rationale: "Raw-SQL telephony", appScopingNote: "Telephony disabled", launchNeed: "Post-launch telephony hardening" },
  missed_call_sms_cooldowns: { class: "C", rationale: "Raw-SQL telephony", appScopingNote: "Telephony disabled", launchNeed: "Post-launch telephony hardening" },
  recent_call_sms_logs: { class: "C", rationale: "Raw-SQL telephony", appScopingNote: "Telephony disabled", launchNeed: "Post-launch telephony hardening" },
  recent_call_activity_events: { class: "C", rationale: "Raw-SQL telephony", appScopingNote: "Telephony disabled", launchNeed: "Post-launch telephony hardening" },
  telnyx_webhook_event_receipts: { class: "B", rationale: "Webhook durability receipts", appScopingNote: "Integration ingress; not tenant CRM data", launchNeed: "N/A — telephony optional" },
  recent_calls: { class: "A", rationale: "Call history with org scope in app layer", appScopingNote: "Telephony isolation smoke; nullable org at DB", launchNeed: "App invariant sufficient while telephony disabled" },
  owned_phone_numbers: { class: "D", rationale: "Nullable tenant_id; globally unique numbers", appScopingNote: "Prior audit: indirect ownership model", launchNeed: "Owner decision for telephony activation only" },
  txt_conversations: { class: "C", rationale: "TXT schema tenant ownership gaps (prior P0 telephony audit)", appScopingNote: "Telephony disabled; isolation smoke for messaging", launchNeed: "Post-launch telephony hardening — not Phoenix daily CRM blocker" },
  txt_messages: { class: "C", rationale: "TXT schema tenant ownership gaps", appScopingNote: "Telephony disabled", launchNeed: "Post-launch telephony hardening" },
};

const CROSS_ORG_CHECKS: Array<{ name: string; sql: string }> = [
  {
    name: "invoices_vs_jobs",
    sql: `SELECT COUNT(*) AS c FROM invoices i INNER JOIN jobs j ON j.id = i.job_id WHERE i.organization_id <> j.organization_id`,
  },
  {
    name: "invoice_payments_vs_invoices",
    sql: `SELECT COUNT(*) AS c FROM invoice_payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE p.organization_id <> i.organization_id`,
  },
  {
    name: "jobs_vs_customers",
    sql: `SELECT COUNT(*) AS c FROM jobs j INNER JOIN customers c ON c.id = j.customer_id WHERE j.organization_id <> c.organization_id`,
  },
  {
    name: "quotes_vs_jobs",
    sql: `SELECT COUNT(*) AS c FROM quotes q INNER JOIN jobs j ON j.id = q.job_id WHERE q.organization_id <> j.organization_id`,
  },
  {
    name: "memberships_vs_organizations",
    sql: `SELECT COUNT(*) AS c FROM memberships m LEFT JOIN organizations o ON o.id = m.organization_id WHERE m.organization_id IS NOT NULL AND o.id IS NULL`,
  },
];

async function loadSchemaMeta(connection: mysql.Connection, database: string) {
  const [columnRows] = await connection.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, IS_NULLABLE AS isNullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND COLUMN_NAME IN ('organization_id', 'tenant_id')`,
    [database],
  ) as [SchemaColumnRow[], unknown];

  const [fkRows] = await connection.query(
    `SELECT kcu.TABLE_NAME AS \`table\`, kcu.COLUMN_NAME AS \`column\`, kcu.REFERENCED_TABLE_NAME AS referencedTable,
            rc.DELETE_RULE AS deleteRule
     FROM information_schema.KEY_COLUMN_USAGE kcu
     INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
       AND kcu.COLUMN_NAME IN ('organization_id', 'tenant_id')`,
    [database],
  ) as [FkMeta[], unknown];

  return { columnRows, fkRows };
}

async function safeCount(connection: mysql.Connection, table: string, where = "") {
  try {
    const [rows] = await connection.query(`SELECT COUNT(*) AS c FROM \`${table}\`${where}`) as [{ c: number }[], unknown];
    return Number(rows[0]?.c ?? 0);
  } catch {
    return null;
  }
}

async function main() {
  const options = buildDataSourceOptions();
  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("tenant-invariant:classify:readonly supports MySQL only.");
  }

  const database = options.database as string;
  const connection = await mysql.createConnection({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    user: options.username ?? "root",
    password: options.password ?? "",
    database,
  });

  const { columnRows, fkRows } = await loadSchemaMeta(connection, database);
  const nullableByTable = new Map<string, boolean>();
  const orgColumnByTable = new Map<string, string>();
  for (const row of columnRows) {
    nullableByTable.set(row.tableName, row.isNullable === "YES");
    orgColumnByTable.set(row.tableName, row.columnName);
  }

  const setNullFks = new Map<string, string[]>();
  for (const row of fkRows as FkMeta[]) {
    if (row.deleteRule !== "SET NULL") continue;
    const key = row.table;
    const existing = setNullFks.get(key) ?? [];
    existing.push(`${row.column}->${row.referencedTable}`);
    setNullFks.set(key, existing);
  }

  const tables = [...requiredTables];
  const classifications: TableClassification[] = [];

  for (const table of tables) {
    const meta = TABLE_CLASS[table] ?? {
      class: "D" as TenantClass,
      rationale: "Unclassified in closeout register — needs owner review",
      appScopingNote: "Manual review required",
      launchNeed: "Owner decision",
    };
    const orgColumn = meta.orgColumn ?? orgColumnByTable.get(table) ?? null;
    const totalRows = await safeCount(connection, table);
    const nullOrgRows = orgColumn
      ? await safeCount(connection, table, ` WHERE \`${orgColumn}\` IS NULL`)
      : null;

    classifications.push({
      table,
      class: meta.class,
      rationale: meta.rationale,
      organizationColumn: orgColumn,
      schemaNullable: nullableByTable.has(table) ? nullableByTable.get(table)! : null,
      onDeleteSetNull: setNullFks.get(table) ?? [],
      totalRows,
      nullOrgRows,
      crossOrgMismatchRows: null,
      appScopingNote: meta.appScopingNote,
      launchNeed: meta.launchNeed,
    });
  }

  const crossOrgResults: Record<string, number> = {};
  for (const check of CROSS_ORG_CHECKS) {
    const [rows] = await connection.query(check.sql) as [{ c: number }[], unknown];
    crossOrgResults[check.name] = Number(rows[0]?.c ?? 0);
  }

  const [[phoenixOrg]] = await connection.query(
    `SELECT id, slug, name FROM organizations WHERE id = ? OR slug = ? LIMIT 1`,
    [PHOENIX_ORG_ID, PHOENIX_ORG_SLUG],
  ) as [[{ id: string; slug: string; name: string } | undefined], unknown];

  const aTablesWithNullOrg = classifications.filter((row) => row.class === "A" && (row.nullOrgRows ?? 0) > 0);
  const aTablesWithCrossOrg = Object.values(crossOrgResults).some((count) => count > 0);

  const report = {
    generatedAt: new Date().toISOString(),
    database,
    phoenix: phoenixOrg ?? { id: PHOENIX_ORG_ID, slug: PHOENIX_ORG_SLUG, found: false },
    summary: {
      tablesClassified: classifications.length,
      classCounts: {
        A: classifications.filter((r) => r.class === "A").length,
        B: classifications.filter((r) => r.class === "B").length,
        C: classifications.filter((r) => r.class === "C").length,
        D: classifications.filter((r) => r.class === "D").length,
      },
      aTablesWithNullOrg: aTablesWithNullOrg.map((r) => ({ table: r.table, nullOrgRows: r.nullOrgRows, totalRows: r.totalRows })),
      crossOrgChecks: crossOrgResults,
      launchBlocker: aTablesWithNullOrg.length > 0 || aTablesWithCrossOrg,
      phaseVerdict: aTablesWithNullOrg.length === 0 && !aTablesWithCrossOrg ? "CLOSE" : "STOP_FOR_REVIEW",
    },
    classifications,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, "tenant-invariant-classification.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`report_written:${outPath}`);

  await connection.end();

  if (report.summary.launchBlocker) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
