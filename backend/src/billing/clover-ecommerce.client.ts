import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type CloverEcommerceCustomerPayload = {
  id?: string;
  firstName?: string;
  lastName?: string;
};

@Injectable()
export class CloverEcommerceClient {
  private readonly logger = new Logger(CloverEcommerceClient.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.accessToken()?.trim());
  }

  /**
   * Creates a customer with card-on-file from a single-use Clover card token.
   * @see https://docs.clover.com/dev/docs/ecommerce-api-customers
   */
  async createCustomerWithSource(payload: {
    source: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<CloverEcommerceCustomerPayload | null> {
    const token = this.accessToken();
    if (!token?.trim()) {
      return null;
    }

    const body: Record<string, unknown> = {
      source: payload.source.trim(),
    };

    if (payload.email?.trim()) {
      body.emailAddresses = [{ emailAddress: payload.email.trim() }];
    }
    if (payload.firstName?.trim()) {
      body.firstName = payload.firstName.trim();
    }
    if (payload.lastName?.trim()) {
      body.lastName = payload.lastName.trim();
    }

    const url = `${this.apiBase()}/v1/customers`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: `Bearer ${token.trim()}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.warn(`Clover ecommerce POST /v1/customers failed ${response.status}: ${text.slice(0, 400)}`);
      return null;
    }

    return (await response.json()) as CloverEcommerceCustomerPayload;
  }

  /**
   * Adds or replaces card-on-file on an existing ecommerce customer using a token.
   */
  async updateCustomerSource(customerId: string, source: string): Promise<CloverEcommerceCustomerPayload | null> {
    const token = this.accessToken();
    if (!token?.trim()) {
      return null;
    }

    const url = `${this.apiBase()}/v1/customers/${encodeURIComponent(customerId.trim())}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Authorization: `Bearer ${token.trim()}`,
      },
      body: JSON.stringify({ source: source.trim() }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.warn(`Clover ecommerce PUT /v1/customers/{id} failed ${response.status}: ${text.slice(0, 400)}`);
      return null;
    }

    return (await response.json()) as CloverEcommerceCustomerPayload;
  }

  private apiBase(): string {
    return (
      this.configService.get<string>("CLOVER_ECOMMERCE_API_BASE_URL")?.trim()
      ?? "https://scl-sandbox.dev.clover.com"
    ).replace(/\/$/, "");
  }

  private accessToken(): string | undefined {
    return (
      this.configService.get<string>("CLOVER_ECOMMERCE_ACCESS_TOKEN")?.trim()
      ?? this.configService.get<string>("CLOVER_ACCESS_TOKEN")?.trim()
      ?? this.configService.get<string>("CLOVER_PRIVATE_TOKEN")?.trim()
    );
  }
}
