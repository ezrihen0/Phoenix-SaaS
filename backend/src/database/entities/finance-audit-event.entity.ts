import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { ProfileEntity } from "./profile.entity";

export const financeAuditActions = [
  "invoice.upsert",
  "invoice.send_email",
  "invoice.send_sms",
  "invoice.payment_record",
  "invoice.refund",
  "invoice.adjustment",
  "estimate.upsert",
  "estimate.convert_to_invoice",
  "invoice.snapshot_frozen",
] as const;

export type FinanceAuditAction = (typeof financeAuditActions)[number];

@Index("IDX_finance_audit_events_org_created", ["organization_id", "created_at"])
@Entity({ name: "finance_audit_events" })
export class FinanceAuditEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  actor_profile_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  entity_type!: string;

  @Column({ type: "varchar", length: 36 })
  entity_id!: string;

  @Column({ type: "varchar", length: 64 })
  action!: FinanceAuditAction;

  @Column({ type: "text", nullable: true })
  metadata_json!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => ProfileEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "actor_profile_id", referencedColumnName: "id" })
  actor_profile?: ProfileEntity | null;
}
