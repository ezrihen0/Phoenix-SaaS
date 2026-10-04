import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import { assertHistoricalImportTargetOrganizationId } from "../crm/finance-historical-import-contract";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { PhoenixFieldHistoricalReportOrgLockEntity } from "../database/entities/phoenix-field-historical-report-org-lock.entity";
import { PHOENIX_OWNER_EMAIL } from "../database/phoenix-owner-identity";
import { PHOENIX_FIELD_REPORT_ORG_SLUG } from "./phoenix-field-report.constants";

@Injectable()
export class PhoenixFieldReportAccessService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(OrganizationEntity)
    private readonly organizationsRepository: Repository<OrganizationEntity>,
    @InjectRepository(PhoenixFieldHistoricalReportOrgLockEntity)
    private readonly orgLockRepository: Repository<PhoenixFieldHistoricalReportOrgLockEntity>,
  ) {}

  isFeatureEnabled() {
    const raw = this.configService.get<string>("MICHAEL_HISTORICAL_REPORT_ENABLED")?.trim().toLowerCase();
    return raw !== "false" && raw !== "0";
  }

  assertFeatureAvailable() {
    if (!this.isFeatureEnabled()) {
      apiError(404, "michael_report_disabled", "This report entry page is not available.");
    }
  }

  isOwnerEmail(email: string | null | undefined) {
    const normalized = email?.trim().toLowerCase();
    return Boolean(normalized && normalized === PHOENIX_OWNER_EMAIL.trim().toLowerCase());
  }

  assertActorIsOwner(actor: ActorContext) {
    if (!this.isOwnerEmail(actor.user.email)) {
      apiError(403, "michael_report_owner_only", "Only the Phoenix owner can perform this action.");
    }
  }

  async isOrgFeatureClosed(organizationId: string) {
    const lock = await this.orgLockRepository.findOne({
      where: { organization_id: organizationId },
    });

    return Boolean(lock);
  }

  async assertOrgFeatureOpen(organizationId: string) {
    if (await this.isOrgFeatureClosed(organizationId)) {
      apiError(
        404,
        "michael_report_closed",
        "This one-time historical work report tool has been closed. Imported CRM records and saved PDFs are unchanged.",
      );
    }
  }

  assertActorMayAccess(actor: ActorContext) {
    this.assertFeatureAvailable();

    if (!actor.user.email?.trim()) {
      apiError(403, "michael_report_forbidden", "Sign in to use the historical work report.");
    }

    const orgSlug = actor.organization?.slug?.trim().toLowerCase();
    if (orgSlug !== PHOENIX_FIELD_REPORT_ORG_SLUG) {
      apiError(403, "michael_report_org_forbidden", "Switch to the Phoenix organization to use this report.");
    }

    assertHistoricalImportTargetOrganizationId(actor.organization_id);
  }

  requirePhoenixOrganizationId(actor: ActorContext) {
    this.assertActorMayAccess(actor);
    return actor.organization_id as string;
  }

  async resolvePhoenixOrganizationId() {
    const org = await this.organizationsRepository.findOne({
      where: { slug: PHOENIX_FIELD_REPORT_ORG_SLUG },
    });

    if (!org) {
      throw new Error(`Organization slug ${PHOENIX_FIELD_REPORT_ORG_SLUG} was not found.`);
    }

    assertHistoricalImportTargetOrganizationId(org.id);
    return org.id;
  }
}
