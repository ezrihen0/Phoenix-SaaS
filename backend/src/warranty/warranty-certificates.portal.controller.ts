import { Controller, Get, Param, Query, Req, Res, StreamableFile, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import type { RequestWithPortalSession } from "../common/request-types";
import { PortalSessionGuard } from "../customer-portal/portal-session.guard";
import { setPdfDownloadResponseHeaders } from "../documents/pdf/pdf-download-response";
import { WarrantyCertificatesService } from "./warranty-certificates.service";

@Controller("api/portal/warranty-certificates")
@UseGuards(PortalSessionGuard)
export class WarrantyCertificatesPortalController {
  constructor(private readonly warrantyCertificatesService: WarrantyCertificatesService) {}

  @Get(":certificateId")
  async getMetadata(@Req() request: RequestWithPortalSession, @Param("certificateId") certificateId: string) {
    const customerId = request.portalSession!.customer_id;
    const organizationId = request.portalSession!.session.organization_id?.trim() ?? "";
    if (!organizationId) {
      throw new UnauthorizedException({
        error: {
          code: "portal_organization_missing",
          message: "This portal session is missing organization context.",
        },
      });
    }
    const certificate = await this.warrantyCertificatesService.getByIdForPortal(certificateId, organizationId, customerId);
    return {
      data: this.warrantyCertificatesService.buildResponse(certificate),
      error: null,
    };
  }

  @Get(":certificateId/pdf")
  async getPdf(
    @Req() request: RequestWithPortalSession,
    @Param("certificateId") certificateId: string,
    @Query("download") download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const customerId = request.portalSession!.customer_id;
    const organizationId = request.portalSession!.session.organization_id?.trim() ?? "";
    if (!organizationId) {
      throw new UnauthorizedException({
        error: {
          code: "portal_organization_missing",
          message: "This portal session is missing organization context.",
        },
      });
    }
    const certificate = await this.warrantyCertificatesService.getByIdForPortal(certificateId, organizationId, customerId);
    const pdfBuffer = await this.warrantyCertificatesService.readPdfBuffer(certificate);
    const certificateNumber = `WAR-${certificate.id.slice(0, 8).toUpperCase()}`;
    setPdfDownloadResponseHeaders(response, {
      download,
      filename: `warranty-${certificateNumber}.pdf`,
    });
    return new StreamableFile(pdfBuffer);
  }
}
