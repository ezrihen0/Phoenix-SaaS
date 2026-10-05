import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { PortalIdentityEntity } from "./portal-identity.entity";

export const portalEmailOtpPurposes = ["login", "booking_welcome"] as const;
export type PortalEmailOtpPurpose = (typeof portalEmailOtpPurposes)[number];

@Entity({ name: "portal_email_otp_challenges" })
export class PortalEmailOtpChallengeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  portal_identity_id!: string;

  @Column({ type: "varchar", length: 320 })
  email_normalized!: string;

  @Column({ type: "varchar", length: 128 })
  code_hash!: string;

  @Column({ type: "datetime", precision: 6 })
  expires_at!: Date;

  @Column({ type: "varchar", length: 64 })
  send_attempt_bucket!: string;

  @Column({ type: "int", default: 0 })
  verify_attempt_count!: number;

  @Column({ type: "datetime", precision: 6, nullable: true })
  consumed_at!: Date | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  client_ip_hash!: string | null;

  @Column({ type: "enum", enum: portalEmailOtpPurposes, default: "login" })
  purpose!: PortalEmailOtpPurpose;

  @Column({ type: "varchar", length: 512, nullable: true })
  context_redirect_path!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  context_job_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @ManyToOne(() => PortalIdentityEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "portal_identity_id", referencedColumnName: "id" })
  portal_identity?: PortalIdentityEntity;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;
}
