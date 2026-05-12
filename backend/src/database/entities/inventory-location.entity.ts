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
  inventoryLocationTypes,
  type InventoryLocationType,
} from "../../inventory/constants";
import { OrganizationEntity } from "./organization.entity";

@Index("ux_inventory_locations_org_name", ["organization_id", "name"], { unique: true })
@Entity({ name: "inventory_locations" })
export class InventoryLocationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({
    type: "enum",
    enum: inventoryLocationTypes,
  })
  location_type!: InventoryLocationType;

  @Column({ type: "varchar", length: 36, nullable: true })
  assigned_user_id!: string | null;

  @Column({ type: "boolean", default: true })
  is_company_owned!: boolean;

  @Column({ type: "varchar", length: 120, nullable: true })
  vehicle_label!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  license_plate!: string | null;

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