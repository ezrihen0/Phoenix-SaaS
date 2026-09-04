import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager, QueryFailedError, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { InvoicePaymentEntity } from "../database/entities/invoice-payment.entity";
import { InvoiceEntity } from "../database/entities/invoice.entity";
import { JobStatusEventEntity } from "../database/entities/job-status-event.entity";
import { JobEntity } from "../database/entities/job.entity";
import {
  canTransitionJobStatus,
  type InvoiceStatus,
} from "./constants";
import {
  InvoicePaymentLedgerService,
  type InvoiceLedgerSummary,
} from "./invoice-payment-ledger.service";
import type { RecordInvoicePaymentPayload } from "./validation";

export type InvoicePaymentRecordingTestHooks = {
  afterPaymentInsert?: (manager: EntityManager) => void | Promise<void>;
  afterInvoiceSync?: (manager: EntityManager) => void | Promise<void>;
  beforeJobStatusEvent?: (manager: EntityManager) => void | Promise<void>;
};

export type RecordNativeInvoicePaymentInput = {
  organizationId: string;
  invoiceId: string;
  actorUserId: string;
  actorProfileId: string;
  payload: RecordInvoicePaymentPayload;
  testHooks?: InvoicePaymentRecordingTestHooks;
};

export type RecordNativeInvoicePaymentResult = {
  ok: true;
  idempotent: boolean;
  paymentId: string;
  invoiceStatus: InvoiceStatus;
  ledger: InvoiceLedgerSummary;
};

function isDuplicateEntryError(error: unknown) {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as { code?: string; errno?: number };
  return driverError?.errno === 1062 || driverError?.code === "ER_DUP_ENTRY";
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

@Injectable()
export class InvoicePaymentRecordingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly invoicePaymentLedgerService: InvoicePaymentLedgerService,
  ) {}

  async recordNativePayment(
    input: RecordNativeInvoicePaymentInput,
  ): Promise<RecordNativeInvoicePaymentResult> {
    const existingPayment = await this.findPaymentByIdempotencyKey(
      this.dataSource.getRepository(InvoicePaymentEntity),
      input.organizationId,
      input.invoiceId,
      input.payload.idempotencyKey,
    );

    if (existingPayment) {
      return this.buildIdempotentResult(
        input.organizationId,
        input.invoiceId,
        existingPayment.id,
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const invoiceRepo = manager.getRepository(InvoiceEntity);
        const paymentRepo = manager.getRepository(InvoicePaymentEntity);

        const existingInTransaction = await this.findPaymentByIdempotencyKey(
          paymentRepo,
          input.organizationId,
          input.invoiceId,
          input.payload.idempotencyKey,
        );

        if (existingInTransaction) {
          return this.buildIdempotentResultWithinTransaction(
            invoiceRepo,
            input.organizationId,
            input.invoiceId,
            existingInTransaction.id,
          );
        }

        const invoice = await invoiceRepo.findOne({
          where: {
            id: input.invoiceId,
            organization_id: input.organizationId,
          },
          relations: {
            payments: true,
            job: true,
          },
        });

        if (!invoice) {
          apiError(404, "invoice_not_found", "The invoice could not be found.");
        }

        const job = this.relationValue(invoice.job as JobEntity | JobEntity[] | null | undefined);

        if (!job) {
          apiError(404, "invoice_job_not_found", "The related job could not be found.");
        }

        const occurredAt = input.payload.occurredAt
          ? new Date(input.payload.occurredAt)
          : new Date();

        let savedPayment: InvoicePaymentEntity;

        try {
          savedPayment = await paymentRepo.save(
            paymentRepo.create({
              organization_id: input.organizationId,
              invoice_id: invoice.id,
              entry_type: input.payload.entryType,
              amount_cents: input.payload.amountCents,
              method: input.payload.method,
              reference: input.payload.reference,
              note: input.payload.note,
              idempotency_key: input.payload.idempotencyKey,
              occurred_at: occurredAt,
              created_by_auth_user_id: input.actorUserId,
            }),
          );
        } catch (error) {
          if (isDuplicateEntryError(error)) {
            const racedPayment = await this.findPaymentByIdempotencyKey(
              paymentRepo,
              input.organizationId,
              input.invoiceId,
              input.payload.idempotencyKey,
            );

            if (!racedPayment) {
              throw error;
            }

            return this.buildIdempotentResultWithinTransaction(
              invoiceRepo,
              input.organizationId,
              input.invoiceId,
              racedPayment.id,
            );
          }

          throw error;
        }

        await input.testHooks?.afterPaymentInsert?.(manager);

        invoice.payments = [...(invoice.payments ?? []), savedPayment];

        await this.syncInvoiceJobPaymentState({
          manager,
          invoice,
          job,
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorProfileId: input.actorProfileId,
          testHooks: input.testHooks,
        });

        const ledger = this.summarizeInvoiceLedger(invoice);

        return {
          ok: true as const,
          idempotent: false,
          paymentId: savedPayment.id,
          invoiceStatus: invoice.status,
          ledger,
        };
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        const racedPayment = await this.findPaymentByIdempotencyKey(
          this.dataSource.getRepository(InvoicePaymentEntity),
          input.organizationId,
          input.invoiceId,
          input.payload.idempotencyKey,
        );

        if (racedPayment) {
          return this.buildIdempotentResult(
            input.organizationId,
            input.invoiceId,
            racedPayment.id,
          );
        }
      }

      throw error;
    }
  }

  async syncInvoiceJobPaymentStateOutsideTransaction(options: {
    invoice: InvoiceEntity;
    job: JobEntity;
    organizationId: string;
    actorUserId: string;
    actorProfileId: string;
  }) {
    return this.syncInvoiceJobPaymentState({
      manager: this.dataSource.manager,
      ...options,
    });
  }

  async syncInvoiceJobPaymentState(options: {
    manager: EntityManager;
    invoice: InvoiceEntity;
    job: JobEntity;
    organizationId: string;
    actorUserId: string;
    actorProfileId: string;
    testHooks?: InvoicePaymentRecordingTestHooks;
  }) {
    const invoiceRepo = options.manager.getRepository(InvoiceEntity);
    const jobRepo = options.manager.getRepository(JobEntity);
    const jobStatusEventsRepo = options.manager.getRepository(JobStatusEventEntity);
    const legacyState = this.deriveLegacyInvoiceStatusFromLedger(options.invoice);

    if (
      options.invoice.status !== legacyState.status
      || toIsoString(options.invoice.paid_at) !== toIsoString(legacyState.paidAt)
    ) {
      options.invoice.status = legacyState.status;
      options.invoice.paid_at = legacyState.paidAt;
      await invoiceRepo.save(options.invoice);
    }

    await options.testHooks?.afterInvoiceSync?.(options.manager);

    if (
      legacyState.status === "paid"
      && options.job.status !== "paid"
      && canTransitionJobStatus(options.job.status, "paid")
    ) {
      await jobRepo.update(
        {
          id: options.job.id,
          organization_id: options.organizationId,
        },
        {
          status: "paid",
          paid_at: legacyState.paidAt,
          updated_by_auth_user_id: options.actorUserId,
        },
      );

      await options.testHooks?.beforeJobStatusEvent?.(options.manager);

      await jobStatusEventsRepo.save(
        jobStatusEventsRepo.create({
          organization_id: options.organizationId,
          job_id: options.job.id,
          author_profile_id: options.actorProfileId,
          status: "paid",
          note: "Invoice marked paid from payment ledger.",
        }),
      );
    }

    if (legacyState.status === "unpaid" && options.job.status === "paid") {
      await jobRepo.update(
        {
          id: options.job.id,
          organization_id: options.organizationId,
        },
        {
          status: "completed",
          paid_at: null,
          updated_by_auth_user_id: options.actorUserId,
        },
      );

      await options.testHooks?.beforeJobStatusEvent?.(options.manager);

      await jobStatusEventsRepo.save(
        jobStatusEventsRepo.create({
          organization_id: options.organizationId,
          job_id: options.job.id,
          author_profile_id: options.actorProfileId,
          status: "completed",
          note: "Invoice payment ledger no longer indicates paid in full.",
        }),
      );
    }
  }

  private async buildIdempotentResult(
    organizationId: string,
    invoiceId: string,
    paymentId: string,
  ): Promise<RecordNativeInvoicePaymentResult> {
    const invoice = await this.dataSource.getRepository(InvoiceEntity).findOne({
      where: {
        id: invoiceId,
        organization_id: organizationId,
      },
      relations: {
        payments: true,
      },
    });

    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const ledger = this.summarizeInvoiceLedger(invoice);

    return {
      ok: true,
      idempotent: true,
      paymentId,
      invoiceStatus: invoice.status,
      ledger,
    };
  }

  private async buildIdempotentResultWithinTransaction(
    invoiceRepo: Repository<InvoiceEntity>,
    organizationId: string,
    invoiceId: string,
    paymentId: string,
  ): Promise<RecordNativeInvoicePaymentResult> {
    const invoice = await invoiceRepo.findOne({
      where: {
        id: invoiceId,
        organization_id: organizationId,
      },
      relations: {
        payments: true,
      },
    });

    if (!invoice) {
      apiError(404, "invoice_not_found", "The invoice could not be found.");
    }

    const ledger = this.summarizeInvoiceLedger(invoice);

    return {
      ok: true,
      idempotent: true,
      paymentId,
      invoiceStatus: invoice.status,
      ledger,
    };
  }

  private findPaymentByIdempotencyKey(
    paymentRepo: Repository<InvoicePaymentEntity>,
    organizationId: string,
    invoiceId: string,
    idempotencyKey: string,
  ) {
    return paymentRepo.findOne({
      where: {
        organization_id: organizationId,
        invoice_id: invoiceId,
        idempotency_key: idempotencyKey,
      },
    });
  }

  private summarizeInvoiceLedger(invoice: InvoiceEntity) {
    return this.invoicePaymentLedgerService.summarizeInvoice({
      totalCents: invoice.total_cents || invoice.amount_cents,
      legacyStatus: invoice.status,
      legacyPaidAt: invoice.paid_at,
      payments: invoice.payments ?? [],
    });
  }

  private deriveLegacyInvoiceStatusFromLedger(invoice: InvoiceEntity) {
    const ledgerSummary = this.summarizeInvoiceLedger(invoice);

    return {
      status:
        ledgerSummary.lifecycleStatus === "paid" || ledgerSummary.lifecycleStatus === "overpaid"
          ? ("paid" as InvoiceStatus)
          : ("unpaid" as InvoiceStatus),
      paidAt:
        ledgerSummary.lifecycleStatus === "paid" || ledgerSummary.lifecycleStatus === "overpaid"
          ? ledgerSummary.paidAt
          : null,
    };
  }

  private relationValue<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }
}
