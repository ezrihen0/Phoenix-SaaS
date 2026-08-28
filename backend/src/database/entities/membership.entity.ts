import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import type { RoleModePermission } from "../../auth/permissions";
import { profileRoles, type ProfileRole } from "../../crm/constants";
import { OrganizationCustomRoleEntity } from "./organization-custom-role.entity";
import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

export const membershipStatuses = ["active", "invited", "suspended"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

@Entity({ name: "memberships" })
@Unique("ux_memberships_user_organization", ["user_id", "organization_id"])
export class MembershipEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  user_id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({
    type: "enum",
    enum: profileRoles,
  })
  role!: ProfileRole;

  @Column({
    type: "enum",
    enum: membershipStatuses,
    default: "active",
  })
  status!: MembershipStatus;

  @Column({ type: "varchar", length: 36, nullable: true })
  custom_role_id!: string | null;

  @Column({ type: "json", nullable: true })
  custom_permission_keys!: RoleModePermission[] | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => UserEntity, (user) => user.memberships, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  user?: UserEntity;

  @ManyToOne(() => OrganizationEntity, (organization) => organization.memberships, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => OrganizationCustomRoleEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "custom_role_id", referencedColumnName: "id" })
  custom_role?: OrganizationCustomRoleEntity | null;
}
