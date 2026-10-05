import { randomUUID } from "crypto";

import { DataSource } from "typeorm";

import { alignScheduledForToBranchLocalWindow } from "../../crm/job-scheduling-normalization";
import { mapServiceTypeToDefaultJobType } from "../../crm/constants";
import { isoDateKeyFromUtcInstant } from "../../integrations/phoenix/phoenix-scheduling-timezone";
import { CustomerEntity } from "../entities/customer.entity";
import { JobEntity } from "../entities/job.entity";
import { inferServiceType } from "../workiz/workiz-invoice-parser";
import {
  hasValidPostalCode,
  loadJobberVisitsCsv,
  normalizeName,
  normalizePhoneDigits,
  type JobberVisitRow,
} from "./jobber-csv-parser";
import {
  buildJobberJobDescription,
  JOBBER_HISTORICAL_IMPORT_SOURCE,
  parseJobberJobProvenance,
  type JobberJobProvenance,
} from "./jobber-job-provenance";
import { normalizeEmail } from "../workiz/workiz-invoice-parser";

export type JobberVisitImportAction = "create" | "skip_existing" | "rejected";

export type JobberVisitImportRecord = {
  visitKey: string;
  action: JobberVisitImportAction;
  customerId: string | null;
  rejectedReason: string | null;
  scheduled: boolean;
  scheduleWindowIssue: string | null;
  source: JobberVisitRow;
  jobId: string | null;
};

export type JobberVisitImportReport = {
  mode: "preview" | "execute";
  sourceDirectory: string;
  sourceRows: number;
  create: number;
  skipExisting: number;
  rejected: number;
  scheduledFuture: number;
  historicalNoSchedule: number;
  scheduleWindowIssues: number;
  stopReason: string | null;
  schemaErrors: string[];
  records: JobberVisitImportRecord[];
  organizationId: string;
};

export type JobberJobIndex = Map<string, { jobId: string; customerId: string; jobRef: string | null }>;

export async function loadExistingJobberJobIndex(
  dataSource: DataSource,
  organizationId: string,
): Promise<JobberJobIndex> {
  const jobs = await dataSource.getRepository(JobEntity).find({
    where: { organization_id: organizationId },
  });
  const index: JobberJobIndex = new Map();
  for (const job of jobs) {
    const provenance = parseJobberJobProvenance(job.description);
    if (!provenance) continue;
    index.set(provenance.visit_key, {
      jobId: job.id,
      customerId: job.customer_id,
      jobRef: provenance.job_ref,
    });
  }
  return index;
}

function matchCustomerForVisit(
  row: JobberVisitRow,
  customers: CustomerEntity[],
): CustomerEntity | null {
  if (row.email) {
    const emailMatch = customers.find((customer) => normalizeEmail(customer.email) === row.email);
    if (emailMatch) return emailMatch;
  }
  if (row.phoneDigits) {
    const phoneMatch = customers.find((customer) => normalizePhoneDigits(customer.phone) === row.phoneDigits);
    if (phoneMatch) return phoneMatch;
  }
  const postal = row.servicePostalCode.trim().toUpperCase();
  if (postal && hasValidPostalCode(postal)) {
    const nameKey = normalizeName(row.clientName);
    const match = customers.find(
      (customer) =>
        normalizeName(customer.full_name) === nameKey
        && customer.service_postal_code.trim().toUpperCase() === postal,
    );
    if (match) return match;
  }
  return null;
}

function shouldScheduleVisit(row: JobberVisitRow, todayIso: string): boolean {
  if (row.completed) return false;
  if (!row.visitIsoDate) return false;
  return row.visitIsoDate >= todayIso;
}

function resolveScheduleFields(row: JobberVisitRow): {
  scheduledFor: Date | null;
  scheduledWindow: string | null;
  scheduleWindowIssue: string | null;
} {
  if (!row.timesRaw?.trim() || !row.visitIsoDate) {
    return { scheduledFor: null, scheduledWindow: null, scheduleWindowIssue: "missing_time_or_date" };
  }

  const aligned = alignScheduledForToBranchLocalWindow({
    scheduledFor: row.visitDate,
    scheduledWindow: row.timesRaw,
    serviceStateOrRegion: row.serviceStateOrRegion ?? "Ontario",
    scheduledServiceDate: row.visitIsoDate,
  });

  if (!aligned.scheduledWindow) {
    return {
      scheduledFor: aligned.scheduledFor,
      scheduledWindow: null,
      scheduleWindowIssue: `non_canonical_window:${row.timesRaw}`,
    };
  }

  return {
    scheduledFor: aligned.scheduledFor,
    scheduledWindow: aligned.scheduledWindow,
    scheduleWindowIssue: null,
  };
}

export async function runJobberVisitImport(input: {
  dataSource: DataSource;
  organizationId: string;
  exportDir: string;
  execute: boolean;
  sourceFilename?: string;
}): Promise<JobberVisitImportReport> {
  const { rows, schemaErrors } = loadJobberVisitsCsv(input.exportDir);
  const todayIso = isoDateKeyFromUtcInstant(new Date(), "ON");
  const importedAt = new Date().toISOString();
  const sourceFilename = input.sourceFilename ?? "visits-schedule.csv";

  const report: JobberVisitImportReport = {
    mode: input.execute ? "execute" : "preview",
    sourceDirectory: input.exportDir,
    sourceRows: rows.length,
    create: 0,
    skipExisting: 0,
    rejected: 0,
    scheduledFuture: 0,
    historicalNoSchedule: 0,
    scheduleWindowIssues: 0,
    stopReason: null,
    schemaErrors,
    records: [],
    organizationId: input.organizationId,
  };

  if (schemaErrors.length > 0) {
    report.stopReason = "Schema errors in Jobber visits CSV";
    return report;
  }

  const customers = await input.dataSource.getRepository(CustomerEntity).find({
    where: { organization_id: input.organizationId },
  });
  const jobIndex = await loadExistingJobberJobIndex(input.dataSource, input.organizationId);
  const jobRepo = input.dataSource.getRepository(JobEntity);

  for (const row of rows) {
    const existing = jobIndex.get(row.visitKey);
    if (existing) {
      report.skipExisting += 1;
      report.records.push({
        visitKey: row.visitKey,
        action: "skip_existing",
        customerId: existing.customerId,
        rejectedReason: null,
        scheduled: false,
        scheduleWindowIssue: null,
        source: row,
        jobId: existing.jobId,
      });
      continue;
    }

    const customer = matchCustomerForVisit(row, customers);
    if (!customer) {
      report.rejected += 1;
      report.records.push({
        visitKey: row.visitKey,
        action: "rejected",
        customerId: null,
        rejectedReason: `No customer match for ${row.clientName}`,
        scheduled: false,
        scheduleWindowIssue: null,
        source: row,
        jobId: null,
      });
      continue;
    }

    const scheduleVisit = shouldScheduleVisit(row, todayIso);
    let scheduledFor: Date | null = null;
    let scheduledWindow: string | null = null;
    let scheduleWindowIssue: string | null = null;

    if (scheduleVisit) {
      const schedule = resolveScheduleFields(row);
      scheduledFor = schedule.scheduledFor;
      scheduledWindow = schedule.scheduledWindow;
      scheduleWindowIssue = schedule.scheduleWindowIssue;
      if (scheduleWindowIssue) report.scheduleWindowIssues += 1;
      report.scheduledFuture += 1;
    } else {
      report.historicalNoSchedule += 1;
    }

    const lineDescription = row.lineItems?.trim() || row.jobDetailsRaw?.trim() || "Jobber visit";
    const serviceType = inferServiceType(lineDescription);
    const provenance: JobberJobProvenance = {
      import_source: JOBBER_HISTORICAL_IMPORT_SOURCE,
      visit_key: row.visitKey,
      job_ref: row.jobRef,
      source_filename: sourceFilename,
      imported_at: importedAt,
    };

    const description = buildJobberJobDescription({
      bodyLines: [
        `Imported from Jobber visit (${row.visitKey}).`,
        row.jobDetailsRaw ? `Job: ${row.jobDetailsRaw}` : "",
        row.lineItems ? `Line items: ${row.lineItems}` : "",
      ],
      provenance,
    });

    report.create += 1;
    report.records.push({
      visitKey: row.visitKey,
      action: "create",
      customerId: customer.id,
      rejectedReason: null,
      scheduled: scheduleVisit && scheduledFor != null,
      scheduleWindowIssue,
      source: row,
      jobId: null,
    });

    if (!input.execute) {
      continue;
    }

    const job = await jobRepo.save(jobRepo.create({
      id: randomUUID(),
      organization_id: input.organizationId,
      customer_id: customer.id,
      service_id: null,
      assigned_technician_id: null,
      title: `Jobber ${row.jobRef ?? "visit"} — ${row.clientName}`,
      description,
      lead_source: customer.source ?? "other",
      requested_service_type: serviceType,
      job_type: mapServiceTypeToDefaultJobType(serviceType),
      status: scheduleVisit && scheduledFor ? "scheduled" : "completed",
      service_address_line_1: row.addressLine1 || customer.service_address_line_1,
      service_address_line_2: customer.service_address_line_2,
      service_city: row.serviceCity || customer.service_city,
      service_state_or_region: row.serviceStateOrRegion ?? customer.service_state_or_region,
      service_postal_code: row.servicePostalCode || customer.service_postal_code,
      scheduled_for: scheduleVisit ? scheduledFor : null,
      scheduled_window: scheduleVisit ? scheduledWindow : null,
      requested_at: row.visitDate ?? new Date(),
      completed_at: scheduleVisit ? null : (row.visitDate ?? new Date()),
      paid_at: null,
      created_by_auth_user_id: null,
      updated_by_auth_user_id: null,
    }));

    jobIndex.set(row.visitKey, { jobId: job.id, customerId: customer.id, jobRef: row.jobRef });
    const record = report.records[report.records.length - 1];
    record.jobId = job.id;
  }

  return report;
}
