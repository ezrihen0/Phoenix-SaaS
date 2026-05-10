import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { PricebookBundleEntity } from "./pricebook-bundle.entity";
import { PricebookItemEntity } from "./pricebook-item.entity";

@Entity({ name: "pricebook_bundle_items" })
export class PricebookBundleItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  bundle_id!: string;

  @Column({ type: "varchar", length: 36 })
  pricebook_item_id!: string;

  @Column({ type: "decimal", precision: 10, scale: 3, default: 1 })
  default_quantity!: string;

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

  @ManyToOne(() => PricebookBundleEntity, (bundle) => bundle.items, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "bundle_id", referencedColumnName: "id" })
  bundle?: PricebookBundleEntity;

  @ManyToOne(() => PricebookItemEntity, (item) => item.bundle_items, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "pricebook_item_id", referencedColumnName: "id" })
  pricebook_item?: PricebookItemEntity;
}