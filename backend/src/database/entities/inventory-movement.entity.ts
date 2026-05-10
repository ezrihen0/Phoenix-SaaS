import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  inventoryMovementTypes,
  type InventoryMovementType,
} from "../../inventory/constants";

@Entity({ name: "inventory_movements" })
export class InventoryMovementEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  inventory_item_id!: string;

  @Column({
    type: "enum",
    enum: inventoryMovementTypes,
  })
  movement_type!: InventoryMovementType;

  @Column({ type: "decimal", precision: 12, scale: 4, default: 0 })
  quantity!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  from_location_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  to_location_id!: string | null;

  @Column({ type: "int", nullable: true })
  unit_cost_before_tax_cents!: number | null;

  @Column({ type: "int", nullable: true })
  tax_paid_cents!: number | null;

  @Column({ type: "int", nullable: true })
  total_paid_cents!: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  supplier_name!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  supplier_invoice_number!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  job_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  invoice_id!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_user_id!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  occurred_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;
}