import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_connected_channels" })
export class MarketingConnectedChannelEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  organization_id!: string;

  @Column({ type: "varchar", length: 64 })
  channel_key!: string;

  @Column({ type: "varchar", length: 128, nullable: true })
  channel_label!: string | null;

  @Column({ type: "varchar", length: 32, default: "disconnected" })
  connection_status!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  account_label!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  authorization_health!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  permissions_status!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  last_published_at!: Date | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  last_failure_at!: Date | null;

  @Column({ type: "text", nullable: true })
  metadata_json!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
