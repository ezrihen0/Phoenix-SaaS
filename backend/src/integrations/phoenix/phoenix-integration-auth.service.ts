import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";

@Injectable()
export class PhoenixIntegrationAuthService {
  constructor(private readonly configService: ConfigService) {}

  isIntegrationRequestAuthorized(request: Request) {
    const configuredSecret = this.getConfiguredSecret();
    if (!configuredSecret) {
      return false;
    }

    const presented = this.readBearerToken(request);
    if (!presented) {
      return false;
    }

    return this.secretsMatch(configuredSecret, presented);
  }

  assertIntegrationRequestAuthorized(request: Request) {
    if (!this.isIntegrationRequestAuthorized(request)) {
      return false;
    }
    return true;
  }

  getConfiguredSecret() {
    const primary = this.configService.get<string>("PHOENIX_INTEGRATION_SECRET")?.trim();
    if (primary) {
      return primary;
    }
    return this.configService.get<string>("WIZFIELD_INTEGRATION_SECRET")?.trim() || "";
  }

  private readBearerToken(request: Request) {
    const header = request.get("authorization")?.trim();
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      return "";
    }
    return header.slice(7).trim();
  }

  private secretsMatch(expected: string, presented: string) {
    const expectedBuffer = Buffer.from(expected);
    const presentedBuffer = Buffer.from(presented);
    if (expectedBuffer.length !== presentedBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, presentedBuffer);
  }
}
