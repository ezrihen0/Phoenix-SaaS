import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";

import { assertTelnyxEd25519SignatureValid } from "../common/verify-telnyx-ed25519-webhook";
import { CallFlowSettingsService } from "./call-flow-settings.service";

export type TelnyxGetAvailabilityResponse = {
  availability_signal: "unknown" | "likely_open" | "likely_busy" | "conflicting_data";
  coarse_hints: string[];
  disclaimer: string;
  data_source: string;
  bookable_slots: unknown[];
};

const FALLBACK: TelnyxGetAvailabilityResponse = {
  availability_signal: "unknown",
  coarse_hints: [],
  disclaimer: "This availability signal is non-binding. A team member will confirm details.",
  data_source: "fallback_unavailable_v0",
  bookable_slots: [],
};

@Injectable()
export class TelnyxAiAvailabilityToolService {
  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly callFlowSettingsService: CallFlowSettingsService,
  ) {}

  async handleGetAvailability(params: {
    rawBody: Buffer;
    signature: string | null;
    timestamp: string | null;
    callControlIdHeader: string | null;
  }): Promise<TelnyxGetAvailabilityResponse> {
    const skip = this.toBoolean(this.configService.get<string>("TELNYX_SKIP_SIGNATURE_VERIFICATION"));
    const publicKey = this.configService.get<string>("TELNYX_PUBLIC_KEY")?.trim() ?? "";

    assertTelnyxEd25519SignatureValid({
      rawBody: params.rawBody,
      signature: params.signature,
      timestamp: params.timestamp,
      publicKey,
      skipVerification: skip,
    });

    const callControlId = params.callControlIdHeader?.trim() ?? "";
    if (!callControlId) {
      return {
        ...FALLBACK,
        data_source: "fallback_missing_call_control_id_v0",
      };
    }

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          inbound_owned_phone_number_id
        FROM recent_calls
        WHERE provider = 'telnyx'
          AND provider_call_id = ?
        LIMIT 1
      `,
      [callControlId],
    ) as Array<{ id: string; inbound_owned_phone_number_id: string | null }>;

    const recent = rows[0];
    if (!recent) {
      return {
        ...FALLBACK,
        data_source: "fallback_recent_call_not_found_v0",
      };
    }

    const ownedId = recent.inbound_owned_phone_number_id?.trim() ?? "";
    if (!ownedId) {
      return {
        ...FALLBACK,
        availability_signal: "unknown",
        data_source: "fallback_missing_owned_phone_v0",
      };
    }

    const orgRows = await this.dataSource.query(
      `
        SELECT tenant_id AS organization_id
        FROM owned_phone_numbers
        WHERE id = ?
        LIMIT 1
      `,
      [ownedId],
    ) as Array<{ organization_id: string | null }>;

    const organizationId = orgRows[0]?.organization_id?.trim() ?? "";
    if (!organizationId) {
      return {
        ...FALLBACK,
        data_source: "fallback_missing_org_tenant_v0",
      };
    }

    try {
      const flow = await this.callFlowSettingsService.evaluateActiveCallFlow(new Date());
      const windowStart = new Date();
      const windowEnd = new Date(windowStart.getTime() + 14 * 24 * 60 * 60 * 1000);

      const countRows = await this.dataSource.query(
        `
          SELECT COUNT(*) AS c
          FROM jobs
          WHERE organization_id = ?
            AND cancelled_at IS NULL
            AND scheduled_for IS NOT NULL
            AND scheduled_for >= ?
            AND scheduled_for < ?
        `,
        [organizationId, windowStart, windowEnd],
      ) as Array<{ c: number | string }>;

      const rawCount = countRows[0]?.c ?? 0;
      const jobCount = typeof rawCount === "number" ? rawCount : Number(rawCount);

      const busyBySchedule = Number.isFinite(jobCount) && jobCount >= 14;
      const afterHours = flow.businessHoursStatus === "after_hours";

      let signal: TelnyxGetAvailabilityResponse["availability_signal"] = "likely_open";
      const hints: string[] = [];

      if (afterHours) {
        signal = "likely_busy";
        hints.push("outside posted business hours");
      }

      if (busyBySchedule) {
        signal = "likely_busy";
        hints.push("high scheduled-job density in the next two weeks (heuristic)");
      }

      if (!hints.length) {
        hints.push(flow.businessHoursStatus === "open_hours" ? "weekday business-hours context" : "published schedule");
      }

      return {
        availability_signal: signal,
        coarse_hints: hints,
        disclaimer:
          "Non-binding estimate only. Capacity changes and exceptions apply—our team confirms any appointment.",
        data_source: "jobs_scheduled_histogram_v0",
        bookable_slots: [],
      };
    } catch {
      return {
        ...FALLBACK,
        data_source: "fallback_heuristic_error_v0",
      };
    }
  }

  private toBoolean(value: string | undefined | null): boolean {
    if (!value?.trim()) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "on"].includes(normalized);
  }
}
