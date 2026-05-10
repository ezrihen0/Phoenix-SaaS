import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "automation_settings" })
export class AutomationSettingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64, unique: true })
  organization_id!: string;

  @Column({ type: "boolean", default: false })
  pause_all!: boolean;

  @Column({ type: "boolean", default: false })
  disable_customer_facing_sends!: boolean;

  @Column({ type: "boolean", default: false })
  disable_review_requests!: boolean;

  @Column({ type: "boolean", default: false })
  disable_payment_reminders!: boolean;

  @Column({ type: "boolean", default: false })
  disable_scheduled_runs!: boolean;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
