import { Controller, Get, Param, Query, Req, Res, StreamableFile, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import type { RequestWithPortalSession } from "../../common/request-types";
import { PortalIntegratedSessionGuard } from "../../customer-portal/portal-integrated-session.guard";
import { setPdfDownloadResponseHeaders } from "../pdf/pdf-download-response";
import { PortalNativeInvoicePdfService } from "../../crm/portal-native-invoice-pdf.service";
import { InvoiceDocumentsService } from "./invoice-documents.service";

@Controller("api/portal/invoices")
@UseGuards(PortalIntegratedSessionGuard)
export class InvoiceDocumentsPortalController {
  constructor(
    private readonly invoiceDocumentsService: InvoiceDocumentsService,
    private readonly portalNativeInvoicePdfService: PortalNativeInvoicePdfService,
  ) {}

  @Get(":invoiceId/pdf")
  async getSourcePdf(
    @Req() request: RequestWithPortalSession,
    @Param("invoiceId") invoiceId: string,
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

    const { invoice, document } = await this.invoiceDocumentsService.getInvoiceForPortal(
      invoiceId,
      organizationId,
      customerId,
    );

    if (!document) {
      const rendered = await this.portalNativeInvoicePdfService.renderForPortal({
        organizationId,
        customerId,
        invoiceId: invoice.id,
      });
      setPdfDownloadResponseHeaders(response, { download, filename: rendered.filename });
      return new StreamableFile(rendered.buffer);
    }

    const pdfBuffer = await this.invoiceDocumentsService.readPdfBuffer(document);
    const filename = document.original_filename || `invoice-${invoice.id.slice(0, 8)}.pdf`;
    setPdfDownloadResponseHeaders(response, { download, filename });
    return new StreamableFile(pdfBuffer);
  }
}
