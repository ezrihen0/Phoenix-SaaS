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

import { InvoiceEntity } from "./invoice.entity";
import { InvoiceServiceIntelligenceEntity } from "./invoice-service-intelligence.entity";
import { OrganizationEntity } from "./organization.entity";

export const serviceIntelligenceWarrantyScopes = ["LABOR", "UNSCOPED_PARTS", "EXTENDED", "OTHER"] as const;
export type ServiceIntelligenceWarrantyScope = (typeof serviceIntelligenceWarrantyScopes)[number];

export const serviceIntelligenceWarrantyStatuses = [
  "DOCUMENTED_ACTIVE",
  "DOCUMENTED_EXPIRED",
  "EXPLICIT_NO_WARRANTY",
  "NOT_DOCUMENTED",
  "UNPARSEABLE",
] as const;
export type ServiceIntelligenceWarrantyStatus = (typeof serviceIntelligenceWarrantyStatuses)[number];

@Index("IDX_isi_warranty_org_intelligence", ["organization_id", "service_intelligence_id"])
@Index("IDX_isi_warranty_org_scope", ["organization_id", "scope"])
@Entity({ name: "invoice_service_intelligence_warranty" })
export class InvoiceServiceIntelligenceWarrantyEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  service_intelligence_id!: string;

  @Column({ type: "varchar", length: 36 })
  invoice_id!: string;

  @Column({ type: "varchar", length: 24 })
  scope!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  canonical_component!: string | null;

  @Column({ type: "varchar", length: 32 })
  warranty_status!: string;

  @Column({ type: "int", nullable: true })
  duration_months!: number | null;

  @Column({ type: "date", nullable: true })
  start_date!: string | null;

  @Column({ type: "date", nullable: true })
  expiry_date!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  source_text!: string | null;

  @Column({ type: "varchar", length: 8 })
  confidence!: string;

  @Column({ type: "json", nullable: true })
  evidence_json!: string[] | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => InvoiceServiceIntelligenceEntity, (row) => row.warranties, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "service_intelligence_id", referencedColumnName: "id" })
  service_intelligence?: InvoiceServiceIntelligenceEntity;

  @ManyToOne(() => InvoiceEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id", referencedColumnName: "id" })
  invoice?: InvoiceEntity;
}
