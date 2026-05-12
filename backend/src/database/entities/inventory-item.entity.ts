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

import {
  inventoryItemTypes,
  inventoryUnitOfMeasures,
  type InventoryItemType,
  type InventoryUnitOfMeasure,
} from "../../inventory/constants";
import { OrganizationEntity } from "./organization.entity";

@Index("ux_inventory_items_org_sku", ["organization_id", "internal_sku"], { unique: true })
@Entity({ name: "inventory_items" })
export class InventoryItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 128 })
  internal_sku!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({
    type: "enum",
    enum: inventoryItemTypes,
  })
  item_type!: InventoryItemType;

  @Column({
    type: "enum",
    enum: inventoryUnitOfMeasures,
  })
  unit_of_measure!: InventoryUnitOfMeasure;

  @Column({ type: "int", default: 0 })
  default_cost_before_tax_cents!: number;

  @Column({ type: "int", nullable: true })
  default_tax_cents!: number | null;

  @Column({ type: "int", nullable: true })
  default_total_paid_cents!: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  supplier_name!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  supplier_sku!: string | null;

  @Column({ type: "decimal", precision: 10, scale: 3, nullable: true })
  reorder_point!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

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

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}