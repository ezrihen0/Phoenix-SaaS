import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_profiles" })
export class MarketingProfileEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, unique: true })
  organization_id!: string;

  @Column({ type: "text", nullable: true })
  identity_json!: string | null;

  @Column({ type: "text", nullable: true })
  brand_voice_json!: string | null;

  @Column({ type: "text", nullable: true })
  publishing_preferences_json!: string | null;

  @Column({ type: "text", nullable: true })
  safety_preferences_json!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
