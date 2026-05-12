import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  invoicePaymentEntryTypes,
  invoicePaymentMethods,
  type InvoicePaymentEntryType,
  type InvoicePaymentMethod,
} from "../../crm/constants";
import { InvoiceEntity } from "./invoice.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "invoice_payments" })
export class InvoicePaymentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36 })
  invoice_id!: string;

  @Column({
    type: "enum",
    enum: invoicePaymentEntryTypes,
  })
  entry_type!: InvoicePaymentEntryType;

  @Column({ type: "int", default: 0 })
  amount_cents!: number;

  @Column({
    type: "enum",
    enum: invoicePaymentMethods,
    default: "other",
  })
  method!: InvoicePaymentMethod;

  @Column({ type: "varchar", length: 255, nullable: true })
  reference!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @Column({ type: "datetime", precision: 6 })
  occurred_at!: Date;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_auth_user_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => InvoiceEntity, (invoice) => invoice.payments, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "invoice_id", referencedColumnName: "id" })
  invoice?: InvoiceEntity;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}