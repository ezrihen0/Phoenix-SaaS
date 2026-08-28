import { Body, Controller, Get, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { requirePermission } from "../auth/permissions";
import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { setPdfDownloadResponseHeaders } from "../documents/pdf/pdf-download-response";
import { WarrantyCertificatesService } from "./warranty-certificates.service";

type GenerateWarrantyPayload = {
  invoiceId?: unknown;
  warrantyType?: unknown;
  coverageText?: unknown;
  exclusionsText?: unknown;
};

function readOptionalString(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    apiError(400, "warranty_payload_invalid", `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLength) {
    apiError(400, "warranty_payload_invalid", `${fieldName} is too long.`);
  }
  return trimmed;
}

@Controller("api/warranty-certificates")
@UseGuards(SessionGuard, OperationalAccessGuard)
export class WarrantyCertificatesController {
  constructor(private readonly warrantyCertificatesService: WarrantyCertificatesService) {}

  @Post()
  async generate(@Req() request: RequestWithActor, @Body() body: GenerateWarrantyPayload | null | undefined) {
    const actor = requirePermission(
      request.actor,
      "invoices.manage",
      "warranty_generate_forbidden",
      "This account cannot generate warranty certificates.",
    );
    const organizationId = actor.organization_id?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }

    const invoiceId = readOptionalString(body?.invoiceId, "invoiceId", 64);
    if (!invoiceId) {
      apiError(400, "warranty_payload_invalid", "invoiceId is required.");
    }

    const certificate = await this.warrantyCertificatesService.generateFromInvoice({
      organizationId,
      invoiceId,
      issuedByUserId: actor.user.id,
      warrantyType: readOptionalString(body?.warrantyType, "warrantyType", 64),
      coverageText: readOptionalString(body?.coverageText, "coverageText", 5000),
      exclusionsText: readOptionalString(body?.exclusionsText, "exclusionsText", 5000),
    });

    return apiSuccess(this.warrantyCertificatesService.buildResponse(certificate));
  }

  @Get("by-invoice/:invoiceId")
  async getByInvoice(@Req() request: RequestWithActor, @Param("invoiceId") invoiceId: string) {
    const actor = requirePermission(
      request.actor,
      "invoices.view",
      "warranty_view_forbidden",
      "This account cannot view warranty certificates.",
    );
    const organizationId = actor.organization_id?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }
    const certificate = await this.warrantyCertificatesService.getByInvoiceForOrganization(invoiceId, organizationId);
    return apiSuccess(certificate ? this.warrantyCertificatesService.buildResponse(certificate) : null);
  }

  @Get(":certificateId")
  async getById(@Req() request: RequestWithActor, @Param("certificateId") certificateId: string) {
    const actor = requirePermission(
      request.actor,
      "invoices.view",
      "warranty_view_forbidden",
      "This account cannot view warranty certificates.",
    );
    const organizationId = actor.organization_id?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }
    const certificate = await this.warrantyCertificatesService.getByIdForOrganization(certificateId, organizationId);
    return apiSuccess(this.warrantyCertificatesService.buildResponse(certificate));
  }

  @Get(":certificateId/pdf")
  async getPdf(
    @Req() request: RequestWithActor,
    @Param("certificateId") certificateId: string,
    @Query("download") download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = requirePermission(
      request.actor,
      "invoices.view",
      "warranty_view_forbidden",
      "This account cannot view warranty certificates.",
    );
    const organizationId = actor.organization_id?.trim();
    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required.");
    }
    const certificate = await this.warrantyCertificatesService.getByIdForOrganization(certificateId, organizationId);
    const pdfBuffer = await this.warrantyCertificatesService.readPdfBuffer(certificate);
    const certificateNumber = `WAR-${certificate.id.slice(0, 8).toUpperCase()}`;
    setPdfDownloadResponseHeaders(response, {
      download,
      filename: `warranty-${certificateNumber}.pdf`,
    });
    return new StreamableFile(pdfBuffer);
  }
}
