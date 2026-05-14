import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { MarketingChannelsService, type GooglePendingPayload, type MetaPendingPayload } from "./marketing-channels.service";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

type MetaTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string };
};

type GoogleAccountsList = { accounts?: Array<{ name?: string; accountName?: string }> };

type GoogleLocationsList = {
  locations?: Array<{ name?: string; title?: string }>;
  nextPageToken?: string;
};

@Injectable()
export class MarketingOAuthCallbackService {
  constructor(
    private readonly configService: ConfigService,
    private readonly channelsService: MarketingChannelsService,
  ) {}

  async finishGoogleOAuth(code: string | undefined, state: string | undefined): Promise<string> {
    const origin = this.channelsService.publicAppOrigin();

    if (!code || !state) {
      return `${origin}/marketing/channels?oauth_error=google&reason=missing_params`;
    }

    try {
      const stateRow = await this.channelsService.consumeOAuthState(state.trim());
      const organizationId = stateRow.organization_id;

      if (stateRow.provider !== "google") {
        return `${origin}/marketing/channels?oauth_error=google&reason=provider_mismatch`;
      }

      const clientId = this.configService.get<string>("MARKETING_GOOGLE_CLIENT_ID")?.trim();
      const clientSecret = this.configService.get<string>("MARKETING_GOOGLE_CLIENT_SECRET")?.trim();
      const redirectUri = this.channelsService.googleRedirectUri();

      if (!clientId || !clientSecret) {
        return `${origin}/marketing/channels?oauth_error=google&reason=server_misconfigured`;
      }

      const token = await this.exchangeGoogleAuthorizationCode(code, clientId, clientSecret, redirectUri);

      if (token.error || !token.access_token) {
        return `${origin}/marketing/channels?oauth_error=google&reason=token_exchange_failed`;
      }

      const expires_at =
        typeof token.expires_in === "number"
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : undefined;

      const locations = await this.fetchGoogleLocations(token.access_token);

      const pending: GooglePendingPayload = {
        kind: "google_pending_v1",
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at,
        locations,
      };

      await this.channelsService.applyGoogleOAuthPending(organizationId, pending);

      if (locations.length === 1) {
        await this.channelsService.selectGoogleLocation(organizationId, locations[0]!.resourceName);

        return `${origin}/marketing/channels?oauth_success=google`;
      }

      return `${origin}/marketing/channels?oauth_success=google&needs_location=1`;
    } catch {
      return `${origin}/marketing/channels?oauth_error=google&reason=unexpected`;
    }
  }

  async finishMetaOAuth(code: string | undefined, state: string | undefined): Promise<string> {
    const origin = this.channelsService.publicAppOrigin();

    if (!code || !state) {
      return `${origin}/marketing/channels?oauth_error=meta&reason=missing_params`;
    }

    try {
      const stateRow = await this.channelsService.consumeOAuthState(state.trim());
      const organizationId = stateRow.organization_id;

      if (stateRow.provider !== "meta") {
        return `${origin}/marketing/channels?oauth_error=meta&reason=provider_mismatch`;
      }

      const clientId = this.configService.get<string>("MARKETING_META_APP_ID")?.trim();
      const clientSecret = this.configService.get<string>("MARKETING_META_APP_SECRET")?.trim();
      const redirectUri = this.channelsService.metaRedirectUri();

      if (!clientId || !clientSecret) {
        return `${origin}/marketing/channels?oauth_error=meta&reason=server_misconfigured`;
      }

      const shortToken = await this.exchangeMetaAuthorizationCode(code, clientId, clientSecret, redirectUri);

      if (shortToken.error || !shortToken.access_token) {
        return `${origin}/marketing/channels?oauth_error=meta&reason=token_exchange_failed`;
      }

      const userAccessToken = await this.exchangeMetaLongLivedToken(shortToken.access_token, clientId, clientSecret);

      if (!userAccessToken) {
        return `${origin}/marketing/channels?oauth_error=meta&reason=long_lived_failed`;
      }

      const pages = await this.fetchMetaPages(userAccessToken);

      const pending: MetaPendingPayload = {
        kind: "meta_pending_v1",
        pages,
      };

      await this.channelsService.applyMetaOAuthPending(organizationId, pending);

      if (pages.length === 1) {
        await this.channelsService.selectMetaPage(organizationId, pages[0]!.id);

        return `${origin}/marketing/channels?oauth_success=meta`;
      }

      return `${origin}/marketing/channels?oauth_success=meta&needs_page=1`;
    } catch {
      return `${origin}/marketing/channels?oauth_error=meta&reason=unexpected`;
    }
  }

  private async exchangeGoogleAuthorizationCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    return (await response.json()) as GoogleTokenResponse;
  }

  private async fetchGoogleLocations(accessToken: string) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const accountsResponse = await fetch("https://mybusinessbusinessinformation.googleapis.com/v1/accounts", {
      headers,
    });
    const accountsPayload = (await accountsResponse.json()) as GoogleAccountsList;

    if (!accountsResponse.ok) {
      return [];
    }

    const accounts = accountsPayload.accounts ?? [];
    const locations: GooglePendingPayload["locations"] = [];

    for (const account of accounts) {
      const accountName = account.name;

      if (!accountName) {
        continue;
      }

      let pageToken: string | undefined;

      do {
        const url = new URL(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${encodeURIComponent(accountName)}/locations`,
        );
        url.searchParams.set("readMask", "name,title");
        url.searchParams.set("pageSize", "100");

        if (pageToken) {
          url.searchParams.set("pageToken", pageToken);
        }

        const locResponse = await fetch(url.toString(), { headers });
        const locPayload = (await locResponse.json()) as GoogleLocationsList;

        if (!locResponse.ok) {
          break;
        }

        for (const loc of locPayload.locations ?? []) {
          if (!loc.name) {
            continue;
          }

          locations.push({
            resourceName: loc.name,
            title: loc.title ?? loc.name,
            accountResource: accountName,
          });
        }

        pageToken = locPayload.nextPageToken;
      } while (pageToken);
    }

    return locations;
  }

  private async exchangeMetaAuthorizationCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<MetaTokenResponse> {
    const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("client_secret", clientSecret);
    url.searchParams.set("code", code);

    const response = await fetch(url.toString());
    return (await response.json()) as MetaTokenResponse;
  }

  private async exchangeMetaLongLivedToken(shortToken: string, clientId: string, clientSecret: string): Promise<string | undefined> {
    const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("client_secret", clientSecret);
    url.searchParams.set("fb_exchange_token", shortToken);

    const response = await fetch(url.toString());
    const payload = (await response.json()) as MetaTokenResponse;

    return typeof payload.access_token === "string" ? payload.access_token : undefined;
  }

  private async fetchMetaPages(userAccessToken: string): Promise<MetaPendingPayload["pages"]> {
    const url = new URL("https://graph.facebook.com/v21.0/me/accounts");
    url.searchParams.set("fields", "id,name,access_token,tasks");
    url.searchParams.set("access_token", userAccessToken);

    const response = await fetch(url.toString());
    const payload = (await response.json()) as { data?: Array<{ id?: string; name?: string; access_token?: string }> };

    const rows = payload.data ?? [];

    return rows
      .filter((row) => row.id && row.name && row.access_token)
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        access_token: row.access_token as string,
      }));
  }
}
