import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_opportunities" })
export class MarketingOpportunityEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  organization_id!: string;

  @Column({ type: "varchar", length: 64 })
  opportunity_type!: string;

  @Column({ type: "varchar", length: 32, default: "detected" })
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

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
