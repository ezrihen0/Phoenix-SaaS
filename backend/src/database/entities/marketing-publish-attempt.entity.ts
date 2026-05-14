import {
  Column,
  Entity,
  PrimaryColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_publish_attempts" })
export class MarketingPublishAttemptEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  publish_job_id!: string;

  @Column({ type: "varchar", length: 32 })
  platform_key!: string;

  @Column({ type: "int", default: 1 })
  attempt_no!: number;

  @Column({ type: "varchar", length: 32 })
  status!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  outcome_code!: string | null;

  @Column({ type: "int", nullable: true })
  provider_http_status!: number | null;

  @Column({ type: "text", nullable: true })
  provider_error_json!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  external_post_id!: string | null;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  started_at!: Date;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  finished_at!: Date | null;
}
