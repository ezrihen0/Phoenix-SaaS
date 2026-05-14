import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { MarketingContentDraftEntity } from "./marketing-content-draft.entity";
import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_opportunities" })
export class MarketingOpportunityEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 64 })
  opportunity_type!: string;

  @Column({ type: "varchar", length: 191 })
  dedupe_key!: string;

  @Column({ type: "int", default: 1 })
  signal_version!: number;

  @Column({ type: "varchar", length: 32, default: "suggested" })
  status!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text", nullable: true })
  summary!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  source!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  source_entity_type!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  source_entity_id!: string | null;

  @Column({ type: "text", nullable: true })
  payload_json!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  occurred_at!: Date | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  converted_draft_id!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  dismissed_at!: Date | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  dismissed_by_user_id!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  archived_at!: Date | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  last_refreshed_at!: Date | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => MarketingContentDraftEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "converted_draft_id", referencedColumnName: "id" })
  converted_draft?: MarketingContentDraftEntity | null;
}
