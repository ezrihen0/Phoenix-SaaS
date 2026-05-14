import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from "typeorm";

import { runtimeTimestampColumnType } from "../database-dialect";

@Entity({ name: "marketing_oauth_states" })
export class MarketingOAuthStateEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 16 })
  provider!: string;

  @Column({ type: "varchar", length: 64 })
  state_token!: string;

  @Column({ type: runtimeTimestampColumnType, precision: 6 })
  expires_at!: Date;

  @Column({ type: runtimeTimestampColumnType, precision: 6, nullable: true })
  consumed_at!: Date | null;

  @CreateDateColumn({ type: runtimeTimestampColumnType, precision: 6 })
  created_at!: Date;
}
