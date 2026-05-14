import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";

import { MarketingAutomationRuleEntity } from "./marketing-automation-rule.entity";
import { MarketingContentDraftEntity } from "./marketing-content-draft.entity";
import { MarketingOpportunityEntity } from "./marketing-opportunity.entity";
import { OrganizationEntity } from "./organization.entity";
import type { MarketingAutomationRunOutcomeKey } from "../../marketing/marketing-automation.constants";
import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_automation_runs" })
export class MarketingAutomationRunEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  rule_id!: string;

  @Column({ type: "varchar", length: 191 })
  idempotency_key!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  marketing_opportunity_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  marketing_content_draft_id!: string | null;

  @Column({ type: "varchar", length: 32 })
  outcome!: MarketingAutomationRunOutcomeKey;

  @Column({ type: "varchar", length: 128, nullable: true })
  skip_reason!: string | null;

  @Column({ type: "text", nullable: true })
  error_detail!: string | null;

  @Column({ type: "text" })
  trigger_snapshot_json!: string;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => MarketingAutomationRuleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "rule_id", referencedColumnName: "id" })
  rule?: MarketingAutomationRuleEntity;

  @ManyToOne(() => MarketingOpportunityEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "marketing_opportunity_id", referencedColumnName: "id" })
  marketing_opportunity?: MarketingOpportunityEntity | null;

  @ManyToOne(() => MarketingContentDraftEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "marketing_content_draft_id", referencedColumnName: "id" })
  marketing_content_draft?: MarketingContentDraftEntity | null;
}
