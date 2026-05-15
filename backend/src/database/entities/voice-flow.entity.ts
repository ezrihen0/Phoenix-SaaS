import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Voice Flow Catalog — approved Telnyx AI Assistant mapping (Phase 1.5B).
 * `flow_id` is the stable product key (e.g. `amber_schedule_availability_intake`).
 */
@Entity({ name: "voice_flows" })
@Index("ux_voice_flows_flow_id", ["flow_id"], { unique: true })
export class VoiceFlowEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  flow_id!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  telnyx_assistant_id!: string | null;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;
}
