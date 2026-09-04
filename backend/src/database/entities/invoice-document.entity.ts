import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { CustomerEntity } from "./customer.entity";
import { InvoiceEntity } from "./invoice.entity";
import { OrganizationEntity } from "./organization.entity";

export const invoiceDocumentKinds = ["workiz_source_pdf"] as const;
export type InvoiceDocumentKind = (typeof invoiceDocumentKinds)[number];

@Index("IDX_invoice_documents_org_invoice_kind", ["organization_id", "invoice_id", "document_kind"], { unique: true })
@Index("IDX_invoice_documents_org_invoice_hash", ["organization_id", "invoice_id", "file_hash"], { unique: true })
@Index("IDX_invoice_documents_org_customer", ["organization_id", "customer_id"])
@Entity({ name: "invoice_documents" })
export class InvoiceDocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36 })
  customer_id!: string;

  @Column({ type: "varchar", length: 36 })
  invoice_id!: string;

  @Column({ type: "varchar", length: 64 })
  document_kind!: InvoiceDocumentKind;

  @Column({ type: "varchar", length: 512 })
  storage_key!: string;

  @Column({ type: "varchar", length: 1024 })
  storage_path!: string;

  @Column({ type: "varchar", length: 64 })
  file_hash!: string;

  @Column({ type: "varchar", length: 255 })
  original_filename!: string;

  @Column({ type: "varchar", length: 128, default: "application/pdf" })
  mime_type!: string;

  @Column({ type: "varchar", length: 64, default: "workiz_historical_import" })
  import_source!: string;

  @Column({ type: "varchar", length: 32, nullable: true })
  workiz_invoice_code!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;

  @ManyToOne(() => CustomerEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id", referencedColumnName: "id" })
  customer?: CustomerEntity;

  @ManyToOne(() => InvoiceEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id", referencedColumnName: "id" })
  invoice?: InvoiceEntity;
}
