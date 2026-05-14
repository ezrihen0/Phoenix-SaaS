import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_content_variants" })
export class MarketingContentVariantEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  draft_id!: string;

  @Column({ type: "varchar", length: 32 })
  platform_key!: string;

  @Column({ type: "text" })
  body_json!: string;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  updated_at!: Date;
}
