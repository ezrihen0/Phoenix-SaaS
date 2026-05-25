import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { invoiceStatuses, type InvoiceStatus } from "../../crm/constants";
import { InvoiceLineItemEntity } from "./invoice-line-item.entity";
import { InvoicePaymentEntity } from "./invoice-payment.entity";
import { JobEntity } from "./job.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "invoices" })
export class InvoiceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, unique: true })
  job_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "int" })
  amount_cents!: number;

  @Column({ type: "int", default: 0 })
  subtotal_cents!: number;

  @Column({ type: "int", default: 0 })
  tax_rate_bps_snapshot!: number;

  @Column({ type: "int", default: 0 })
  tax_cents!: number;

  @Column({ type: "int", default: 0 })
  total_cents!: number;

  @Column({
    type: "enum",
    enum: invoiceStatuses,
    default: "unpaid",
  })
  status!: InvoiceStatus;

  @Column({ type: "datetime", precision: 6, default: () => "CURRENT_TIMESTAMP(6)" })
  issued_at!: Date;

  @Column({ type: "datetime", precision: 6, nullable: true })
  paid_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  approval_requested_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  approved_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  signature_requested_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  signed_at!: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  signed_by_name!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  email_sent_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  sms_sent_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_sent_at!: Date | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  last_sent_via!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToOne(() => JobEntity, (job) => job.invoice, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "job_id", referencedColumnName: "id" })
  job?: JobEntity;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;

  @OneToMany(() => InvoiceLineItemEntity, (lineItem) => lineItem.invoice)
  line_items?: InvoiceLineItemEntity[];

  @OneToMany(() => InvoicePaymentEntity, (payment) => payment.invoice)
  payments?: InvoicePaymentEntity[];
}
