import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

export type MarketingPublishJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "canceled";

@Entity({ name: "marketing_publish_jobs" })
export class MarketingPublishJobEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  draft_id!: string;

  @Column({ type: "varchar", length: 32, default: "queued" })
  status!: MarketingPublishJobStatus;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  scheduled_at!: Date;

  @Column({ type: "varchar", length: 128, nullable: true })
  lease_owner!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  leased_until!: Date | null;

  @Column({ type: "varchar", length: 32 })
  publish_intent!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_user_id!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
