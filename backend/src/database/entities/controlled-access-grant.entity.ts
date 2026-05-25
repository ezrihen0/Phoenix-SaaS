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

import { runtimeTimestampColumnType } from "../database-dialect";
import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

export const controlledAccessGrantTypes = ["pilot", "field_partner", "owner_internal"] as const;
export type ControlledAccessGrantType = (typeof controlledAccessGrantTypes)[number];

@Entity({ name: "controlled_access_grants" })
@Index("IDX_controlled_access_grants_org_window", ["organization_id", "starts_at", "expires_at"])
@Index("IDX_controlled_access_grants_org_revoked", ["organization_id", "revoked_at"])
export class ControlledAccessGrantEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({
    type: "enum",
    enum: controlledAccessGrantTypes,
  })
  grant_type!: ControlledAccessGrantType;

  @Column({ type: "varchar", length: 64 })
  reason_code!: string;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  starts_at!: Date;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  expires_at!: Date;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  revoked_at!: Date | null;

  @Column({ type: "varchar", length: 1000, nullable: true })
  notes!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_user_id!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by_user_id", referencedColumnName: "id" })
  created_by_user?: UserEntity | null;
}
