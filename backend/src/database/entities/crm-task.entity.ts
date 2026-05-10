import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

export const crmTaskStatuses = ["open", "in_progress", "completed", "dismissed"] as const;
export type CrmTaskStatus = (typeof crmTaskStatuses)[number];

export const crmTaskPriorities = ["low", "normal", "high", "urgent"] as const;
export type CrmTaskPriority = (typeof crmTaskPriorities)[number];

export const crmTaskSources = ["manual", "automation"] as const;
export type CrmTaskSource = (typeof crmTaskSources)[number];

@Entity({ name: "crm_tasks" })
export class CrmTaskEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  organization_id!: string;

  @Column({ type: "varchar", length: 180 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({
    type: "enum",
    enum: crmTaskStatuses,
    default: "open",
  })
  status!: CrmTaskStatus;

  @Column({
    type: "enum",
    enum: crmTaskPriorities,
    default: "normal",
  })
  priority!: CrmTaskPriority;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  due_at!: Date | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  assigned_to_user_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  related_entity_type!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  related_entity_id!: string | null;

  @Column({
    type: "enum",
    enum: crmTaskSources,
    default: "manual",
  })
  source!: CrmTaskSource;

  @Column({ type: "varchar", length: 36, nullable: true })
  source_automation_rule_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  source_automation_run_id!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  completed_at!: Date | null;
}
