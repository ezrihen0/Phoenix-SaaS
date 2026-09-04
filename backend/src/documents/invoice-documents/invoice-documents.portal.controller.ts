import { Controller, Get, Param, Query, Req, Res, StreamableFile, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import type { RequestWithPortalSession } from "../../common/request-types";
import { PortalSessionGuard } from "../../customer-portal/portal-session.guard";
import { setPdfDownloadResponseHeaders } from "../pdf/pdf-download-response";
import { InvoiceDocumentsService } from "./invoice-documents.service";

@Controller("api/portal/invoices")
@UseGuards(PortalSessionGuard)
export class InvoiceDocumentsPortalController {
  constructor(private readonly invoiceDocumentsService: InvoiceDocumentsService) {}

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
      throw new UnauthorizedException({
        error: {
          code: "invoice_pdf_not_available",
          message: "No original invoice PDF is available for this invoice.",
        },
      });
    }

    const pdfBuffer = await this.invoiceDocumentsService.readPdfBuffer(document);
    const filename = document.original_filename || `invoice-${invoice.id.slice(0, 8)}.pdf`;
    setPdfDownloadResponseHeaders(response, { download, filename });
    return new StreamableFile(pdfBuffer);
  }
}
