import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type EmailSendInput = {
  to: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
};

export type EmailSendResult = {
  messageId: string;
  sentAt: Date;
};

@Injectable()
export class EmailService {
  private transporter: Transporter | null = null;
  private configured = false;
  private fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>("SMTP_HOST")?.trim();
    const port = this.configService.get<string>("SMTP_PORT")?.trim();
    const userFromEnv = this.configService.get<string>("SMTP_USER")?.trim();
    const pass =
      this.configService.get<string>("SMTP_PASS")?.trim()
      || this.configService.get<string>("CF_API_TOKEN")?.trim();
    const user =
      userFromEnv
      || (host === "smtp.mx.cloudflare.net" ? "api_token" : undefined);
    const ownerEmail = this.configService.get<string>("PHOENIX_OWNER_EMAIL")?.trim();
    this.fromAddress =
      this.configService.get<string>("SMTP_FROM")?.trim()
      || (ownerEmail ? `Phoenix Fireplace <${ownerEmail}>` : "");

    const portNumber = Number(port) || 587;
    const hasAuth = Boolean(user && pass);

    if (host && port && this.fromAddress && hasAuth) {
      this.transporter = createTransport({
        host,
        port: portNumber,
        secure: portNumber === 465,
        auth: { user: user!, pass: pass! },
      });
      this.configured = true;
    }
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    if (!this.configured || !this.transporter) {
      throw new Error("Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM environment variables.");
    }

    const from = this.fromAddress || undefined;
    if (!from) {
      throw new Error("SMTP_FROM is not configured.");
    }

    const result = await this.transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.body,
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
}
