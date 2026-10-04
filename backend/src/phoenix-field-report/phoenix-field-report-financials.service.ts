import { Injectable } from "@nestjs/common";

import { BranchScopeService } from "../crm/branch-scope.service";
import { normalizeServiceProvinceToBranchCode } from "../crm/branch-province-resolution";
import { computeTaxInclusiveDocumentTotals } from "../crm/money-engine.core";
import type { MichaelReportJobPayload } from "./phoenix-field-report.types";
import { buildEntryFinancials, type MichaelReportEntryFinancials } from "./phoenix-field-report-financials";

@Injectable()
export class PhoenixFieldReportFinancialsService {
  constructor(private readonly branchScopeService: BranchScopeService) {}

  async computeForPayload(
    organizationId: string,
    payload: MichaelReportJobPayload,
  ): Promise<{
    financials: MichaelReportEntryFinancials | null;
    taxError: string | null;
    taxRateBps: number | null;
  }> {
    try {
      const branchId = await this.branchScopeService.resolveBranchIdFromServiceProvince(
        organizationId,
        payload.serviceStateOrRegion,
      );
      const branchEntity = branchId
        ? await this.branchScopeService.findBranchForOrganization(organizationId, branchId)
        : null;

      if (!branchEntity) {
        return {
          financials: null,
          taxError: "Could not resolve branch tax rate for this service address.",
          taxRateBps: null,
        };
      }

      const taxRateBps = this.branchScopeService.resolveDefaultTaxRateBps(branchEntity);
      const province = normalizeServiceProvinceToBranchCode(payload.serviceStateOrRegion);
      if (!province) {
        return {
          financials: null,
          taxError: "Service province must be Alberta or Ontario to determine tax.",
          taxRateBps: null,
        };
      }

      const totals = computeTaxInclusiveDocumentTotals(payload.totalChargedCents, taxRateBps);
      return {
        financials: buildEntryFinancials(payload, totals.subtotalCents, totals.taxCents),
        taxError: null,
        taxRateBps,
      };
    } catch (error) {
      return {
        financials: null,
        taxError: error instanceof Error ? error.message : "Tax could not be calculated.",
        taxRateBps: null,
      };
    }
  }
}
