import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { ProfileEntity } from "./profile.entity";
import { runtimeTimestampColumnType } from "../database-dialect";

export type AiRecommendationRunStatusKey = "completed" | "failed" | "refused";

@Entity({ name: "ai_recommendation_runs" })
export class AiRecommendationRunEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  actor_profile_id!: string | null;

  /** Future: Voice pilot uses parallel channel discriminator (schema-only today). */
  @Column({ type: "varchar", length: 32 })
  source_channel!: string;

  @Column({ type: "varchar", length: 64 })
  feature_key!: string;

  @Column({ type: "text" })
  tool_trace_json!: string;

  @Column({ type: "varchar", length: 191, nullable: true })
  model_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  prompt_version!: string;

  @Column({ type: "varchar", length: 32 })
  status!: AiRecommendationRunStatusKey;

  @Column({ type: "varchar", length: 64, nullable: true })
  error_code!: string | null;

  /** AI Actions V1 unified action identifier (nullable for legacy Phase 0–4 rows). */
  @Column({ type: "varchar", length: 64, nullable: true })
  action_key!: string | null;

  /** Provider boundary: `deterministic`, `deepseek`, etc. */
  @Column({ type: "varchar", length: 32, nullable: true })
  provider!: string | null;

  @Column({ type: "int", nullable: true })
  input_tokens!: number | null;

  @Column({ type: "int", nullable: true })
  output_tokens!: number | null;

  @Column({ type: "decimal", precision: 12, scale: 6, nullable: true })
  estimated_cost_usd!: string | null;

  @Column({ type: "int", nullable: true })
  latency_ms!: number | null;

  @Column({ type: "boolean", nullable: true })
  clicked_action!: boolean | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  outcome_key!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => ProfileEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "actor_profile_id", referencedColumnName: "id" })
  actor_profile?: ProfileEntity | null;
}
