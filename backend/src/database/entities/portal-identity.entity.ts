import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { CustomerEntity } from "./customer.entity";
import { OrganizationEntity } from "./organization.entity";

export const portalIdentityStatuses = ["ready", "email_required", "manual_review"] as const;
export type PortalIdentityStatus = (typeof portalIdentityStatuses)[number];

@Entity({ name: "portal_identities" })
export class PortalIdentityEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36, unique: true })
  customer_id!: string;

  @Column({
    type: "enum",
    enum: portalIdentityStatuses,
    default: "email_required",
  })
  status!: PortalIdentityStatus;

  @Column({ type: "varchar", length: 320, nullable: true })
  primary_email_normalized!: string | null;

  @Column({ type: "datetime", precision: 6 })
  last_evaluated_at!: Date;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToOne(() => CustomerEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id", referencedColumnName: "id" })
  customer?: CustomerEntity;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;
}
