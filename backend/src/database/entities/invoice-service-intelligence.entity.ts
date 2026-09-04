import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { InvoiceEntity } from "./invoice.entity";
import { InvoiceServiceIntelligenceComponentEntity } from "./invoice-service-intelligence-component.entity";
import { InvoiceServiceIntelligenceWarrantyEntity } from "./invoice-service-intelligence-warranty.entity";
import { OrganizationEntity } from "./organization.entity";

export const serviceIntelligenceTaxonomyVersions = ["V1"] as const;
export type ServiceIntelligenceTaxonomyVersion = (typeof serviceIntelligenceTaxonomyVersions)[number];

export const serviceIntelligenceConfidences = ["HIGH", "MEDIUM", "LOW"] as const;
export type ServiceIntelligenceConfidence = (typeof serviceIntelligenceConfidences)[number];

@Index("UX_invoice_service_intelligence_org_invoice_taxonomy", ["organization_id", "invoice_id", "taxonomy_version"], {
  unique: true,
})
@Index("IDX_invoice_service_intelligence_org_taxonomy_confidence", ["organization_id", "taxonomy_version", "classification_confidence"])
@Entity({ name: "invoice_service_intelligence" })
export class InvoiceServiceIntelligenceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  invoice_id!: string;

  @Column({ type: "varchar", length: 16, default: "V1" })
  taxonomy_version!: string;

  @Column({ type: "varchar", length: 32, nullable: true })
  workiz_invoice_code!: string | null;

  @Column({ type: "json" })
  system_json!: string[];

  @Column({ type: "varchar", length: 16 })
  system_bucket!: string;

  @Column({ type: "json" })
  primary_service_json!: string[];

  @Column({ type: "json" })
  service_detail_json!: string[];

  @Column({ type: "boolean" })
  labor_charged!: boolean;

  @Column({ type: "json" })
  labor_raw_wording_json!: string[];

  @Column({ type: "varchar", length: 8 })
  classification_confidence!: string;

  @Column({ type: "json" })
  review_reasons_json!: string[];

  @Column({ type: "json" })
  findings_json!: Array<{ label: string; evidence: string; confidence: string }>;

  @Column({ type: "varchar", length: 32, default: "classification_v1" })
  source_kind!: string;

  @Column({ type: "datetime", precision: 6 })
  classified_at!: Date;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => InvoiceEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id", referencedColumnName: "id" })
  invoice?: InvoiceEntity;

  @OneToMany(() => InvoiceServiceIntelligenceComponentEntity, (row) => row.service_intelligence)
  components?: InvoiceServiceIntelligenceComponentEntity[];

  @OneToMany(() => InvoiceServiceIntelligenceWarrantyEntity, (row) => row.service_intelligence)
  warranties?: InvoiceServiceIntelligenceWarrantyEntity[];
}
