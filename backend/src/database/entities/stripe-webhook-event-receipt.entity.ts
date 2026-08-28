import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type StripeWebhookReceiptStatus =
  | "processing"
  | "processed"
  | "ignored"
  | "failed";

@Entity({ name: "stripe_webhook_event_receipts" })
@Index("ux_stripe_webhook_event_id", ["stripe_event_id"], { unique: true })
@Index("ix_stripe_webhook_subscription_created", ["provider_subscription_id", "stripe_event_created"])
@Index("ix_stripe_webhook_billing_account", ["billing_account_id", "stripe_event_created"])
export class StripeWebhookEventReceiptEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  stripe_event_id!: string;

  @Column({ type: "varchar", length: 128 })
  event_type!: string;

  @Column({ type: "bigint" })
  stripe_event_created!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  billing_account_id!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_customer_id!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_subscription_id!: string | null;

  @Column({ type: "varchar", length: 32 })
  processing_status!: StripeWebhookReceiptStatus;

  @Column({ type: "varchar", length: 512, nullable: true })
  error_summary!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  processed_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;
}
