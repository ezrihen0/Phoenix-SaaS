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

import { profileRoles, type ProfileRole } from "../../crm/constants";
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
}
