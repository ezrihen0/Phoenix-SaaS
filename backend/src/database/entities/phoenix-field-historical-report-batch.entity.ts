import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { PhoenixFieldHistoricalReportEntryEntity } from "./phoenix-field-historical-report-entry.entity";

export const phoenixFieldReportBatchStatuses = [
  "draft",
  "imported",
  "import_partial",
  "email_pending",
  "email_sent",
  "email_failed",
] as const;

export type PhoenixFieldReportBatchStatus = (typeof phoenixFieldReportBatchStatuses)[number];

@Entity({ name: "phoenix_field_historical_report_batches" })
export class PhoenixFieldHistoricalReportBatchEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  created_by_auth_user_id!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  report_recipient_email!: string | null;

  @Column({
    type: "enum",
    enum: phoenixFieldReportBatchStatuses,
    default: "draft",
  })
  status!: PhoenixFieldReportBatchStatus;

  @Column({ type: "varchar", length: 64, nullable: true })
  submission_idempotency_key!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  submitted_at!: Date | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  submitted_by_auth_user_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  email_message_id!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  email_sent_at!: Date | null;

  /** Email Sender API accepted the message (not inbox delivery). */
  @Column({ type: "datetime", precision: 6, nullable: true })
  email_provider_accepted_at!: Date | null;

  /** Set only after owner confirms the recipient received the report. */
  @Column({ type: "datetime", precision: 6, nullable: true })
  email_delivery_verified_at!: Date | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  email_delivery_verified_by_auth_user_id!: string | null;

  @Column({ type: "text", nullable: true })
  email_last_error!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  pdf_storage_key!: string | null;

  @Column({ type: "json", nullable: true })
  totals_json!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @OneToMany(() => PhoenixFieldHistoricalReportEntryEntity, (entry) => entry.batch)
  entries?: PhoenixFieldHistoricalReportEntryEntity[];
}
