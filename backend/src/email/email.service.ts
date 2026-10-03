import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import { CloudflareEmailSendingClient } from "./cloudflare-email-sending.client";
import type { EmailSendInput, EmailSendResult } from "./email.types";

export type { EmailAttachment, EmailSendInput, EmailSendResult } from "./email.types";

type EmailTransport = "smtp" | "cloudflare_api";

@Injectable()
export class EmailService {
  private transporter: Transporter | null = null;
  private cloudflareClient: CloudflareEmailSendingClient | null = null;
  private configured = false;
  private transport: EmailTransport = "smtp";
  private fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.resolveFromAddress();
    this.transport = this.resolveTransport();

    if (this.transport === "cloudflare_api") {
      this.cloudflareClient = this.buildCloudflareClient();
      this.configured = Boolean(this.cloudflareClient?.isConfigured());
      return;
    }

    this.transporter = this.buildSmtpTransporter();
    this.configured = Boolean(this.transporter);
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    if (!this.configured) {
      throw new Error(this.configurationErrorMessage());
    }

    const from = this.fromAddress || undefined;
    if (!from) {
      throw new Error("SMTP_FROM is not configured.");
    }

    if (this.transport === "cloudflare_api" && this.cloudflareClient) {
      const result = await this.cloudflareClient.send(input);
      return {
        messageId: result.messageId,
        sentAt: new Date(),
      };
    }

    if (!this.transporter) {
      throw new Error(this.configurationErrorMessage());
    }

    const result = await this.transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: input.html?.trim() || undefined,
      attachments: (input.attachments ?? []).map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    });

    return {
      messageId: result.messageId,
      sentAt: new Date(),
    };
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getTransport(): EmailTransport {
    return this.transport;
  }

  private resolveTransport(): EmailTransport {
    const raw = this.configService.get<string>("EMAIL_TRANSPORT")?.trim().toLowerCase();
    if (raw === "cloudflare_api") {
      return "cloudflare_api";
    }
    return "smtp";
  }

  private resolveFromAddress(): string {
    const ownerEmail = this.configService.get<string>("PHOENIX_OWNER_EMAIL")?.trim();
    return (
      this.configService.get<string>("SMTP_FROM")?.trim()
      || (ownerEmail ? `Phoenix Fireplace <${ownerEmail}>` : "")
    );
  }

  private resolveApiToken(): string | undefined {
    return (
      this.configService.get<string>("CLOUDFLARE_API_TOKEN")?.trim()
      || this.configService.get<string>("CF_API_TOKEN")?.trim()
      || this.configService.get<string>("SMTP_PASS")?.trim()
    );
  }

  private resolveAccountId(): string | undefined {
    return (
      this.configService.get<string>("CLOUDFLARE_ACCOUNT_ID")?.trim()
      || this.configService.get<string>("CF_ACCOUNT_ID")?.trim()
    );
  }

  private buildCloudflareClient(): CloudflareEmailSendingClient | null {
    const accountId = this.resolveAccountId();
    const apiToken = this.resolveApiToken();
    if (!accountId || !apiToken || !this.fromAddress) {
      return null;
    }

    const timeoutRaw = this.configService.get<string>("EMAIL_HTTP_TIMEOUT_MS")?.trim();
    const timeoutMs = Math.min(Math.max(Number(timeoutRaw) || 25_000, 5_000), 60_000);

    const apiBaseUrl =
      this.configService.get<string>("CLOUDFLARE_API_BASE_URL")?.trim()
      || "https://api.cloudflare.com/client/v4";

    return new CloudflareEmailSendingClient({
      accountId,
      apiToken,
      fromRaw: this.fromAddress,
      apiBaseUrl,
      timeoutMs,
    });
  }

  private buildSmtpTransporter(): Transporter | null {
    const host = this.configService.get<string>("SMTP_HOST")?.trim();
    const port = this.configService.get<string>("SMTP_PORT")?.trim();
    const userFromEnv = this.configService.get<string>("SMTP_USER")?.trim();
    const pass = this.resolveApiToken();
    const user =
      userFromEnv
      || (host === "smtp.mx.cloudflare.net" ? "api_token" : undefined);

    const portNumber = Number(port) || 587;
    const hasAuth = Boolean(user && pass);

    if (host && port && this.fromAddress && hasAuth) {
      return createTransport({
        host,
        port: portNumber,
        secure: portNumber === 465,
        auth: { user: user!, pass: pass! },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    }

    return null;
  }

  private configurationErrorMessage(): string {
    if (this.transport === "cloudflare_api") {
      const missing: string[] = [];
      if (!this.resolveAccountId()) {
        missing.push("CLOUDFLARE_ACCOUNT_ID");
      }
      if (!this.resolveApiToken()) {
        missing.push("CLOUDFLARE_API_TOKEN (or CF_API_TOKEN / SMTP_PASS)");
      }
      if (!this.fromAddress) {
        missing.push("SMTP_FROM");
      }
      const suffix = missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : "";
      return `Email service is not configured for EMAIL_TRANSPORT=cloudflare_api.${suffix}`;
    }
    return "Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM environment variables.";
  }
}
