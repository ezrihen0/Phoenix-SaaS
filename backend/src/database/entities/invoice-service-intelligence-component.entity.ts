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
import { InventoryItemEntity } from "./inventory-item.entity";
import { OrganizationEntity } from "./organization.entity";

export const serviceIntelligenceWorkActions = [
  "REPLACED",
  "INSTALLED",
  "REPAIRED",
  "SERVICED",
  "CLEANED",
  "UNKNOWN",
] as const;
export type ServiceIntelligenceWorkAction = (typeof serviceIntelligenceWorkActions)[number];

@Index("IDX_isi_component_org_intelligence", ["organization_id", "service_intelligence_id"])
@Index("IDX_isi_component_org_canonical", ["organization_id", "canonical_component"])
@Index("IDX_isi_component_org_inventory", ["organization_id", "inventory_item_id"])
@Entity({ name: "invoice_service_intelligence_component" })
export class InvoiceServiceIntelligenceComponentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  service_intelligence_id!: string;

  @Column({ type: "varchar", length: 36 })
  invoice_id!: string;

  @Column({ type: "varchar", length: 64 })
  canonical_component!: string;

  @Column({ type: "varchar", length: 255 })
  raw_name!: string;

  @Column({ type: "varchar", length: 128, nullable: true })
  manufacturer_name!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  model_or_part_number!: string | null;

  @Column({ type: "varchar", length: 16 })
  work_action!: string;

  @Column({ type: "varchar", length: 8 })
  confidence!: string;

  @Column({ type: "varchar", length: 32 })
  warranty_status!: string;

  @Column({ type: "int", nullable: true })
  warranty_duration_months!: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  warranty_source_text!: string | null;

  @Column({ type: "date", nullable: true })
  warranty_start_date!: string | null;

  @Column({ type: "date", nullable: true })
  warranty_expiry_date!: string | null;

  @Column({ type: "int", nullable: true })
  extended_warranty_months!: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  extended_warranty_source_text!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  extended_warranty_relationship!: string | null;

  @Column({ type: "date", nullable: true })
  extended_effective_expiry!: string | null;

  @Column({ type: "json" })
  evidence_json!: string[];

  @Column({ type: "varchar", length: 36, nullable: true })
  inventory_item_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => InvoiceServiceIntelligenceEntity, (row) => row.components, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "service_intelligence_id", referencedColumnName: "id" })
  service_intelligence?: InvoiceServiceIntelligenceEntity;

  @ManyToOne(() => InvoiceEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id", referencedColumnName: "id" })
  invoice?: InvoiceEntity;

  @ManyToOne(() => InventoryItemEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "inventory_item_id", referencedColumnName: "id" })
  inventory_item?: InventoryItemEntity | null;
}
