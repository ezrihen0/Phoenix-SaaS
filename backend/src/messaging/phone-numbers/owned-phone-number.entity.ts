import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type OwnedPhoneNumberPurpose = "txt" | "voice" | "both";

@Entity({ name: "owned_phone_numbers" })
@Index("ix_owned_phone_numbers_active_sms", ["is_active", "sms_enabled"])
@Index("ix_owned_phone_numbers_active_voice", ["is_active", "voice_enabled"])
@Index("ix_owned_phone_numbers_market_key", ["market_key"])
@Index("ix_owned_phone_numbers_provider_id", ["provider", "provider_number_id"])
export class OwnedPhoneNumberEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 32, default: "telnyx" })
  provider!: "telnyx";

  @Column({ type: "varchar", length: 255, nullable: true })
  provider_number_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  phone_number!: string;

  @Column({ type: "varchar", length: 32, unique: true })
  phone_number_normalized!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  label!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  market_key!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  market_label!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  default_source!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  source_mapping_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  campaign_name!: string | null;

  @Column({ type: "varchar", length: 16, default: "both" })
  purpose!: OwnedPhoneNumberPurpose;

  @Column({ type: "boolean", default: true })
  sms_enabled!: boolean;

  @Column({ type: "boolean", default: true })
  voice_enabled!: boolean;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  /** Legacy column name; stores the Phoenix organization id for telephony ownership. */
  @Column({ type: "char", length: 36, nullable: true })
  tenant_id!: string | null;

  @Column({ type: "char", length: 36, nullable: true })
  company_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;
}
