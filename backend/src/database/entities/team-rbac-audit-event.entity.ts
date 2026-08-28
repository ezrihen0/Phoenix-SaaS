import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import type { ProfileRole } from "../../crm/constants";
import type { RoleModePermission } from "../../auth/permissions";
import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

export const teamRbacAuditActions = [
  "member_invited",
  "member_created",
  "member_access_updated",
  "member_removed",
  "custom_role_created",
  "custom_role_updated",
  "custom_role_deleted",
  "custom_role_duplicated",
] as const;

export type TeamRbacAuditAction = (typeof teamRbacAuditActions)[number];

@Entity({ name: "team_rbac_audit_events" })
export class TeamRbacAuditEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  actor_user_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  target_user_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  action!: TeamRbacAuditAction;

  @Column({ type: "varchar", length: 32, nullable: true })
  previous_role!: ProfileRole | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  new_role!: ProfileRole | null;

  @Column({ type: "json", nullable: true })
  previous_permissions!: RoleModePermission[] | null;

  @Column({ type: "json", nullable: true })
  new_permissions!: RoleModePermission[] | null;

  @Column({ type: "json", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "actor_user_id", referencedColumnName: "id" })
  actor_user?: UserEntity;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "target_user_id", referencedColumnName: "id" })
  target_user?: UserEntity | null;
}
