import { randomUUID } from "crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { MarketingConnectedChannelEntity } from "../database/entities/marketing-connected-channel.entity";
import { MarketingOAuthStateEntity } from "../database/entities/marketing-oauth-state.entity";

import { MarketingSecretsCryptoService } from "./marketing-secrets-crypto.service";

const GOOGLE_CHANNEL_KEY = "google_business";
const META_CHANNEL_KEY = "facebook";
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export type GooglePendingPayload = {
  kind: "google_pending_v1";
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  locations: Array<{ resourceName: string; title: string; accountResource: string }>;
};

export type MetaPendingPayload = {
  kind: "meta_pending_v1";
  pages: Array<{ id: string; name: string; access_token: string }>;
};

export type GoogleCredentialsPayload = {
  kind: "google_credentials_v1";
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
};

export type MetaCredentialsPayload = {
  kind: "meta_credentials_v1";
  page_access_token: string;
};

@Injectable()
export class MarketingChannelsService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(MarketingConnectedChannelEntity)
    private readonly channelRepo: Repository<MarketingConnectedChannelEntity>,
    @InjectRepository(MarketingOAuthStateEntity)
    private readonly oauthStateRepo: Repository<MarketingOAuthStateEntity>,
    private readonly cryptoService: MarketingSecretsCryptoService,
  ) {}

  async ensureChannelRow(organizationId: string, channelKey: string): Promise<MarketingConnectedChannelEntity> {
    let row = await this.channelRepo.findOne({
      where: { organization_id: organizationId, channel_key: channelKey },
    });

    if (row) {
      return row;
    }

    row = this.channelRepo.create({
      organization_id: organizationId,
      channel_key: channelKey,
      channel_label: channelKey === GOOGLE_CHANNEL_KEY ? "Google Business Profile" : "Facebook",
      connection_status: "disconnected",
    });

    return this.channelRepo.save(row);
  }

  async createOAuthState(organizationId: string, provider: "google" | "meta"): Promise<{ state_token: string; expires_at: Date }> {
    const state_token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const expires_at = new Date(Date.now() + OAUTH_STATE_TTL_MS);

    const entity = this.oauthStateRepo.create({
      id: randomUUID(),
      organization_id: organizationId,
      provider,
      state_token,
      expires_at,
    });

    await this.oauthStateRepo.save(entity);

    return { state_token, expires_at };
  }

  async consumeOAuthState(stateToken: string): Promise<MarketingOAuthStateEntity> {
    const row = await this.oauthStateRepo.findOne({ where: { state_token: stateToken } });

    if (!row) {
      apiError(400, "marketing_oauth_state_invalid", "OAuth state was not recognized.");
    }

    if (row.consumed_at) {
      apiError(400, "marketing_oauth_state_used", "OAuth state was already used.");
    }

    if (row.expires_at.valueOf() < Date.now()) {
      apiError(400, "marketing_oauth_state_expired", "OAuth state expired. Start the connection again.");
    }

    row.consumed_at = new Date();
    await this.oauthStateRepo.save(row);

    return row;
  }

  googleClientId(): string {
    const v = this.configService.get<string>("MARKETING_GOOGLE_CLIENT_ID")?.trim();
    if (!v) {
      apiError(503, "marketing_google_oauth_unconfigured", "Google OAuth is not configured for this environment.");
    }

    return v;
  }

  googleRedirectUri(): string {
    const v = this.configService.get<string>("MARKETING_GOOGLE_REDIRECT_URI")?.trim();
    if (!v) {
      apiError(503, "marketing_google_oauth_unconfigured", "Google OAuth redirect URI is not configured.");
    }

    return v;
  }

  metaAppId(): string {
    const v = this.configService.get<string>("MARKETING_META_APP_ID")?.trim();
    if (!v) {
      apiError(503, "marketing_meta_oauth_unconfigured", "Meta OAuth is not configured for this environment.");
    }

    return v;
  }

  metaRedirectUri(): string {
    const v = this.configService.get<string>("MARKETING_META_REDIRECT_URI")?.trim();
    if (!v) {
      apiError(503, "marketing_meta_oauth_unconfigured", "Meta OAuth redirect URI is not configured.");
    }

    return v;
  }

  publicAppOrigin(): string {
    const v =
      this.configService.get<string>("MARKETING_PUBLIC_APP_ORIGIN")?.trim() ??
      this.configService.get<string>("CORS_ORIGIN")?.split(",")[0]?.trim();

    return v ?? "http://localhost:3000";
  }

  async buildGoogleAuthorizeUrl(organizationId: string): Promise<{ url: string }> {
    this.googleClientId();

    const { state_token } = await this.createOAuthState(organizationId, "google");
    const redirect_uri = encodeURIComponent(this.googleRedirectUri());
    const client_id = encodeURIComponent(this.googleClientId());
    const scope = encodeURIComponent("https://www.googleapis.com/auth/business.manage");

    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${client_id}` +
      `&redirect_uri=${redirect_uri}` +
      `&response_type=code` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(state_token)}`;

    return { url };
  }

  async buildMetaAuthorizeUrl(organizationId: string): Promise<{ url: string }> {
    this.metaAppId();

    const { state_token } = await this.createOAuthState(organizationId, "meta");
    const redirect_uri = encodeURIComponent(this.metaRedirectUri());
    const client_id = encodeURIComponent(this.metaAppId());
    const scope = encodeURIComponent(
      ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "business_management"].join(","),
    );

    const url =
      `https://www.facebook.com/v21.0/dialog/oauth` +
      `?client_id=${client_id}` +
      `&redirect_uri=${redirect_uri}` +
      `&state=${encodeURIComponent(state_token)}` +
      `&scope=${scope}`;

    return { url };
  }

  async listChannelsSummary(organizationId: string) {
    const googleRow = await this.channelRepo.findOne({
      where: { organization_id: organizationId, channel_key: GOOGLE_CHANNEL_KEY },
    });
    const facebookRow = await this.channelRepo.findOne({
      where: { organization_id: organizationId, channel_key: META_CHANNEL_KEY },
    });

    const googlePendingSelection = Boolean(
      googleRow?.pending_targets_encrypted && googleRow.connection_status !== "connected",
    );
    const facebookPendingSelection = Boolean(
      facebookRow?.pending_targets_encrypted && facebookRow.connection_status !== "connected",
    );

    let pendingGoogleLocations: Array<{ resourceName: string; title: string }> | undefined;

    if (googleRow?.pending_targets_encrypted && googleRow.connection_status !== "connected") {
      try {
        const pending = this.cryptoService.decryptJson<GooglePendingPayload>(googleRow.pending_targets_encrypted);

        if (pending.kind === "google_pending_v1") {
          pendingGoogleLocations = pending.locations.map((loc) => ({
            resourceName: loc.resourceName,
            title: loc.title,
          }));
        }
      } catch {
        pendingGoogleLocations = undefined;
      }
    }

    let pendingMetaPages: Array<{ id: string; name: string }> | undefined;

    if (facebookRow?.pending_targets_encrypted && facebookRow.connection_status !== "connected") {
      try {
        const pending = this.cryptoService.decryptJson<MetaPendingPayload>(facebookRow.pending_targets_encrypted);

        if (pending.kind === "meta_pending_v1") {
          pendingMetaPages = pending.pages.map((page) => ({ id: page.id, name: page.name }));
        }
      } catch {
        pendingMetaPages = undefined;
      }
    }

    return {
      channels: [
        {
          channel_key: GOOGLE_CHANNEL_KEY,
          channel_row_id: googleRow?.id ?? null,
          connection_status: googleRow?.connection_status ?? "disconnected",
          account_label: googleRow?.account_label ?? null,
          authorization_health: googleRow?.authorization_health ?? null,
          selected_google_location_resource: googleRow?.google_location_resource ?? null,
          pending_selection: googlePendingSelection,
          oauth_authorizing: googleRow?.connection_status === "authorizing",
          pending_google_locations: pendingGoogleLocations ?? null,
        },
        {
          channel_key: META_CHANNEL_KEY,
          channel_row_id: facebookRow?.id ?? null,
          connection_status: facebookRow?.connection_status ?? "disconnected",
          account_label: facebookRow?.account_label ?? null,
          authorization_health: facebookRow?.authorization_health ?? null,
          selected_facebook_page_id: facebookRow?.facebook_page_id ?? null,
          pending_selection: facebookPendingSelection,
          oauth_authorizing: facebookRow?.connection_status === "authorizing",
          pending_meta_pages: pendingMetaPages ?? null,
        },
        {
          channel_key: "instagram",
          channel_row_id: null,
          deferred: true,
          connection_status: "deferred_v1_5",
          headline: "Instagram publishing ships in Growth Center V1.5",
        },
      ],
    };
  }

  async readPendingGoogleTargets(
    organizationId: string,
  ): Promise<{ locations: GooglePendingPayload["locations"] } | null> {
    const row = await this.ensureChannelRow(organizationId, GOOGLE_CHANNEL_KEY);

    if (!row.pending_targets_encrypted) {
      return null;
    }

    try {
      const pending = this.cryptoService.decryptJson<GooglePendingPayload>(row.pending_targets_encrypted);

      if (pending.kind !== "google_pending_v1") {
        return null;
      }

      return { locations: pending.locations };
    } catch {
      return null;
    }
  }

  async readPendingMetaPages(organizationId: string): Promise<Array<{ id: string; name: string }> | null> {
    const row = await this.ensureChannelRow(organizationId, META_CHANNEL_KEY);

    if (!row.pending_targets_encrypted) {
      return null;
    }

    try {
      const pending = this.cryptoService.decryptJson<MetaPendingPayload>(row.pending_targets_encrypted);

      if (pending.kind !== "meta_pending_v1") {
        return null;
      }

      return pending.pages.map((page) => ({ id: page.id, name: page.name }));
    } catch {
      return null;
    }
  }

  async selectGoogleLocation(organizationId: string, locationResource: string): Promise<void> {
    const row = await this.ensureChannelRow(organizationId, GOOGLE_CHANNEL_KEY);

    if (!row.pending_targets_encrypted) {
      apiError(400, "marketing_google_selection_missing", "Connect Google again — no pending locations were found.");
    }

    let pending: GooglePendingPayload;

    try {
      pending = this.cryptoService.decryptJson<GooglePendingPayload>(row.pending_targets_encrypted);
    } catch {
      apiError(400, "marketing_google_selection_invalid", "Pending OAuth payload could not be read.");
    }

    if (pending.kind !== "google_pending_v1") {
      apiError(400, "marketing_google_selection_invalid", "Unexpected pending payload.");
    }

    const match = pending.locations.find((loc) => loc.resourceName === locationResource.trim());

    if (!match) {
      apiError(400, "marketing_google_location_unknown", "That location was not returned by Google for this connection.");
    }

    const credentials: GoogleCredentialsPayload = {
      kind: "google_credentials_v1",
      access_token: pending.access_token,
      refresh_token: pending.refresh_token,
      expires_at: pending.expires_at,
    };

    row.encrypted_credentials = this.cryptoService.encryptJson(credentials);
    row.pending_targets_encrypted = null;
    row.google_account_resource = match.accountResource;
    row.google_location_resource = match.resourceName;
    row.connection_status = "connected";
    row.authorization_health = "healthy";
    row.account_label = match.title;

    await this.channelRepo.save(row);
  }

  async selectMetaPage(organizationId: string, pageId: string): Promise<void> {
    const row = await this.ensureChannelRow(organizationId, META_CHANNEL_KEY);

    if (!row.pending_targets_encrypted) {
      apiError(400, "marketing_meta_selection_missing", "Connect Meta again — no pending Pages were found.");
    }

    let pending: MetaPendingPayload;

    try {
      pending = this.cryptoService.decryptJson<MetaPendingPayload>(row.pending_targets_encrypted);
    } catch {
      apiError(400, "marketing_meta_selection_invalid", "Pending OAuth payload could not be read.");
    }

    if (pending.kind !== "meta_pending_v1") {
      apiError(400, "marketing_meta_selection_invalid", "Unexpected pending payload.");
    }

    const match = pending.pages.find((page) => page.id === pageId.trim());

    if (!match) {
      apiError(400, "marketing_meta_page_unknown", "That Page was not returned by Meta for this connection.");
    }

    const credentials: MetaCredentialsPayload = {
      kind: "meta_credentials_v1",
      page_access_token: match.access_token,
    };

    row.encrypted_credentials = this.cryptoService.encryptJson(credentials);
    row.pending_targets_encrypted = null;
    row.facebook_page_id = match.id;
    row.connection_status = "connected";
    row.authorization_health = "healthy";
    row.account_label = match.name;

    await this.channelRepo.save(row);
  }

  async applyGoogleOAuthPending(organizationId: string, pending: GooglePendingPayload): Promise<void> {
    const channelRow = await this.ensureChannelRow(organizationId, GOOGLE_CHANNEL_KEY);

    channelRow.pending_targets_encrypted = this.cryptoService.encryptJson(pending);
    channelRow.encrypted_credentials = null;
    channelRow.connection_status = "authorizing";
    channelRow.google_location_resource = null;
    channelRow.google_account_resource = null;
    channelRow.authorization_health = pending.locations.length ? "pending_selection" : "error";
    channelRow.account_label =
      pending.locations.length === 1 ? pending.locations[0]?.title ?? "Google Business Profile" : "Choose a Google location";

    await this.channelRepo.save(channelRow);
  }

  async applyMetaOAuthPending(organizationId: string, pending: MetaPendingPayload): Promise<void> {
    const channelRow = await this.ensureChannelRow(organizationId, META_CHANNEL_KEY);

    channelRow.pending_targets_encrypted = this.cryptoService.encryptJson(pending);
    channelRow.encrypted_credentials = null;
    channelRow.connection_status = "authorizing";
    channelRow.facebook_page_id = null;
    channelRow.authorization_health = pending.pages.length ? "pending_selection" : "error";
    channelRow.account_label =
      pending.pages.length === 1 ? pending.pages[0]?.name ?? "Facebook Page" : "Choose a Facebook Page";

    await this.channelRepo.save(channelRow);
  }

  async findChannelForOrg(organizationId: string, channelId: string): Promise<MarketingConnectedChannelEntity> {
    const row = await this.channelRepo.findOne({
      where: { id: channelId.trim(), organization_id: organizationId },
    });

    if (!row) {
      apiError(404, "marketing_channel_missing", "Channel row was not found.");
    }

    return row;
  }

  async reconnectChannel(organizationId: string, channelId: string): Promise<{ url: string }> {
    const row = await this.findChannelForOrg(organizationId, channelId);

    if (row.channel_key === GOOGLE_CHANNEL_KEY) {
      return this.buildGoogleAuthorizeUrl(organizationId);
    }

    if (row.channel_key === META_CHANNEL_KEY) {
      return this.buildMetaAuthorizeUrl(organizationId);
    }

    apiError(400, "marketing_channel_not_oauth", "That channel cannot be reconnected via OAuth.");
  }

  async disconnectChannel(organizationId: string, channelId: string): Promise<void> {
    const row = await this.findChannelForOrg(organizationId, channelId);

    row.encrypted_credentials = null;
    row.pending_targets_encrypted = null;
    row.google_account_resource = null;
    row.google_location_resource = null;
    row.facebook_page_id = null;
    row.token_expires_at = null;
    row.connection_status = "disconnected";
    row.authorization_health = null;
    row.permissions_status = null;
    row.account_label = null;

    await this.channelRepo.save(row);
  }

  async countConnectedPublishingTargets(organizationId: string): Promise<number> {
    const rows = await this.channelRepo.find({
      where: {
        organization_id: organizationId,
        channel_key: In([GOOGLE_CHANNEL_KEY, META_CHANNEL_KEY]),
      },
    });

    return rows.filter((entry) => entry.connection_status === "connected").length;
  }

  async loadGoogleCredentials(
    organizationId: string,
  ): Promise<{ row: MarketingConnectedChannelEntity; credentials: GoogleCredentialsPayload } | null> {
    const row = await this.channelRepo.findOne({
      where: { organization_id: organizationId, channel_key: GOOGLE_CHANNEL_KEY },
    });

    if (!row?.encrypted_credentials || row.connection_status !== "connected") {
      return null;
    }

    try {
      const credentials = this.cryptoService.decryptJson<GoogleCredentialsPayload>(row.encrypted_credentials);

      if (credentials.kind !== "google_credentials_v1") {
        return null;
      }

      return { row, credentials };
    } catch {
      return null;
    }
  }

  async loadMetaCredentials(
    organizationId: string,
  ): Promise<{ row: MarketingConnectedChannelEntity; credentials: MetaCredentialsPayload } | null> {
    const row = await this.channelRepo.findOne({
      where: { organization_id: organizationId, channel_key: META_CHANNEL_KEY },
    });

    if (!row?.encrypted_credentials || row.connection_status !== "connected" || !row.facebook_page_id) {
      return null;
    }

    try {
      const credentials = this.cryptoService.decryptJson<MetaCredentialsPayload>(row.encrypted_credentials);

      if (credentials.kind !== "meta_credentials_v1") {
        return null;
      }

      return { row, credentials };
    } catch {
      return null;
    }
  }

  googleChannelKey(): string {
    return GOOGLE_CHANNEL_KEY;
  }

  metaChannelKey(): string {
    return META_CHANNEL_KEY;
  }
}
