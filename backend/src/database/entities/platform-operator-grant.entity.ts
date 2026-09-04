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

import { platformCapabilities, type PlatformCapability } from "../../platform/platform-operator.policy";
import { runtimeTimestampColumnType } from "../database-dialect";
import { UserEntity } from "./user.entity";

@Entity({ name: "platform_operator_grants" })
@Unique("ux_platform_operator_grants_user_capability", ["user_id", "capability"])
@Index("IDX_platform_operator_grants_user_revoked", ["user_id", "revoked_at"])
export class PlatformOperatorGrantEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  user_id!: string;

  @Column({
    type: "enum",
    enum: platformCapabilities,
  })
  capability!: PlatformCapability;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  granted_at!: Date;

  @Column({ type: "varchar", length: 36, nullable: true })
  granted_by_user_id!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  revoked_at!: Date | null;

  @Column({ type: "varchar", length: 1000, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  user?: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "granted_by_user_id", referencedColumnName: "id" })
  granted_by_user?: UserEntity | null;
}
