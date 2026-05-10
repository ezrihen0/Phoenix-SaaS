import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

type CallReportingWindow = {
  from: Date;
  to: Date;
};

type CallReportingBreakdown = {
  key: string;
  label: string;
  totalCalls: number;
  answeredCalls: number;
  convertedLeads: number;
  callbackCompleted: number;
  invoicedRevenueCents: number;
  paidRevenueCents: number;
};

export type CallReportingSummary = {
  window: {
    from: string;
    to: string;
  };
  totals: {
    totalCalls: number;
    answeredCalls: number;
    answerRate: number;
    convertedLeads: number;
    conversionRate: number;
    callbackCompleted: number;
    missedCallRecovery: number;
    invoicedRevenueCents: number;
    paidRevenueCents: number;
  };
  bySource: CallReportingBreakdown[];
  byServiceType: CallReportingBreakdown[];
};

@Injectable()
export class CallReportingService {
  constructor(private readonly dataSource: DataSource) {}

  async getSummary(input: CallReportingWindow): Promise<CallReportingSummary> {
    const [totalsRows, sourceRows, serviceRows] = await Promise.all([
      this.dataSource.query(
        `
          SELECT
            COUNT(*) AS total_calls,
            SUM(CASE WHEN rc.call_answered_at IS NOT NULL OR rc.call_status IN ('answered', 'completed') THEN 1 ELSE 0 END) AS answered_calls,
            SUM(CASE WHEN rc.matched_lead_id IS NOT NULL THEN 1 ELSE 0 END) AS converted_leads,
            SUM(CASE WHEN COALESCE(callback_rollup.callback_completed, 0) = 1 THEN 1 ELSE 0 END) AS callback_completed,
            SUM(CASE
              WHEN rc.call_status IN ('missed', 'voicemail')
                AND (
                  rc.matched_lead_id IS NOT NULL
                  OR rc.matched_client_id IS NOT NULL
                  OR COALESCE(callback_rollup.callback_completed, 0) = 1
                )
              THEN 1
              ELSE 0
            END) AS missed_call_recovery,
            COALESCE(SUM(invoiced_rollup.invoice_amount_cents), 0) AS invoiced_revenue_cents,
            COALESCE(SUM(invoiced_rollup.paid_amount_cents), 0) AS paid_revenue_cents
          FROM recent_calls rc
          LEFT JOIN leads lead ON lead.id = rc.matched_lead_id
          LEFT JOIN jobs job ON job.id = lead.converted_job_id
          LEFT JOIN (
            SELECT
              recent_call_id,
              MAX(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS callback_completed
            FROM callback_tasks
            GROUP BY recent_call_id
          ) callback_rollup ON callback_rollup.recent_call_id = rc.id
          LEFT JOIN (
            SELECT
              job_id,
              MAX(amount_cents) AS invoice_amount_cents,
              MAX(CASE WHEN status = 'paid' OR paid_at IS NOT NULL THEN amount_cents ELSE 0 END) AS paid_amount_cents
            FROM invoices
            GROUP BY job_id
          ) invoiced_rollup ON invoiced_rollup.job_id = job.id
          WHERE COALESCE(rc.call_started_at, rc.created_at) >= ?
            AND COALESCE(rc.call_started_at, rc.created_at) <= ?
        `,
        [input.from, input.to],
      ) as Promise<Array<Record<string, unknown>>>,
      this.queryBreakdown(
        "source_key",
        "source_label",
        `COALESCE(rc.campaign_name, rc.source)`,
        `COALESCE(rc.campaign_name, rc.source)`,
        input,
      ),
      this.queryBreakdown(
        "service_key",
        "service_label",
        `COALESCE(NULLIF(rc.selected_service_type, ''), lead.service_type, job.requested_service_type, 'unknown')`,
        `COALESCE(NULLIF(rc.selected_service_type, ''), lead.service_type, job.requested_service_type, 'Unknown')`,
        input,
      ),
    ]);

    const totalsRow = totalsRows[0] ?? {};
    const totalCalls = this.toSafeInteger(totalsRow.total_calls);
    const answeredCalls = this.toSafeInteger(totalsRow.answered_calls);
    const convertedLeads = this.toSafeInteger(totalsRow.converted_leads);
    const callbackCompleted = this.toSafeInteger(totalsRow.callback_completed);
    const missedCallRecovery = this.toSafeInteger(totalsRow.missed_call_recovery);
    const invoicedRevenueCents = this.toSafeInteger(totalsRow.invoiced_revenue_cents);
    const paidRevenueCents = this.toSafeInteger(totalsRow.paid_revenue_cents);

    return {
      window: {
        from: input.from.toISOString(),
        to: input.to.toISOString(),
      },
      totals: {
        totalCalls,
        answeredCalls,
        answerRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
        convertedLeads,
        conversionRate: totalCalls > 0 ? Math.round((convertedLeads / totalCalls) * 100) : 0,
        callbackCompleted,
        missedCallRecovery,
        invoicedRevenueCents,
        paidRevenueCents,
      },
      bySource: sourceRows,
      byServiceType: serviceRows,
    };
  }

  private async queryBreakdown(
    keyAlias: string,
    labelAlias: string,
    keySql: string,
    labelSql: string,
    input: CallReportingWindow,
  ): Promise<CallReportingBreakdown[]> {
    const rows = await this.dataSource.query(
      `
        SELECT
          ${keySql} AS ${keyAlias},
          ${labelSql} AS ${labelAlias},
          COUNT(*) AS total_calls,
          SUM(CASE WHEN rc.call_answered_at IS NOT NULL OR rc.call_status IN ('answered', 'completed') THEN 1 ELSE 0 END) AS answered_calls,
          SUM(CASE WHEN rc.matched_lead_id IS NOT NULL THEN 1 ELSE 0 END) AS converted_leads,
          SUM(CASE WHEN COALESCE(callback_rollup.callback_completed, 0) = 1 THEN 1 ELSE 0 END) AS callback_completed,
          COALESCE(SUM(invoiced_rollup.invoice_amount_cents), 0) AS invoiced_revenue_cents,
          COALESCE(SUM(invoiced_rollup.paid_amount_cents), 0) AS paid_revenue_cents
        FROM recent_calls rc
        LEFT JOIN leads lead ON lead.id = rc.matched_lead_id
        LEFT JOIN jobs job ON job.id = lead.converted_job_id
        LEFT JOIN (
          SELECT
            recent_call_id,
            MAX(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS callback_completed
          FROM callback_tasks
          GROUP BY recent_call_id
        ) callback_rollup ON callback_rollup.recent_call_id = rc.id
        LEFT JOIN (
          SELECT
            job_id,
            MAX(amount_cents) AS invoice_amount_cents,
            MAX(CASE WHEN status = 'paid' OR paid_at IS NOT NULL THEN amount_cents ELSE 0 END) AS paid_amount_cents
          FROM invoices
          GROUP BY job_id
        ) invoiced_rollup ON invoiced_rollup.job_id = job.id
        WHERE COALESCE(rc.call_started_at, rc.created_at) >= ?
          AND COALESCE(rc.call_started_at, rc.created_at) <= ?
        GROUP BY ${keyAlias}, ${labelAlias}
        ORDER BY total_calls DESC, ${labelAlias} ASC
        LIMIT 12
      `,
      [input.from, input.to],
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      key: this.asTrimmedString(row[keyAlias]) ?? "unknown",
      label: this.asTrimmedString(row[labelAlias]) ?? "Unknown",
      totalCalls: this.toSafeInteger(row.total_calls),
      answeredCalls: this.toSafeInteger(row.answered_calls),
      convertedLeads: this.toSafeInteger(row.converted_leads),
      callbackCompleted: this.toSafeInteger(row.callback_completed),
      invoicedRevenueCents: this.toSafeInteger(row.invoiced_revenue_cents),
      paidRevenueCents: this.toSafeInteger(row.paid_revenue_cents),
    }));
  }

  private asTrimmedString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private toSafeInteger(value: unknown) {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
}
