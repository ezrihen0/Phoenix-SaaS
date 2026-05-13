import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { isTelephonyOfficeRole } from "./telephony-role";
import { requireTelephonyOrganizationId } from "./telephony-org-scope";
import { CallReportingService } from "./call-reporting.service";

@UseGuards(SessionGuard)
@Controller("api/call-reporting")
export class CallReportingController {
  constructor(private readonly callReportingService: CallReportingService) {}

  @Get("summary")
  async getSummary(
    @Req() request: RequestWithActor,
    @Query("from") fromRaw: string | undefined,
    @Query("to") toRaw: string | undefined,
    @Query("days") daysRaw: string | undefined,
  ) {
    const actor = request.actor;

    if (!actor || !isTelephonyOfficeRole(actor.role ?? actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can access call reporting.");
    }

    const to = this.parseOptionalDate(toRaw) ?? new Date();
    const from = this.parseOptionalDate(fromRaw) ?? this.resolveFromDate(to, daysRaw);

    if (from > to) {
      apiError(400, "call_reporting_window_invalid", "The reporting window start must be before the end.");
    }

    const organizationId = requireTelephonyOrganizationId(actor);

    return apiSuccess(await this.callReportingService.getSummary({ organizationId, from, to }));
  }

  private parseOptionalDate(value: string | undefined) {
    if (!value?.trim()) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      apiError(400, "call_reporting_window_invalid", "Reporting dates must be valid ISO date values.");
    }

    return parsed;
  }

  private resolveFromDate(to: Date, daysRaw: string | undefined) {
    const parsedDays = Number(daysRaw ?? "30");
    const days = Number.isFinite(parsedDays) ? Math.max(1, Math.min(180, Math.trunc(parsedDays))) : 30;
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    from.setUTCHours(0, 0, 0, 0);
    return from;
  }
}
