import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

export type MarketingWorkflowState = "draft" | "needs_review" | "approved";

@Entity({ name: "marketing_content_drafts" })
export class MarketingContentDraftEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_user_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  updated_by_user_id!: string | null;

  @Column({ type: "varchar", length: 255, default: "" })
  title!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  intent!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ type: "varchar", length: 32, default: "draft" })
  workflow_state!: MarketingWorkflowState;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  scheduled_at!: Date | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
