import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";
import { runtimeTimestampColumnType } from "../database-dialect";

export type MarketingCampaignKind =
  | "seasonal_campaign"
  | "service_push_campaign"
  | "trust_credibility_campaign"
  | "local_authority_campaign";

export type MarketingCampaignStatus =
  | "draft_planning"
  | "active"
  | "completed"
  | "archived"
  | "cancelled";

@Entity({ name: "marketing_campaigns" })
export class MarketingCampaignEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_user_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  updated_by_user_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  campaign_kind!: MarketingCampaignKind;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text", nullable: true })
  objective_summary!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  primary_service_topic!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  geo_label!: string | null;

  @Column({ type: "varchar", length: 191, nullable: true })
  geo_normalized!: string | null;

  /** JSON array of platform keys: google_business | facebook | instagram */
  @Column({ type: "text", nullable: true })
  channel_intent_json!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  window_starts_at!: Date;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  window_ends_at!: Date;

  @Column({ type: "varchar", length: 32, default: "draft_planning" })
  status!: MarketingCampaignStatus;

  @Column({ type: "text", nullable: true })
  plan_snapshot_json!: string | null;

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

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "updated_by_user_id", referencedColumnName: "id" })
  updated_by_user?: UserEntity | null;
}
