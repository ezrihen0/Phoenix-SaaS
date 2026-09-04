import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { PricebookBundleItemEntity } from "./pricebook-bundle-item.entity";
import { PricebookBundleRequirementEntity } from "./pricebook-bundle-requirement.entity";

@Entity({ name: "pricebook_bundles" })
export class PricebookBundleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

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

  @OneToMany(() => PricebookBundleItemEntity, (bundleItem) => bundleItem.bundle)
  items?: PricebookBundleItemEntity[];

  @OneToMany(() => PricebookBundleRequirementEntity, (requirement) => requirement.bundle)
  requirements?: PricebookBundleRequirementEntity[];

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}