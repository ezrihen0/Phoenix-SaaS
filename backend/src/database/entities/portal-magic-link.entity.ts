import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { CustomerEntity } from "./customer.entity";
import { OrganizationEntity } from "./organization.entity";

export const portalMagicLinkStatuses = ["sent", "opened", "expired", "used"] as const;
export type PortalMagicLinkStatus = (typeof portalMagicLinkStatuses)[number];

export const portalMagicLinkDeliveryMethods = ["email", "sms", "copy"] as const;
export type PortalMagicLinkDeliveryMethod = (typeof portalMagicLinkDeliveryMethods)[number];

@Entity({ name: "portal_magic_links" })
export class PortalMagicLinkEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36 })
  customer_id!: string;

  @Column({ type: "varchar", length: 128, unique: true })
  token_hash!: string;

  @Column({
    type: "enum",
    enum: portalMagicLinkStatuses,
    default: "sent",
  })
  status!: PortalMagicLinkStatus;

  @Column({
    type: "enum",
    enum: portalMagicLinkDeliveryMethods,
    nullable: true,
  })
  delivery_method!: PortalMagicLinkDeliveryMethod | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  sender_user_id!: string | null;

  @Column({ type: "datetime", precision: 6 })
  expires_at!: Date;

  @Column({ type: "datetime", precision: 6, nullable: true })
  sent_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  opened_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  used_at!: Date | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  target_job_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  target_quote_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => CustomerEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "customer_id", referencedColumnName: "id" })
  customer?: CustomerEntity;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
