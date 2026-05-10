import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes } from "crypto";
import type { Request, Response } from "express";
import { Repository } from "typeorm";

import { CustomerEntity } from "../database/entities/customer.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobEntity } from "../database/entities/job.entity";
import { PortalAccessEventEntity } from "../database/entities/portal-access-event.entity";
import { PortalMagicLinkEntity } from "../database/entities/portal-magic-link.entity";
import { PortalSessionEntity } from "../database/entities/portal-session.entity";
import { QuoteEntity } from "../database/entities/quote.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";

@Injectable()
export class CustomerPortalService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customersRepository: Repository<CustomerEntity>,
    @InjectRepository(JobEntity)
    private readonly jobsRepository: Repository<JobEntity>,
    @InjectRepository(QuoteEntity)
    private readonly quotesRepository: Repository<QuoteEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoicesRepository: Repository<InvoiceEntity>,
    @InjectRepository(TechnicianEntity)
    private readonly techniciansRepository: Repository<TechnicianEntity>,
    @InjectRepository(PortalMagicLinkEntity)
    private readonly linksRepository: Repository<PortalMagicLinkEntity>,
    @InjectRepository(PortalSessionEntity)
    private readonly sessionsRepository: Repository<PortalSessionEntity>,
    @InjectRepository(PortalAccessEventEntity)
    private readonly eventsRepository: Repository<PortalAccessEventEntity>,
    private readonly configService: ConfigService,
  ) {}

  async redeemMagicLinkToken(rawToken: string, request: Request, response: Response) {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    const link = await this.linksRepository.findOne({
      where: { token_hash: tokenHash },
    });

    if (!link) {
      return { ok: false as const, code: "invalid_link" };
    }

    if (link.expires_at <= now) {
      if (link.status !== "expired") {
        link.status = "expired";
        await this.linksRepository.save(link);
        await this.logEvent(link.customer_id, link.id, "link_expired", null, null);
      }
      return { ok: false as const, code: "expired_link" };
    }

    if (link.status === "used") {
      return { ok: false as const, code: "used_link" };
    }

    if (!link.opened_at) {
      link.opened_at = now;
      link.status = "opened";
      await this.linksRepository.save(link);
      await this.logEvent(link.customer_id, link.id, "link_opened", null, link.delivery_method);
    }

    const rawSessionToken = randomBytes(48).toString("hex");
    const session = await this.sessionsRepository.save(
      this.sessionsRepository.create({
        session_token_hash: this.hashToken(rawSessionToken),
        customer_id: link.customer_id,
        portal_magic_link_id: link.id,
        is_preview: false,
        is_read_only: false,
        expires_at: this.getPortalSessionExpiryDate(),
        ip_address: request.ip ?? null,
        user_agent: request.get("user-agent") ?? null,
      }),
    );

    link.status = "used";
    link.used_at = now;
    await this.linksRepository.save(link);
    await this.logEvent(link.customer_id, link.id, "link_used", null, link.delivery_method);
    await this.logEvent(link.customer_id, link.id, "session_created", null, link.delivery_method, {
      portal_session_id: session.id,
    });

    response.cookie(this.getPortalSessionCookieName(), rawSessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.isPortalSessionCookieSecure(),
      expires: session.expires_at,
      path: "/",
    });

    return {
      ok: true as const,
      customer_id: link.customer_id,
      session_expires_at: session.expires_at.toISOString(),
    };
  }

  async resolvePortalSessionFromRequest(request: Request) {
    const token = request.cookies?.[this.getPortalSessionCookieName()] as string | undefined;
    if (!token) {
      return null;
    }

    const session = await this.sessionsRepository.findOne({
      where: { session_token_hash: this.hashToken(token) },
    });

    if (!session || session.expires_at <= new Date()) {
      return null;
    }

    return {
      customer_id: session.customer_id,
      session,
      is_preview: session.is_preview,
      is_read_only: session.is_read_only,
    };
  }

  async logoutPortalSession(request: Request, response: Response) {
    const token = request.cookies?.[this.getPortalSessionCookieName()] as string | undefined;
    if (token) {
      await this.sessionsRepository.delete({
        session_token_hash: this.hashToken(token),
      });
    }

    response.clearCookie(this.getPortalSessionCookieName(), {
      httpOnly: true,
      sameSite: "lax",
      secure: this.isPortalSessionCookieSecure(),
      path: "/",
    });
  }

  async getPortalHome(customerId: string) {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException({
        error: { code: "customer_not_found", message: "Customer not found." },
      });
    }

    const latestJob = await this.jobsRepository.findOne({
      where: { customer_id: customerId },
      order: { updated_at: "DESC" },
    });
    const technician = latestJob?.assigned_technician_id
      ? await this.techniciansRepository.findOne({ where: { id: latestJob.assigned_technician_id } })
      : null;
    const activeQuote = latestJob
      ? await this.quotesRepository.findOne({ where: { job_id: latestJob.id } })
      : null;
    const invoice = latestJob
      ? await this.invoicesRepository.findOne({ where: { job_id: latestJob.id } })
      : null;

    return {
      active_inspection: null,
      active_quote: activeQuote
        ? {
          id: activeQuote.id,
          status: activeQuote.status,
          price_cents: activeQuote.price_cents,
        }
        : null,
      payment_state: invoice
        ? {
          invoice_id: invoice.id,
          invoice_status: invoice.status,
          paid_at: invoice.paid_at ? invoice.paid_at.toISOString() : null,
        }
        : null,
      contact: {
        office_phone: this.normalizeMaybe(customer.phone),
        office_email: this.normalizeMaybe(customer.email),
        technician_name: technician?.display_name ?? null,
        technician_phone: technician?.phone ?? null,
      },
    };
  }

  private normalizeMaybe(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized?.length ? normalized : null;
  }

  private async logEvent(
    customerId: string,
    portalMagicLinkId: string | null,
    eventType: PortalAccessEventEntity["event_type"],
    actorUserId: string | null,
    deliveryMethod: string | null,
    metadata: Record<string, unknown> | null = null,
  ) {
    await this.eventsRepository.save(
      this.eventsRepository.create({
        customer_id: customerId,
        portal_magic_link_id: portalMagicLinkId,
        portal_session_id: null,
        event_type: eventType,
        actor_user_id: actorUserId,
        delivery_method: deliveryMethod,
        ip_address: null,
        user_agent: null,
        metadata: metadata ?? null,
      }),
    );
  }

  private hashToken(rawToken: string) {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  private getPortalSessionCookieName() {
    return this.configService.get<string>("PORTAL_SESSION_COOKIE_NAME") ?? "phoenix_portal_session";
  }

  private getPortalSessionExpiryDate() {
    const ttlHours = Number(this.configService.get<string>("PORTAL_SESSION_TTL_HOURS") ?? "12");
    const safeTtl = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 12;
    return new Date(Date.now() + safeTtl * 60 * 60 * 1000);
  }

  private isPortalSessionCookieSecure() {
    return (this.configService.get<string>("PORTAL_SESSION_COOKIE_SECURE") ?? "false").toLowerCase() === "true";
  }
}
