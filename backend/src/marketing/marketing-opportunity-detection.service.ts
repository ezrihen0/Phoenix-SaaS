import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, MoreThanOrEqual, Repository } from "typeorm";

import { getServiceTypeLabel } from "../crm/constants";
import { InspectionEntity } from "../database/entities/inspection.entity";
import { JobEntity } from "../database/entities/job.entity";
import {
  MARKETING_INTELLIGENCE_MIN_JOBS_LOCAL_AUTHORITY,
  MARKETING_INTELLIGENCE_MIN_JOBS_SERVICE_MOMENTUM,
  MARKETING_INTELLIGENCE_MIN_JOBS_WORK_SHOWCASE,
  MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS,
  MARKETING_OPPORTUNITY_SOURCE_CRM,
} from "./marketing-intelligence.constants";

export type MarketingOpportunityCandidate = {
  opportunity_type: string;
  dedupe_key: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  source: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  occurred_at: Date | null;
};

export function isoWeekBucketKey(reference: Date): string {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function normalizeMarketingCity(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const t = raw.trim().replace(/\s+/g, " ");
  return t.length ? t.toLowerCase() : null;
}

@Injectable()
export class MarketingOpportunityDetectionService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(InspectionEntity)
    private readonly inspectionsRepository: Repository<InspectionEntity>,
  ) {}

  async detectForOrganization(organizationId: string): Promise<MarketingOpportunityCandidate[]> {
    const windowStart = new Date();
    windowStart.setUTCDate(windowStart.getUTCDate() - MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS);
    const weekKey = isoWeekBucketKey(new Date());

    const out: MarketingOpportunityCandidate[] = [];

    const workShowcase = await this.detectWorkShowcase(organizationId, windowStart, weekKey);
    if (workShowcase) {
      out.push(workShowcase);
    }

    out.push(...(await this.detectServiceMomentum(organizationId, windowStart, weekKey)));
    out.push(...(await this.detectLocalAuthorityGeo(organizationId, windowStart, weekKey)));

    const beforeAfter = await this.detectBeforeAfter(organizationId, weekKey);
    out.push(...beforeAfter);

    return out;
  }

  private async detectWorkShowcase(
    organizationId: string,
    windowStart: Date,
    weekKey: string,
  ): Promise<MarketingOpportunityCandidate | null> {
    const count = await this.jobsRepository.count({
      where: {
        organization_id: organizationId,
        status: In(["completed", "paid"]),
        completed_at: MoreThanOrEqual(windowStart),
      },
    });

    if (count < MARKETING_INTELLIGENCE_MIN_JOBS_WORK_SHOWCASE) {
      return null;
    }

    const dedupe_key = `work_showcase_recent:iso_week:${weekKey}`;
    const payload = {
      window_days: MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS,
      completed_job_count: count,
    };

    return {
      opportunity_type: "work_showcase_recent",
      dedupe_key,
      title: "Recent completed work",
      summary: `You finished ${count} job${count === 1 ? "" : "s"} in the last ${MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS} days — a good moment for a credibility post.`,
      payload,
      source: MARKETING_OPPORTUNITY_SOURCE_CRM,
      source_entity_type: "organization_window",
      source_entity_id: weekKey,
      occurred_at: new Date(),
    };
  }

  private async detectServiceMomentum(
    organizationId: string,
    windowStart: Date,
    weekKey: string,
  ): Promise<MarketingOpportunityCandidate[]> {
    const rows = await this.jobsRepository
      .createQueryBuilder("job")
      .select("job.requested_service_type", "stype")
      .addSelect("COUNT(*)", "cnt")
      .where("job.organization_id = :organizationId", { organizationId })
      .andWhere("job.status IN (:...statuses)", { statuses: ["completed", "paid"] })
      .andWhere("job.completed_at >= :windowStart", { windowStart })
      .groupBy("job.requested_service_type")
      .having("COUNT(*) >= :minJobs", { minJobs: MARKETING_INTELLIGENCE_MIN_JOBS_SERVICE_MOMENTUM })
      .getRawMany<{ stype: string; cnt: string }>();

    const results: MarketingOpportunityCandidate[] = [];
    for (const row of rows) {
      const cnt = Number.parseInt(row.cnt, 10) || 0;
      const label = getServiceTypeLabel(row.stype as "inspection" | "cleaning" | "repair" | "rebuild");
      const dedupe_key = `service_momentum:${row.stype}:iso_week:${weekKey}`;
      results.push({
        opportunity_type: "service_momentum",
        dedupe_key,
        title: `${label} momentum`,
        summary: `${cnt} completed ${label.toLowerCase()} jobs in the last ${MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS} days — consider an expertise-focused post.`,
        payload: {
          window_days: MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS,
          requested_service_type: row.stype,
          service_type_label: label,
          completed_job_count: cnt,
        },
        source: MARKETING_OPPORTUNITY_SOURCE_CRM,
        source_entity_type: "service_type_bucket",
        source_entity_id: row.stype,
        occurred_at: new Date(),
      });
    }

    return results;
  }

  private async detectLocalAuthorityGeo(
    organizationId: string,
    windowStart: Date,
    weekKey: string,
  ): Promise<MarketingOpportunityCandidate[]> {
    const rows = await this.jobsRepository
      .createQueryBuilder("job")
      .select("job.service_city", "cityRaw")
      .addSelect("COUNT(*)", "cnt")
      .where("job.organization_id = :organizationId", { organizationId })
      .andWhere("job.status IN (:...statuses)", { statuses: ["completed", "paid"] })
      .andWhere("job.completed_at >= :windowStart", { windowStart })
      .andWhere("job.service_city IS NOT NULL")
      .andWhere("TRIM(job.service_city) <> ''")
      .groupBy("job.service_city")
      .having("COUNT(*) >= :minJobs", { minJobs: MARKETING_INTELLIGENCE_MIN_JOBS_LOCAL_AUTHORITY })
      .getRawMany<{ cityRaw: string; cnt: string }>();

    const results: MarketingOpportunityCandidate[] = [];
    for (const row of rows) {
      const normalized = normalizeMarketingCity(row.cityRaw);
      if (!normalized) {
        continue;
      }

      const cnt = Number.parseInt(row.cnt, 10) || 0;
      const dedupe_key = `local_authority_geo:${normalized}:iso_week:${weekKey}`;
      const displayCity = row.cityRaw.trim();
      results.push({
        opportunity_type: "local_authority_geo",
        dedupe_key,
        title: `Local cluster: ${displayCity}`,
        summary: `${cnt} completed jobs in ${displayCity} over the last ${MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS} days — consider a local-trust post without naming customers.`,
        payload: {
          window_days: MARKETING_INTELLIGENCE_ROLLING_WINDOW_DAYS,
          service_city_normalized: normalized,
          service_city_display: displayCity,
          completed_job_count: cnt,
        },
        source: MARKETING_OPPORTUNITY_SOURCE_CRM,
        source_entity_type: "city_bucket",
        source_entity_id: normalized,
        occurred_at: new Date(),
      });
    }

    return results;
  }

  private async detectBeforeAfter(organizationId: string, weekKey: string): Promise<MarketingOpportunityCandidate[]> {
    const qb = this.inspectionsRepository
      .createQueryBuilder("insp")
      .select("insp.id", "inspection_id")
      .innerJoin(JobEntity, "job", "job.id = insp.job_id AND job.organization_id = :organizationId", { organizationId })
      .andWhere("job.status IN (:...statuses)", { statuses: ["completed", "paid"] })
      .andWhere(
        `EXISTS (
          SELECT 1 FROM inspection_photos pb
          WHERE pb.inspection_id = insp.id AND pb.photo_type = 'before'
        )`,
      )
      .andWhere(
        `EXISTS (
          SELECT 1 FROM inspection_photos pa
          WHERE pa.inspection_id = insp.id AND pa.photo_type = 'after'
        )`,
      );

    const rows = await qb.getRawMany<{ inspection_id: string }>();

    const results: MarketingOpportunityCandidate[] = [];
    for (const row of rows) {
      const dedupe_key = `before_after_signal:inspection:${row.inspection_id}:iso_week:${weekKey}`;
      results.push({
        opportunity_type: "before_after_signal",
        dedupe_key,
        title: "Before / after documentation",
        summary:
          "An inspection tied to completed work includes before-and-after photos. Consider a visual story outline (media is not attached automatically).",
        payload: {
          has_before_after_photo_types: true,
          inspection_id: row.inspection_id,
        },
        source: MARKETING_OPPORTUNITY_SOURCE_CRM,
        source_entity_type: "inspection",
        source_entity_id: row.inspection_id,
        occurred_at: new Date(),
      });
    }

    return results;
  }
}
