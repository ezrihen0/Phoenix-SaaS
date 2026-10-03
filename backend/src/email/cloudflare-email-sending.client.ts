import type { EmailAttachment, EmailSendInput } from "./email.types";
import { parseEmailFrom } from "./parse-email-from";

export type CloudflareEmailSendingConfig = {
  accountId: string;
  apiToken: string;
  fromRaw: string;
  apiBaseUrl: string;
  timeoutMs: number;
};

type CloudflareSendResponse = {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: {
    message_id?: string;
    delivered?: string[];
    queued?: string[];
    permanent_bounces?: string[];
  };
};

export class CloudflareEmailSendingClient {
  constructor(private readonly config: CloudflareEmailSendingConfig) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.accountId
      && this.config.apiToken
      && this.config.fromRaw
      && this.config.apiBaseUrl,
    );
  }

  async send(input: EmailSendInput): Promise<{ messageId: string }> {
    const parsedFrom = parseEmailFrom(this.config.fromRaw);
    if (!parsedFrom) {
      throw new Error("SMTP_FROM is not configured or could not be parsed.");
    }

    const text = input.body?.trim();
    const html = input.html?.trim();
    if (!text && !html) {
      throw new Error("Email must include plain text or HTML content.");
    }

    const from =
      parsedFrom.name
        ? { address: parsedFrom.address, name: parsedFrom.name }
        : parsedFrom.address;

    const body: Record<string, unknown> = {
      from,
      to: [input.to.trim()],
      subject: input.subject,
    };
    if (text) {
      body.text = text;
    }
    if (html) {
      body.html = html;
    }

    const attachments = (input.attachments ?? []).map((att) => this.toAttachment(att));
    if (attachments.length > 0) {
      body.attachments = attachments;
    }

    const url =
      `${this.config.apiBaseUrl.replace(/\/+$/, "")}`
      + `/accounts/${encodeURIComponent(this.config.accountId)}/email/sending/send`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Cloudflare Email Sending API timed out after ${this.config.timeoutMs}ms.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const payload = (await response.json().catch(() => null)) as CloudflareSendResponse | null;
    if (!response.ok || !payload?.success) {
      const apiMessages =
        payload?.errors?.map((entry) => entry.message).filter(Boolean).join("; ")
        || `HTTP ${response.status}`;
      throw new Error(`Cloudflare Email Sending API failed: ${apiMessages}`);
    }

    const messageId = payload.result?.message_id?.trim();
    if (!messageId) {
      throw new Error("Cloudflare Email Sending API did not return a message_id.");
    }

    return { messageId };
  }

  private toAttachment(att: EmailAttachment) {
    return {
      filename: att.filename,
      type: att.contentType,
      disposition: "attachment",
      content: att.content.toString("base64"),
    };
  }
}
