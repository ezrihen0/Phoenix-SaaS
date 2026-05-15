import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";
import { TxtMessageEntity } from "../../messaging/txt/txt-message.entity";
import { AiRecommendationRunEntity } from "./ai-recommendation-run.entity";
import { OrganizationEntity } from "./organization.entity";
import { ProfileEntity } from "./profile.entity";
import { RecentCallEntity } from "./recent-call.entity";

export type AiOperatorDraftStatusKey = "active" | "dismissed" | "sent";

@Entity({ name: "ai_operator_drafts" })
@Index("IDX_ai_operator_drafts_org_recent_type", ["organization_id", "recent_call_id", "draft_type"])
@Index("IDX_ai_operator_drafts_org_status", ["organization_id", "status"])
export class AiOperatorDraftEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  actor_profile_id!: string;

  @Column({ type: "varchar", length: 36 })
  recent_call_id!: string;

  @Column({ type: "varchar", length: 64 })
  draft_type!: string;

  @Column({ type: "varchar", length: 32, default: "active" })
  status!: AiOperatorDraftStatusKey;

  @Column({ type: "text" })
  generated_body!: string;

  @Column({ type: "text", nullable: true })
  edited_body!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  recommendation_run_id!: string | null;

  @Column({ type: "text" })
  limitations_json!: string;

  @Column({ type: "varchar", length: 64 })
  prompt_version!: string;

  @Column({ type: "varchar", length: 191, nullable: true })
  model_id!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  dismissed_at!: Date | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  outbound_txt_message_id!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => ProfileEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "actor_profile_id", referencedColumnName: "id" })
  actor_profile?: ProfileEntity;

  @ManyToOne(() => RecentCallEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "recent_call_id", referencedColumnName: "id" })
  recent_call?: RecentCallEntity;

  @ManyToOne(() => AiRecommendationRunEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "recommendation_run_id", referencedColumnName: "id" })
  recommendation_run?: AiRecommendationRunEntity | null;

  @ManyToOne(() => TxtMessageEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "outbound_txt_message_id", referencedColumnName: "id" })
  outbound_txt_message?: TxtMessageEntity | null;
}
