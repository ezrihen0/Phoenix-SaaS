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
import { JobEntity } from "./job.entity";
import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

@Index("IDX_warranty_certificates_org_customer_created", ["organization_id", "customer_id", "created_at"])
@Index("IDX_warranty_certificates_org_invoice", ["organization_id", "related_invoice_id"])
@Entity({ name: "warranty_certificates" })
export class WarrantyCertificateEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36 })
  customer_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  related_invoice_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  related_job_id!: string | null;

  @Column({ type: "varchar", length: 64, default: "installation" })
  warranty_type!: string;

  @Column({ type: "datetime", precision: 6 })
  warranty_start_date!: Date;

  @Column({ type: "datetime", precision: 6 })
  warranty_end_date!: Date;

  @Column({ type: "text" })
  coverage_text!: string;

  @Column({ type: "text" })
  exclusions_text!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  issued_by_user_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  snapshot_company_name!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  snapshot_company_logo_url!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  snapshot_company_phone!: string | null;

  @Column({ type: "varchar", length: 320, nullable: true })
  snapshot_company_email!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  snapshot_company_website!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  snapshot_company_address!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  snapshot_company_license!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  snapshot_company_tax_number!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  snapshot_accent_color!: string | null;

  @Column({ type: "longtext" })
  snapshot_payload_json!: string;

  @Column({ type: "longtext", nullable: true })
  generated_html_snapshot!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  generated_pdf_path!: string | null;

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

  @ManyToOne(() => InvoiceEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "related_invoice_id", referencedColumnName: "id" })
  related_invoice?: InvoiceEntity | null;

  @ManyToOne(() => JobEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "related_job_id", referencedColumnName: "id" })
  related_job?: JobEntity | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "issued_by_user_id", referencedColumnName: "id" })
  issued_by_user?: UserEntity | null;
}
