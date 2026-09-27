import { Controller, Get, Param, Req, UnauthorizedException, UseGuards } from "@nestjs/common";

import { apiSuccess } from "../common/api-response";
import type { RequestWithPortalSession } from "../common/request-types";
import { PortalNativeInvoicePdfService } from "../crm/portal-native-invoice-pdf.service";
import { CustomerPortalService } from "./customer-portal.service";
import { PortalIntegratedSessionGuard } from "./portal-integrated-session.guard";

@Controller("api/portal")
@UseGuards(PortalIntegratedSessionGuard)
export class CustomerPortalReadController {
  constructor(
    private readonly customerPortalService: CustomerPortalService,
    private readonly portalNativeInvoicePdfService: PortalNativeInvoicePdfService,
  ) {}

  @Get("home")
  async home(@Req() request: RequestWithPortalSession) {
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

    const payload = await this.customerPortalService.getPortalHome(organizationId, customerId);
    return apiSuccess(payload);
  }

  @Get("invoices/:invoiceId/document-view")
  async invoiceDocumentView(
    @Req() request: RequestWithPortalSession,
    @Param("invoiceId") invoiceId: string,
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

    const documentView = await this.portalNativeInvoicePdfService.getDocumentViewForPortal({
      organizationId,
      customerId,
      invoiceId,
    });

    return apiSuccess({
      invoice_id: invoiceId,
      document_view: documentView,
      pdf_url: `/api/portal/invoices/${invoiceId}/pdf`,
    });
  }
}
