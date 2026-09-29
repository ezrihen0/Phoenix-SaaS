import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { apiError, apiSuccess } from "../../common/api-response";
import { PhoenixIntegrationGuard } from "./phoenix-integration.guard";
import {
  PhoenixCustomerImportService,
  type PhoenixCustomerImportRecordInput,
} from "./phoenix-customer-import.service";

type ImportBody = {
  organizationId?: unknown;
  importBatch?: unknown;
  dryRun?: unknown;
  records?: unknown;
};

const APPROVED_PILOT_SOURCE_IDS = new Set([
  "1640",
  "1638",
  "1637",
  "1636",
  "1629",
  "1568",
  "1559",
  "1556",
  "1639",
  "1617",
]);

function parseOrganizationId(value: unknown) {
  const organizationId = typeof value === "string" ? value.trim() : "";
  if (!organizationId) {
    apiError(400, "invalid_phoenix_customer_import_payload", "organizationId is required.");
  }
  return organizationId;
}

function parseImportBatch(value: unknown) {
  const importBatch = typeof value === "string" ? value.trim() : "";
  if (!importBatch) {
    apiError(400, "invalid_phoenix_customer_import_payload", "importBatch is required.");
  }
  return importBatch;
}

function parseImportRecords(value: unknown): PhoenixCustomerImportRecordInput[] {
  if (!Array.isArray(value)) {
    apiError(400, "invalid_phoenix_customer_import_payload", "records must be an array.");
  }

  return value.map((row, index) => {
    if (typeof row !== "object" || row === null) {
      apiError(400, "invalid_phoenix_customer_import_payload", `records[${index}] must be an object.`);
    }

    const record = row as Record<string, unknown>;
    const sourceCustomerId = typeof record.sourceCustomerId === "string" ? record.sourceCustomerId.trim() : "";
    const sourceReference = typeof record.sourceReference === "string" ? record.sourceReference.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const email = typeof record.email === "string" ? record.email.trim() : "";
    const phone = typeof record.phone === "string" ? record.phone.trim() : "";
    const address = typeof record.address === "string" ? record.address.trim() : "";
    const postalCode = typeof record.postalCode === "string" ? record.postalCode.trim() : null;

    if (!sourceCustomerId || !sourceReference || !name || !email || !phone || !address) {
      apiError(
        400,
        "invalid_phoenix_customer_import_payload",
        `records[${index}] is missing required customer fields.`,
      );
    }

    return {
      sourceReference,
      sourceCustomerId,
      name,
      email,
      phone,
      address,
      postalCode,
    };
  });
}

@Controller("api/integrations/phoenix/customers")
@UseGuards(PhoenixIntegrationGuard)
export class PhoenixCustomerIntegrationController {
  constructor(private readonly phoenixCustomerImportService: PhoenixCustomerImportService) {}

  @Get("export")
  async exportCustomers(@Query("organizationId") organizationIdRaw?: string) {
    const organizationId = parseOrganizationId(organizationIdRaw);
    const customers = await this.phoenixCustomerImportService.exportOrganizationCustomers(organizationId);
    return apiSuccess({ organizationId, customers });
  }

  @Post("import")
  async importCustomers(@Body() body: ImportBody) {
    const organizationId = parseOrganizationId(body.organizationId);
    const importBatch = parseImportBatch(body.importBatch);
    const dryRun = body.dryRun === true;
    const records = parseImportRecords(body.records);

    const unexpectedIds = records
      .map((record) => record.sourceCustomerId)
      .filter((id) => !APPROVED_PILOT_SOURCE_IDS.has(id));

    if (unexpectedIds.length > 0) {
      apiError(
        400,
        "phoenix_customer_import_out_of_scope",
        "This endpoint only accepts the approved 10-customer pilot source IDs.",
        { unexpectedIds },
      );
    }

    if (records.length !== 10) {
      apiError(
        400,
        "phoenix_customer_import_out_of_scope",
        "Pilot import must include exactly 10 approved records.",
      );
    }

    const result = await this.phoenixCustomerImportService.importBatch({
      organizationId,
      importBatch,
      dryRun,
      records,
    });

    return apiSuccess(result);
  }
}
