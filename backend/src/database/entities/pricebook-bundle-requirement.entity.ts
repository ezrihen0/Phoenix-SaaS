import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { PricebookBundleEntity } from "./pricebook-bundle.entity";
import { PricebookCategoryEntity } from "./pricebook-category.entity";

@Entity({ name: "pricebook_bundle_requirements" })
export class PricebookBundleRequirementEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36 })
  bundle_id!: string;

  @Column({ type: "varchar", length: 255 })
  label!: string;

  @Column({ type: "varchar", length: 36 })
  category_id!: string;

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

  @ManyToOne(() => PricebookBundleEntity, (bundle) => bundle.requirements, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "bundle_id", referencedColumnName: "id" })
  bundle?: PricebookBundleEntity;

  @ManyToOne(() => PricebookCategoryEntity, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "category_id", referencedColumnName: "id" })
  category?: PricebookCategoryEntity;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
