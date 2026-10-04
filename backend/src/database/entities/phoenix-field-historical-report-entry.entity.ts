import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { CustomerEntity } from "./customer.entity";
import { InvoiceEntity } from "./invoice.entity";
import { JobEntity } from "./job.entity";
import { OrganizationEntity } from "./organization.entity";
import { PhoenixFieldHistoricalReportBatchEntity } from "./phoenix-field-historical-report-batch.entity";

export const phoenixFieldReportEntryStatuses = [
  "draft",
  "ready",
  "imported",
  "failed",
  "duplicate_blocked",
] as const;

export type PhoenixFieldReportEntryStatus = (typeof phoenixFieldReportEntryStatuses)[number];

@Entity({ name: "phoenix_field_historical_report_entries" })
export class PhoenixFieldHistoricalReportEntryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  batch_id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  client_row_key!: string;

  @Column({ type: "int", default: 0 })
  sort_order!: number;

  @Column({
    type: "enum",
    enum: phoenixFieldReportEntryStatuses,
    default: "draft",
  })
  status!: PhoenixFieldReportEntryStatus;

  @Column({ type: "json" })
  payload_json!: Record<string, unknown>;

  @Column({ type: "json", nullable: true })
  customer_match_json!: Record<string, unknown> | null;

  @Column({ type: "json", nullable: true })
  duplicate_job_json!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  customer_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  job_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  invoice_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  payment_id!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  entry_import_key!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  last_error_code!: string | null;

  @Column({ type: "text", nullable: true })
  last_error_message!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  imported_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => PhoenixFieldHistoricalReportBatchEntity, (batch) => batch.entries, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "batch_id", referencedColumnName: "id" })
  batch?: PhoenixFieldHistoricalReportBatchEntity;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => CustomerEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "customer_id", referencedColumnName: "id" })
  customer?: CustomerEntity | null;

  @ManyToOne(() => JobEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "job_id", referencedColumnName: "id" })
  job?: JobEntity | null;

  @ManyToOne(() => InvoiceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "invoice_id", referencedColumnName: "id" })
  invoice?: InvoiceEntity | null;
}
