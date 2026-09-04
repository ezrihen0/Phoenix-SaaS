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

import { OrganizationEntity } from "./organization.entity";
import { PricebookSystemEntity } from "./pricebook-system.entity";

@Index("ux_pricebook_categories_org_system_name", ["organization_id", "system_id", "name"], { unique: true })
@Index("ix_pricebook_categories_system_id", ["system_id"])
@Entity({ name: "pricebook_categories" })
export class PricebookCategoryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  system_id!: string | null;

  @Column({ type: "varchar", length: 120 })
  name!: string;

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

  @ManyToOne(() => PricebookSystemEntity, (system) => system.categories, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "system_id", referencedColumnName: "id" })
  system?: PricebookSystemEntity | null;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
