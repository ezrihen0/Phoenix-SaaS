import { randomUUID } from "crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MarketingConnectedChannelEntity } from "../database/entities/marketing-connected-channel.entity";
import { MarketingContentDraftEntity } from "../database/entities/marketing-content-draft.entity";
import { MarketingContentVariantEntity } from "../database/entities/marketing-content-variant.entity";
import { MarketingPublishAttemptEntity } from "../database/entities/marketing-publish-attempt.entity";
import { MarketingPublishJobEntity } from "../database/entities/marketing-publish-job.entity";

import type { GoogleCredentialsPayload, MetaCredentialsPayload } from "./marketing-channels.service";
import {
  MARKETING_PUBLISH_OUTCOME_CHANNEL_DISCONNECTED,
  MARKETING_PUBLISH_OUTCOME_DEFERRED_V1_5,
  MARKETING_PUBLISH_OUTCOME_PROVIDER_ERROR,
  MARKETING_PUBLISH_OUTCOME_RATE_LIMITED,
  MARKETING_PUBLISH_OUTCOME_TIMEOUT,
  isMarketingPublishRetryableOutcome,
} from "./marketing.constants";
import { MarketingChannelsService } from "./marketing-channels.service";
import { MarketingProfileService } from "./marketing-profile.service";
import { MarketingSecretsCryptoService } from "./marketing-secrets-crypto.service";

const DEFAULT_VARIANT_BODY = {
  headline: "",
  primary_text: "",
  cta: "",
  hashtags: "",
  alt_text: "",
} as const;

function decodeVariantBody(json: string): Record<string, string> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = {};
  }

  const out: Record<string, string> = { ...DEFAULT_VARIANT_BODY };

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return out;
  }

  const obj = parsed as Record<string, unknown>;

  for (const key of Object.keys(DEFAULT_VARIANT_BODY) as Array<keyof typeof DEFAULT_VARIANT_BODY>) {
    const raw = obj[key];

    if (typeof raw === "string") {
      out[key] = raw;
    }
  }

  return out;
}

function buildCombinedCopy(body: Record<string, string>): string {
  const headline = body.headline?.trim();
  const primary = body.primary_text?.trim();
  const hashtags = body.hashtags?.trim();

  const chunks = [headline, primary, hashtags ? `\n${hashtags}` : ""].filter(Boolean);

  return chunks.join("\n\n").trim();
}

function sanitizeProviderEnvelope(payload: unknown): string {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return "{}";
  }
}

@Injectable()
export class MarketingPublishExecutorService {
  constructor(
    @InjectRepository(MarketingPublishAttemptEntity)
    private readonly attemptRepo: Repository<MarketingPublishAttemptEntity>,
    @InjectRepository(MarketingContentVariantEntity)
    private readonly variantRepo: Repository<MarketingContentVariantEntity>,
    @InjectRepository(MarketingContentDraftEntity)
    private readonly draftRepo: Repository<MarketingContentDraftEntity>,
    @InjectRepository(MarketingPublishJobEntity)
    private readonly jobRepo: Repository<MarketingPublishJobEntity>,
    @InjectRepository(MarketingConnectedChannelEntity)
    private readonly channelRepo: Repository<MarketingConnectedChannelEntity>,
    private readonly channelsService: MarketingChannelsService,
    private readonly profileService: MarketingProfileService,
    private readonly cryptoService: MarketingSecretsCryptoService,
    private readonly configService: ConfigService,
  ) {}

  async executePublishJob(jobId: string): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });

    if (!job || job.status !== "running") {
      return;
    }

    const draft = await this.draftRepo.findOne({ where: { id: job.draft_id, organization_id: job.organization_id } });

    if (!draft) {
      await this.finalizeJob(job, "failed");

      return;
    }

    const variants = await this.variantRepo.find({
      where: { draft_id: job.draft_id, organization_id: job.organization_id },
    });

    const variantMap = new Map(variants.map((row) => [row.platform_key, decodeVariantBody(row.body_json)]));

    await this.recordInstagramDeferred(job);

    const googleBody = variantMap.get(this.channelsService.googleChannelKey()) ?? decodeVariantBody("{}");
    const facebookBody = variantMap.get(this.channelsService.metaChannelKey()) ?? decodeVariantBody("{}");

    const googleLoaded = await this.channelsService.loadGoogleCredentials(job.organization_id);
    const metaLoaded = await this.channelsService.loadMetaCredentials(job.organization_id);

    let googleSuccess = false;
    let googleFailure = false;
    let facebookSuccess = false;
    let facebookFailure = false;

    if (!googleLoaded) {
      await this.recordSkipped(job, this.channelsService.googleChannelKey(), MARKETING_PUBLISH_OUTCOME_CHANNEL_DISCONNECTED);
    } else {
      const outcome = await this.publishGoogle(job, googleLoaded.credentials, googleBody, googleLoaded.row.id);

      if (outcome === "success") {
        googleSuccess = true;
      } else if (outcome === "failure") {
        googleFailure = true;
      }
    }

    if (!metaLoaded) {
      await this.recordSkipped(job, this.channelsService.metaChannelKey(), MARKETING_PUBLISH_OUTCOME_CHANNEL_DISCONNECTED);
    } else {
      const outcome = await this.publishFacebook(job, metaLoaded.credentials, facebookBody, metaLoaded.row.id);

      if (outcome === "success") {
        facebookSuccess = true;
      } else if (outcome === "failure") {
        facebookFailure = true;
      }
    }

    const anySuccess = googleSuccess || facebookSuccess;
    const anyFailure = googleFailure || facebookFailure;

    if (!anySuccess && !anyFailure) {
      await this.finalizeJob(job, "failed");

      return;
    }

    if (anySuccess && anyFailure) {
      await this.finalizeJob(job, "partial");

      return;
    }

    if (anyFailure) {
      await this.finalizeJob(job, "failed");

      return;
    }

    await this.finalizeJob(job, "succeeded");
  }

  async retryPublishAttempt(organizationId: string, attemptId: string): Promise<boolean> {
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId.trim(), organization_id: organizationId },
    });

    if (!attempt) {
      return false;
    }

    const job = await this.jobRepo.findOne({
      where: { id: attempt.publish_job_id, organization_id: organizationId },
    });

    if (!job) {
      return false;
    }

    if (attempt.status !== "failed" || !isMarketingPublishRetryableOutcome(attempt.outcome_code)) {
      return false;
    }

    if (job.status !== "failed" && job.status !== "partial") {
      return false;
    }

    const variants = await this.variantRepo.find({
      where: { draft_id: job.draft_id, organization_id: organizationId },
    });

    const variantMap = new Map(variants.map((row) => [row.platform_key, decodeVariantBody(row.body_json)]));
    const platform = attempt.platform_key;

    if (platform === "instagram") {
      return false;
    }

    const attemptNo = await this.nextAttemptNo(job.id, platform);

    if (platform === this.channelsService.googleChannelKey()) {
      const googleLoaded = await this.channelsService.loadGoogleCredentials(organizationId);

      if (!googleLoaded) {
        await this.recordSkippedManual(job, attemptNo, platform, MARKETING_PUBLISH_OUTCOME_CHANNEL_DISCONNECTED);
      } else {
        await this.publishGoogle(job, googleLoaded.credentials, variantMap.get(platform) ?? decodeVariantBody("{}"), googleLoaded.row.id, attemptNo);
      }
    } else if (platform === this.channelsService.metaChannelKey()) {
      const metaLoaded = await this.channelsService.loadMetaCredentials(organizationId);

      if (!metaLoaded) {
        await this.recordSkippedManual(job, attemptNo, platform, MARKETING_PUBLISH_OUTCOME_CHANNEL_DISCONNECTED);
      } else {
        await this.publishFacebook(job, metaLoaded.credentials, variantMap.get(platform) ?? decodeVariantBody("{}"), metaLoaded.row.id, attemptNo);
      }
    } else {
      return false;
    }

    await this.recomputeTerminalStatus(job.id);

    return true;
  }

  private async recordInstagramDeferred(job: MarketingPublishJobEntity): Promise<void> {
    await this.finishAttempt(
      await this.startAttempt(job, "instagram", 1),
      "skipped",
      MARKETING_PUBLISH_OUTCOME_DEFERRED_V1_5,
      null,
      null,
    );
  }

  private async recordSkipped(job: MarketingPublishJobEntity, platformKey: string, code: string): Promise<void> {
    await this.finishAttempt(
      await this.startAttempt(job, platformKey, await this.nextAttemptNo(job.id, platformKey)),
      "skipped",
      code,
      null,
      null,
    );
  }

  private async recordSkippedManual(job: MarketingPublishJobEntity, attemptNo: number, platformKey: string, code: string): Promise<void> {
    await this.finishAttempt(await this.startAttempt(job, platformKey, attemptNo), "skipped", code, null, null);
  }

  private async nextAttemptNo(jobId: string, platformKey: string): Promise<number> {
    const raw = await this.attemptRepo
      .createQueryBuilder("attempt")
      .select("MAX(attempt.attempt_no)", "max")
      .where("attempt.publish_job_id = :jobId", { jobId })
      .andWhere("attempt.platform_key = :platformKey", { platformKey })
      .getRawOne<{ max: string | number | null }>();

    const max =
      raw?.max === undefined || raw?.max === null ? 0 : typeof raw.max === "string" ? Number.parseInt(raw.max, 10) : Number(raw.max);

    return Number.isFinite(max) ? max + 1 : 1;
  }

  private async startAttempt(job: MarketingPublishJobEntity, platformKey: string, attemptNo: number): Promise<MarketingPublishAttemptEntity> {
    const entity = this.attemptRepo.create({
      id: randomUUID(),
      organization_id: job.organization_id,
      publish_job_id: job.id,
      platform_key: platformKey,
      attempt_no: attemptNo,
      status: "running",
      outcome_code: null,
      provider_http_status: null,
      provider_error_json: null,
      external_post_id: null,
      started_at: new Date(),
      finished_at: null,
    });

    return this.attemptRepo.save(entity);
  }

  private async finishAttempt(
    attempt: MarketingPublishAttemptEntity,
    status: string,
    outcomeCode: string | null,
    httpStatus: number | null,
    errorPayload: unknown,
    externalPostId?: string | null,
  ): Promise<void> {
    attempt.status = status;
    attempt.outcome_code = outcomeCode;
    attempt.provider_http_status = httpStatus;
    attempt.provider_error_json = errorPayload ? sanitizeProviderEnvelope(errorPayload) : null;
    attempt.external_post_id = externalPostId ?? null;
    attempt.finished_at = new Date();

    await this.attemptRepo.save(attempt);
  }

  private async finalizeJob(job: MarketingPublishJobEntity, status: MarketingPublishJobEntity["status"]): Promise<void> {
    job.status = status;
    job.lease_owner = null;
    job.leased_until = null;

    await this.jobRepo.save(job);
  }

  private async publishGoogle(
    job: MarketingPublishJobEntity,
    credentials: GoogleCredentialsPayload,
    body: Record<string, string>,
    channelRowId: string,
    explicitAttemptNo?: number,
  ): Promise<"success" | "failure" | "skipped"> {
    const row = await this.channelRepo.findOne({
      where: { id: channelRowId },
    });

    if (!row?.google_location_resource) {
      await this.finishAttempt(
        await this.startAttempt(
          job,
          this.channelsService.googleChannelKey(),
          explicitAttemptNo ?? (await this.nextAttemptNo(job.id, this.channelsService.googleChannelKey())),
        ),
        "skipped",
        MARKETING_PUBLISH_OUTCOME_CHANNEL_DISCONNECTED,
        null,
        null,
      );

      return "skipped";
    }

    let accessToken = credentials.access_token;

    const refreshed = await this.maybeRefreshGoogleAccessToken(job.organization_id, credentials);

    if (refreshed) {
      accessToken = refreshed;
    }

    const profile = await this.profileService.getProfileReadOnly(job.organization_id);
    const ctaUrl =
      typeof profile.publishing_preferences?.default_cta_primary === "string" &&
      profile.publishing_preferences.default_cta_primary.trim()
        ? profile.publishing_preferences.default_cta_primary.trim()
        : "https://wizfield.com";

    const summary = buildCombinedCopy(body).slice(0, 1499);

    const attemptEntity = await this.startAttempt(
      job,
      this.channelsService.googleChannelKey(),
      explicitAttemptNo ?? (await this.nextAttemptNo(job.id, this.channelsService.googleChannelKey())),
    );

    const parent = row.google_location_resource;
    const url = `https://mybusiness.googleapis.com/v4/${encodeURIComponent(parent)}/localPosts`;

    const payload = {
      languageCode: "en",
      summary,
      topicType: "STANDARD",
      callToAction: {
        actionType: "LEARN_MORE",
        url: ctaUrl,
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseJson = await response.json().catch(() => null);

      if (!response.ok) {
        const outcome = response.status === 429 ? MARKETING_PUBLISH_OUTCOME_RATE_LIMITED : MARKETING_PUBLISH_OUTCOME_PROVIDER_ERROR;

        await this.finishAttempt(
          attemptEntity,
          "failed",
          outcome,
          response.status,
          responseJson ?? { status: response.status },
        );

        row.last_failure_at = new Date();
        await this.channelRepo.save(row);

        return "failure";
      }

      const externalId =
        responseJson && typeof responseJson === "object" && "name" in responseJson && typeof responseJson.name === "string"
          ? responseJson.name
          : null;

      await this.finishAttempt(attemptEntity, "succeeded", null, response.status, null, externalId);

      row.last_published_at = new Date();
      row.authorization_health = "healthy";
      await this.channelRepo.save(row);

      return "success";
    } catch {
      await this.finishAttempt(attemptEntity, "failed", MARKETING_PUBLISH_OUTCOME_TIMEOUT, null, { reason: "network_error" });

      row.last_failure_at = new Date();
      await this.channelRepo.save(row);

      return "failure";
    }
  }

  private async publishFacebook(
    job: MarketingPublishJobEntity,
    credentials: MetaCredentialsPayload,
    body: Record<string, string>,
    channelRowId: string,
    explicitAttemptNo?: number,
  ): Promise<"success" | "failure" | "skipped"> {
    const row = await this.channelRepo.findOne({
      where: { id: channelRowId },
    });

    if (!row?.facebook_page_id) {
      await this.finishAttempt(
        await this.startAttempt(
          job,
          this.channelsService.metaChannelKey(),
          explicitAttemptNo ?? (await this.nextAttemptNo(job.id, this.channelsService.metaChannelKey())),
        ),
        "skipped",
        MARKETING_PUBLISH_OUTCOME_CHANNEL_DISCONNECTED,
        null,
        null,
      );

      return "skipped";
    }

    const message = buildCombinedCopy(body).slice(0, 8000);

    const attemptEntity = await this.startAttempt(
      job,
      this.channelsService.metaChannelKey(),
      explicitAttemptNo ?? (await this.nextAttemptNo(job.id, this.channelsService.metaChannelKey())),
    );

    const feedUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(row.facebook_page_id)}/feed`;
    const params = new URLSearchParams();
    params.set("message", message);
    params.set("access_token", credentials.page_access_token);

    try {
      const response = await fetch(feedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const responseJson = await response.json().catch(() => null);

      if (!response.ok) {
        const graphError =
          responseJson && typeof responseJson === "object" && "error" in responseJson
            ? (responseJson as { error?: { code?: number; message?: string } }).error
            : undefined;

        const retryable =
          response.status >= 500 ||
          response.status === 429 ||
          graphError?.code === 4 ||
          graphError?.code === 17;

        const outcome = retryable ? MARKETING_PUBLISH_OUTCOME_RATE_LIMITED : MARKETING_PUBLISH_OUTCOME_PROVIDER_ERROR;

        await this.finishAttempt(
          attemptEntity,
          "failed",
          outcome,
          response.status,
          responseJson ?? { status: response.status },
        );

        row.last_failure_at = new Date();
        await this.channelRepo.save(row);

        return "failure";
      }

      const postId =
        responseJson && typeof responseJson === "object" && "id" in responseJson && typeof responseJson.id === "string"
          ? responseJson.id
          : null;

      await this.finishAttempt(attemptEntity, "succeeded", null, response.status, null, postId);

      row.last_published_at = new Date();
      row.authorization_health = "healthy";
      await this.channelRepo.save(row);

      return "success";
    } catch {
      await this.finishAttempt(attemptEntity, "failed", MARKETING_PUBLISH_OUTCOME_TIMEOUT, null, { reason: "network_error" });

      row.last_failure_at = new Date();
      await this.channelRepo.save(row);

      return "failure";
    }
  }

  private async maybeRefreshGoogleAccessToken(
    organizationId: string,
    credentials: GoogleCredentialsPayload,
  ): Promise<string | undefined> {
    if (!credentials.refresh_token) {
      return undefined;
    }

    const clientId = this.configService.get<string>("MARKETING_GOOGLE_CLIENT_ID")?.trim();
    const clientSecret = this.configService.get<string>("MARKETING_GOOGLE_CLIENT_SECRET")?.trim();

    if (!clientId || !clientSecret) {
      return undefined;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };

    if (!response.ok || !payload.access_token) {
      return undefined;
    }

    const nextCredentials: GoogleCredentialsPayload = {
      kind: "google_credentials_v1",
      access_token: payload.access_token,
      refresh_token: credentials.refresh_token,
      expires_at:
        typeof payload.expires_in === "number"
          ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
          : credentials.expires_at,
    };

    const googleRow = await this.channelsService.ensureChannelRow(organizationId, this.channelsService.googleChannelKey());

    googleRow.encrypted_credentials = this.cryptoService.encryptJson(nextCredentials);
    await this.channelRepo.save(googleRow);

    return payload.access_token;
  }

  private async recomputeTerminalStatus(jobId: string): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });

    if (!job) {
      return;
    }

    const attempts = await this.attemptRepo.find({
      where: { publish_job_id: jobId },
      order: { started_at: "ASC" },
    });

    let anySuccess = false;
    let anyFailure = false;

    for (const attempt of attempts) {
      if (attempt.platform_key === "instagram") {
        continue;
      }

      if (attempt.status === "succeeded") {
        anySuccess = true;
      }

      if (attempt.status === "failed") {
        anyFailure = true;
      }
    }

    if (!anySuccess && !anyFailure) {
      job.status = "failed";
    } else if (anySuccess && anyFailure) {
      job.status = "partial";
    } else if (anyFailure) {
      job.status = "failed";
    } else {
      job.status = "succeeded";
    }

    job.lease_owner = null;
    job.leased_until = null;

    await this.jobRepo.save(job);
  }
}
