import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "branches" })
@Unique("ux_branches_organization_code", ["organization_id", "code"])
@Index("IDX_branches_organization_active_sort", ["organization_id", "active", "sort_order"])
export class BranchEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 160 })
  name!: string;

  @Column({ type: "varchar", length: 16 })
  code!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  phone!: string | null;

  @Column({ type: "varchar", length: 320, nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  website!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  address_line!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  city!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  province!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  postal_code!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  logo_url!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  tax_label!: string | null;

  @Column({ type: "int", default: 0 })
  default_tax_rate_bps!: number;

  @Column({ type: "varchar", length: 128, nullable: true })
  tax_number!: string | null;

  @Column({ type: "varchar", length: 32, default: "" })
  invoice_prefix!: string;

  @Column({ type: "varchar", length: 32, default: "" })
  estimate_prefix!: string;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @Column({ type: "int", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;
}
