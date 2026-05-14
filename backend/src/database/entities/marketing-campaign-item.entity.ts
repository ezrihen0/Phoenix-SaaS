import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { MarketingCampaignEntity } from "./marketing-campaign.entity";
import { MarketingContentDraftEntity } from "./marketing-content-draft.entity";
import { OrganizationEntity } from "./organization.entity";
import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_campaign_items" })
export class MarketingCampaignItemEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  campaign_id!: string;

  @Column({ type: "int" })
  sort_order!: number;

  @Column({ type: "varchar", length: 64 })
  slot_key!: string;

  @Column({ type: "varchar", length: 255 })
  label!: string;

  @Column({ type: "text", nullable: true })
  plan_notes!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  suggested_scheduled_at!: Date | null;

  @Column({ type: "text", nullable: true })
  intended_platform_keys_json!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  draft_id!: string | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => MarketingCampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id", referencedColumnName: "id" })
  campaign?: MarketingCampaignEntity;

  @ManyToOne(() => MarketingContentDraftEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "draft_id", referencedColumnName: "id" })
  draft?: MarketingContentDraftEntity | null;
}
