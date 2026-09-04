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

import {
  pricebookInventoryTrackingModes,
  pricebookItemTypes,
  pricebookUnitOfMeasures,
  type PricebookInventoryTrackingMode,
  type PricebookItemType,
  type PricebookUnitOfMeasure,
} from "../../pricebook/constants";
import { OrganizationEntity } from "./organization.entity";
import { PricebookBundleItemEntity } from "./pricebook-bundle-item.entity";
import { PricebookCategoryEntity } from "./pricebook-category.entity";

@Index("ux_pricebook_items_org_sku", ["organization_id", "internal_sku"], { unique: true })
@Index("ix_pricebook_items_category_id", ["category_id"])
@Entity({ name: "pricebook_items" })
export class PricebookItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 128 })
  internal_sku!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  customer_description!: string | null;

  @Column({ type: "text", nullable: true })
  internal_description!: string | null;

  @Column({
    type: "enum",
    enum: pricebookItemTypes,
  })
  item_type!: PricebookItemType;

  @Column({ type: "varchar", length: 36, nullable: true })
  category_id!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  trade_area!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  service_area!: string | null;

  @Column({ type: "json", default: () => "(JSON_ARRAY())" })
  tags!: string[];

  @Column({
    type: "enum",
    enum: pricebookUnitOfMeasures,
  })
  unit_of_measure!: PricebookUnitOfMeasure;

  @Column({ type: "int", default: 0 })
  base_cost_cents!: number;

  @Column({ type: "int", default: 0 })
  material_cost_cents!: number;

  @Column({ type: "int", default: 0 })
  labor_cost_cents!: number;

  @Column({ type: "int", default: 0 })
  customer_price_cents!: number;

  @Column({ type: "int", nullable: true })
  minimum_price_cents!: number | null;

  @Column({ type: "int", nullable: true })
  estimated_labor_minutes!: number | null;

  @Column({ type: "int", nullable: true })
  warranty_months!: number | null;

  @Column({ type: "boolean", default: false })
  requires_permit!: boolean;

  @Column({
    type: "enum",
    enum: pricebookInventoryTrackingModes,
    default: "none",
  })
  inventory_tracking_mode!: PricebookInventoryTrackingMode;

  @Column({ type: "varchar", length: 255, nullable: true })
  supplier_name!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  supplier_sku!: string | null;

  @Column({ type: "text", nullable: true })
  inventory_notes!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  image_storage_key!: string | null;

  @Column({ type: "boolean", default: false })
  is_popular!: boolean;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "int", default: 0 })
  sort_order!: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_user_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  updated_by_user_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  deleted_by_user_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @Column({ type: "datetime", precision: 6, nullable: true })
  archived_at!: Date | null;

  @OneToMany(() => PricebookBundleItemEntity, (bundleItem) => bundleItem.pricebook_item)
  bundle_items?: PricebookBundleItemEntity[];

  @ManyToOne(() => PricebookCategoryEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "category_id", referencedColumnName: "id" })
  category?: PricebookCategoryEntity | null;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}