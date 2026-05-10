import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "recent_calls", synchronize: false })
export class RecentCallEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  provider!: string;

  @Column({ type: "varchar", length: 255 })
  provider_event_id!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  provider_call_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  provider_connection_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  from_number!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  from_number_normalized!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  to_number!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  to_number_normalized!: string | null;

  @Column({ type: "varchar", length: 64, default: "unknown" })
  source!: string;

  @Column({ type: "varchar", length: 128, nullable: true })
  source_mapping_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  campaign_name!: string | null;

  @Column({ type: "char", length: 36, nullable: true })
  inbound_owned_phone_number_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  inbound_owned_phone_number_label!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  inbound_market_key!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  inbound_market_label!: string | null;

  @Column({ type: "varchar", length: 64 })
  call_status!: string;

  @Column({ type: "varchar", length: 64 })
  processing_status!: string;

  @Column({ type: "varchar", length: 32, nullable: true })
  business_hours_status!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  call_flow_action!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  call_flow_route_target!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ivr_status!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  route_execution_status!: string | null;

  @Column({ type: "longtext", nullable: true })
  route_execution_detail!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  route_command_id!: string | null;

  @Column({ type: "longtext", nullable: true })
  whisper_text!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  whisper_status!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  whisper_command_id!: string | null;

  @Column({ type: "longtext", nullable: true })
  voicemail_url!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  voicemail_status!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  provider_voicemail_recording_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  queue_status!: string | null;

  @Column({ type: "int", nullable: true })
  queue_position!: number | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  queue_entered_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  queue_exited_at!: Date | null;

  @Column({ type: "int", nullable: true })
  queue_wait_seconds!: number | null;

  @Column({ type: "boolean", default: false })
  queue_callback_requested!: boolean;

  @Column({ type: "longtext", nullable: true })
  voicemail_transcription!: string | null;

  @Column({ type: "longtext", nullable: true })
  ai_summary!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ai_sentiment!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ai_status!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ai_provider!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  ai_model!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  ai_enriched_at!: Date | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  selected_service_type!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  selected_ivr_digit!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  matched_client_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  matched_lead_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  matched_client_display_name!: string | null;

  @Column({ type: "longtext", nullable: true })
  recording_url!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  provider_recording_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  recording_status!: string | null;

  @Column({ type: "int", nullable: true })
  duration_seconds!: number | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  call_started_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  call_answered_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  call_ended_at!: Date | null;

  @Column({ type: "longtext" })
  raw_payload_snapshot!: string;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;
}