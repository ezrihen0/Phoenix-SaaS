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
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "organization_custom_roles" })
@Unique("ux_organization_custom_roles_org_name", ["organization_id", "name"])
export class OrganizationCustomRoleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 128 })
  name!: string;

  @Column({ type: "json" })
  permission_keys!: RoleModePermission[];

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;
}
