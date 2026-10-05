import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class WebPushConfigService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    const raw = this.configService.get<string>("WEB_PUSH_ENABLED")?.trim().toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
  }

  getVapidPublicKey(): string | null {
    const value = this.configService.get<string>("VAPID_PUBLIC_KEY")?.trim();
    return value || null;
  }

  getVapidPrivateKey(): string | null {
    const value = this.configService.get<string>("VAPID_PRIVATE_KEY")?.trim();
    return value || null;
  }

  getVapidSubject(): string {
    return (
      this.configService.get<string>("VAPID_SUBJECT")?.trim()
      || "mailto:service@phoenixfireplace.ca"
    );
  }

  isConfiguredForSend(): boolean {
    if (!this.isEnabled()) {
      return false;
    }

    return Boolean(this.getVapidPublicKey() && this.getVapidPrivateKey());
  }
}
