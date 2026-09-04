import "dotenv/config";
import "reflect-metadata";

import { randomUUID } from "crypto";

import mysql from "mysql2/promise";
import { HttpException } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions";

import { DocumentPricingService } from "../crm/document-pricing.service";
import { DocumentSnapshotService } from "../crm/document-snapshot.service";
import type { DocumentLineItemInput } from "../crm/validation";
import type { CustomerOutputTranslationService } from "../language-store/customer-output-translation.service";
import { OrganizationEntity } from "./entities/organization.entity";
import { PricebookBundleItemEntity } from "./entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "./entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "./entities/pricebook-item.entity";
import { InvoiceLineItemEntity } from "./entities/invoice-line-item.entity";
import { QuoteLineItemEntity } from "./entities/quote-line-item.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import { verifyDatabaseSchema } from "./verify-schema";

type SmokeStatus = "PASS" | "FAIL" | "SKIP";

type SmokeResult = {
  name: string;
  status: SmokeStatus;
  detail?: unknown;
};

type SmokeSummary = {
  ok: boolean;
  database: string;
  phases: {
    databaseCreate: SmokeStatus;
    migrations: SmokeStatus;
    schemaVerify: SmokeStatus;
    seeding: SmokeStatus;
    cleanup: SmokeStatus;
  };
  results: SmokeResult[];
  skipped: SmokeResult[];
  errors: string[];
  cleanup: {
    droppedDatabase: boolean;
    removedPhotoFiles: string[];
  };
};

type SeededCatalog = {
  orgA: OrganizationEntity;
  orgB: OrganizationEntity;
  itemA: PricebookItemEntity;
  itemB: PricebookItemEntity;
  itemAInactive: PricebookItemEntity;
  bundleGoodA: PricebookBundleEntity;
  bundleTaintedA: PricebookBundleEntity;
  bundleUnavailableA: PricebookBundleEntity;
  bundleB: PricebookBundleEntity;
};

function requireMySqlOptions(): MysqlConnectionOptions {
  const options = buildDataSourceOptions();

  if (options.type !== "mysql" && options.type !== "mariadb") {
    throw new Error("Document snapshot isolation smoke test currently supports MySQL only.");
  }

  return {
    ...(options as MysqlConnectionOptions),
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 3306,
    username: options.username ?? "root",
    password: options.password ?? "",
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}

function normalizeBooleanFlag(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function extractErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse() as { error?: { code?: string; message?: string } };
    return response?.error?.code ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createSummary(database: string): SmokeSummary {
  return {
    ok: false,
    database,
    phases: {
      databaseCreate: "FAIL",
      migrations: "FAIL",
      schemaVerify: "FAIL",
      seeding: "FAIL",
      cleanup: "FAIL",
    },
    results: [],
    skipped: [],
    errors: [],
    cleanup: {
      droppedDatabase: false,
      removedPhotoFiles: [],
    },
  };
}

async function expectPass(summary: SmokeSummary, name: string, run: () => Promise<unknown>) {
  try {
    const detail = await run();
    summary.results.push({ name, status: "PASS", detail });
  } catch (error) {
    summary.results.push({ name, status: "FAIL", detail: extractErrorCode(error) });
  }
}

async function expectApiError(
  summary: SmokeSummary,
  name: string,
  expectedCodes: string[],
  run: () => Promise<unknown>,
) {
  try {
    await run();
    summary.results.push({ name, status: "FAIL", detail: "Expected API rejection but call succeeded." });
  } catch (error) {
    const code = extractErrorCode(error);
    summary.results.push({
      name,
      status: expectedCodes.includes(code) ? "PASS" : "FAIL",
      detail: code,
    });
  }
}

function createMinimalPricebookItem(input: {
  organizationId: string;
  sku: string;
  name: string;
  warrantyMonths: number | null;
  customerPriceCents: number;
  isActive: boolean;
}) {
  return {
    organization_id: input.organizationId,
    internal_sku: input.sku,
    name: input.name,
    customer_description: null,
    internal_description: null,
    item_type: "service" as const,
    category_id: null,
    trade_area: null,
    service_area: null,
    tags: [],
    unit_of_measure: "each" as const,
    base_cost_cents: 0,
    material_cost_cents: 0,
    labor_cost_cents: 0,
    customer_price_cents: input.customerPriceCents,
    minimum_price_cents: null,
    estimated_labor_minutes: null,
    warranty_months: input.warrantyMonths,
    requires_permit: false,
    is_popular: false,
    is_active: input.isActive,
    sort_order: 0,
    archived_at: null,
  };
}

async function seedCatalog(dataSource: DataSource, token: string): Promise<SeededCatalog> {
  const orgRepo = dataSource.getRepository(OrganizationEntity);
  const itemRepo = dataSource.getRepository(PricebookItemEntity);
  const bundleRepo = dataSource.getRepository(PricebookBundleEntity);
  const bundleItemRepo = dataSource.getRepository(PricebookBundleItemEntity);

  const orgA = await orgRepo.save(
    orgRepo.create({
      name: `Doc Snap Org A ${token}`,
      slug: `doc-snap-a-${token}`,
      is_active: true,
    }),
  );

  const orgB = await orgRepo.save(
    orgRepo.create({
      name: `Doc Snap Org B ${token}`,
      slug: `doc-snap-b-${token}`,
      is_active: true,
    }),
  );

  const itemA = await itemRepo.save(
    itemRepo.create(
      createMinimalPricebookItem({
        organizationId: orgA.id,
        sku: `SKU-A-${token}`,
        name: "Org A Service Line",
        warrantyMonths: 24,
        customerPriceCents: 5_000,
        isActive: true,
      }),
    ),
  );

  const itemB = await itemRepo.save(
    itemRepo.create(
      createMinimalPricebookItem({
        organizationId: orgB.id,
        sku: `SKU-B-${token}`,
        name: "Org B Service Line",
        warrantyMonths: 12,
        customerPriceCents: 3_000,
        isActive: true,
      }),
    ),
  );

  const itemAInactive = await itemRepo.save(
    itemRepo.create(
      createMinimalPricebookItem({
        organizationId: orgA.id,
        sku: `SKU-A-INACT-${token}`,
        name: "Org A Inactive Line",
        warrantyMonths: 6,
        customerPriceCents: 1_000,
        isActive: false,
      }),
    ),
  );

  const bundleGoodA = await bundleRepo.save(
    bundleRepo.create({
      organization_id: orgA.id,
      name: `Bundle Good A ${token}`,
      description: null,
      is_active: true,
      archived_at: null,
    }),
  );

  await bundleItemRepo.save(
    bundleItemRepo.create({
      organization_id: orgA.id,
      bundle_id: bundleGoodA.id,
      pricebook_item_id: itemA.id,
      default_quantity: "1",
      sort_order: 0,
      archived_at: null,
    }),
  );

  const bundleTaintedA = await bundleRepo.save(
    bundleRepo.create({
      organization_id: orgA.id,
      name: `Bundle Tainted A ${token}`,
      description: null,
      is_active: true,
      archived_at: null,
    }),
  );

  await bundleItemRepo.save(
    bundleItemRepo.create({
      organization_id: orgA.id,
      bundle_id: bundleTaintedA.id,
      pricebook_item_id: itemB.id,
      default_quantity: "1",
      sort_order: 0,
      archived_at: null,
    }),
  );

  const bundleUnavailableA = await bundleRepo.save(
    bundleRepo.create({
      organization_id: orgA.id,
      name: `Bundle Unavailable A ${token}`,
      description: null,
      is_active: true,
      archived_at: null,
    }),
  );

  await bundleItemRepo.save(
    bundleItemRepo.create({
      organization_id: orgA.id,
      bundle_id: bundleUnavailableA.id,
      pricebook_item_id: itemAInactive.id,
      default_quantity: "1",
      sort_order: 0,
      archived_at: null,
    }),
  );

  const bundleB = await bundleRepo.save(
    bundleRepo.create({
      organization_id: orgB.id,
      name: `Bundle B ${token}`,
      description: null,
      is_active: true,
      archived_at: null,
    }),
  );

  await bundleItemRepo.save(
    bundleItemRepo.create({
      organization_id: orgB.id,
      bundle_id: bundleB.id,
      pricebook_item_id: itemB.id,
      default_quantity: "1",
      sort_order: 0,
      archived_at: null,
    }),
  );

  return {
    orgA,
    orgB,
    itemA,
    itemB,
    itemAInactive,
    bundleGoodA,
    bundleTaintedA,
    bundleUnavailableA,
    bundleB,
  };
}

async function runSnapshotChecks(summary: SmokeSummary, service: DocumentSnapshotService, catalog: SeededCatalog) {
  summary.phases.seeding = "PASS";
  const quoteContextForOrgA = {
    organizationId: catalog.orgA.id,
    documentKind: "quote" as const,
    documentId: "smoke-quote-org-a",
  };

  await expectPass(summary, "Same-org pricebook item snapshot succeeds", async () => {
    const lines: DocumentLineItemInput[] = [
      {
        kind: "pricebook_item",
        documentLineKey: "same-org-item",
        pricebookItemId: catalog.itemA.id,
        quantity: "2",
        sortOrder: 0,
      },
    ];
    const drafts = await service.buildLineDrafts(lines, quoteContextForOrgA);
    if (drafts.length !== 1) {
      throw new Error(`Expected 1 draft line, got ${drafts.length}.`);
    }
    const d = drafts[0];
    if (d.sku_snapshot !== catalog.itemA.internal_sku || d.name_snapshot !== catalog.itemA.name) {
      throw new Error("Draft SKU/name mismatch for Org A item.");
    }
    if (d.warranty_months_snapshot !== 24) {
      throw new Error(`Expected warranty_months_snapshot 24, got ${d.warranty_months_snapshot}.`);
    }
    if (d.unit_price_cents_snapshot !== 5_000) {
      throw new Error(`Expected unit_price_cents_snapshot 5000, got ${d.unit_price_cents_snapshot}.`);
    }
    return { draftCount: drafts.length, warranty_months_snapshot: d.warranty_months_snapshot };
  });

  await expectPass(summary, "Warranty override and bundle metadata persist on item snapshot", async () => {
    const lines: DocumentLineItemInput[] = [
      {
        kind: "pricebook_item",
        documentLineKey: "bundle-resolved-item",
        pricebookItemId: catalog.itemA.id,
        quantity: "1",
        sortOrder: 1,
        unitPriceCentsOverride: 0,
        warrantyMonthsOverride: 36,
        pricebookBundleId: catalog.bundleGoodA.id,
        bundleRequirementId: null,
        catalogUnitPriceCentsSnapshot: 5_000,
      },
    ];
    const drafts = await service.buildLineDrafts(lines, quoteContextForOrgA);
    if (drafts.length !== 1) {
      throw new Error(`Expected 1 draft line, got ${drafts.length}.`);
    }
    const draft = drafts[0];
    if (draft.warranty_months_snapshot !== 36) {
      throw new Error(`Expected warranty_months_snapshot 36, got ${draft.warranty_months_snapshot}.`);
    }
    if (draft.unit_price_cents_snapshot !== 0) {
      throw new Error(`Expected unit_price_cents_snapshot 0, got ${draft.unit_price_cents_snapshot}.`);
    }
    if (draft.catalog_unit_price_cents_snapshot !== 5_000) {
      throw new Error(
        `Expected catalog_unit_price_cents_snapshot 5000, got ${draft.catalog_unit_price_cents_snapshot}.`,
      );
    }
    if (draft.pricebook_bundle_id !== catalog.bundleGoodA.id) {
      throw new Error("Expected pricebook_bundle_id to match resolved bundle.");
    }
    return {
      warranty_months_snapshot: draft.warranty_months_snapshot,
      catalog_unit_price_cents_snapshot: draft.catalog_unit_price_cents_snapshot,
    };
  });

  await expectApiError(
    summary,
    "Cross-org pricebook item snapshot is rejected",
    ["pricebook_item_not_found"],
    () =>
      service.buildLineDrafts(
        [
          {
            kind: "pricebook_item",
            documentLineKey: "cross-org-item",
            pricebookItemId: catalog.itemB.id,
            quantity: "1",
            sortOrder: 0,
          },
        ],
        quoteContextForOrgA,
      ),
  );

  await expectPass(summary, "Same-org bundle snapshot succeeds", async () => {
    const lines: DocumentLineItemInput[] = [
      {
        kind: "pricebook_bundle",
        pricebookBundleId: catalog.bundleGoodA.id,
        sortOrder: 0,
      },
    ];
    const drafts = await service.buildLineDrafts(lines, quoteContextForOrgA);
    if (drafts.length !== 1) {
      throw new Error(`Expected 1 expanded bundle draft, got ${drafts.length}.`);
    }
    const d = drafts[0];
    if (d.warranty_months_snapshot !== 24 || d.pricebook_item_id !== catalog.itemA.id) {
      throw new Error("Bundle expansion mismatch for Org A catalog.");
    }
    return { draftCount: drafts.length, warranty_months_snapshot: d.warranty_months_snapshot };
  });

  await expectApiError(
    summary,
    "Cross-org bundle snapshot is rejected",
    ["pricebook_bundle_not_found"],
    () =>
      service.buildLineDrafts(
        [
          {
            kind: "pricebook_bundle",
            pricebookBundleId: catalog.bundleB.id,
            sortOrder: 0,
          },
        ],
        quoteContextForOrgA,
      ),
  );

  await expectApiError(
    summary,
    "Org A bundle with Org B nested item is rejected",
    ["pricebook_bundle_item_org_mismatch"],
    () =>
      service.buildLineDrafts(
        [
          {
            kind: "pricebook_bundle",
            pricebookBundleId: catalog.bundleTaintedA.id,
            sortOrder: 0,
          },
        ],
        quoteContextForOrgA,
      ),
  );

  await expectApiError(
    summary,
    "Bundle with inactive nested item is rejected",
    ["pricebook_bundle_item_unavailable"],
    () =>
      service.buildLineDrafts(
        [
          {
            kind: "pricebook_bundle",
            pricebookBundleId: catalog.bundleUnavailableA.id,
            sortOrder: 0,
          },
        ],
        quoteContextForOrgA,
      ),
  );
}

async function main() {
  const options = requireMySqlOptions();
  const databaseName = process.env.DB_SMOKE_DATABASE?.trim() || `wizfield_doc_snap_verify_${Date.now()}`;
  const shouldDrop = normalizeBooleanFlag(process.env.DB_SMOKE_DROP, false);
  const summary = createSummary(databaseName);

  const adminConnection = await mysql.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    multipleStatements: true,
  });

  let dataSource: DataSource | null = null;

  try {
    if (shouldDrop) {
      await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    }

    await adminConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    summary.phases.databaseCreate = "PASS";

    dataSource = new DataSource({
      ...options,
      database: databaseName,
      synchronize: false,
      migrationsRun: false,
      logging: false,
    });

    await dataSource.initialize();
    await dataSource.runMigrations();
    summary.phases.migrations = "PASS";

    await verifyDatabaseSchema(dataSource);
    summary.phases.schemaVerify = "PASS";

    const service = new DocumentSnapshotService(
      dataSource.getRepository(InvoiceLineItemEntity),
      dataSource.getRepository(QuoteLineItemEntity),
      dataSource.getRepository(PricebookItemEntity),
      dataSource.getRepository(PricebookBundleEntity),
      dataSource.getRepository(PricebookBundleItemEntity),
      new DocumentPricingService(),
      {
        requireFinalizedDocumentTranslation: async () => {
          throw new Error("Unexpected translation lookup in document snapshot org isolation smoke test.");
        },
      } as unknown as CustomerOutputTranslationService,
    );

    const token = randomUUID().slice(0, 8);
    const catalog = await seedCatalog(dataSource, token);
    await runSnapshotChecks(summary, service, catalog);
  } catch (error) {
    summary.errors.push(extractErrorCode(error));
  } finally {
    try {
      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }

      if (shouldDrop) {
        await adminConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        summary.cleanup.droppedDatabase = true;
      }

      summary.phases.cleanup = "PASS";
    } catch (error) {
      summary.errors.push(`cleanup: ${extractErrorCode(error)}`);
    } finally {
      await adminConnection.end();
    }
  }

  const skipped = summary.results.filter((result) => result.status === "SKIP");
  summary.skipped = skipped;
  const failedResults = summary.results.filter((result) => result.status === "FAIL");
  summary.ok = summary.errors.length === 0 && failedResults.length === 0;

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
