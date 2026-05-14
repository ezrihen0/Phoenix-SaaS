import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

export const customerOutputTranslationStatuses = ["draft", "final"] as const;
export type CustomerOutputTranslationStatus = (typeof customerOutputTranslationStatuses)[number];

@Entity({ name: "customer_output_translation_records" })
@Index("IDX_customer_output_translation_records_org_status", ["organization_id", "status"])
@Index("IDX_customer_output_translation_records_org_created", ["organization_id", "created_at"])
export class CustomerOutputTranslationRecordEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  created_by_user_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  finalized_by_user_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  surface_key!: string;

  @Column({ type: "varchar", length: 16 })
  source_language_code!: string;

  @Column({ type: "varchar", length: 16 })
  target_language_code!: string;

  @Column({ type: "text" })
  source_text!: string;

  @Column({ type: "text" })
  translated_text!: string;

  @Column({ type: "int", default: 0 })
  source_character_count!: number;

  @Column({ type: "int", default: 0 })
  units_consumed!: number;

  @Column({ type: "varchar", length: 32 })
  provider_key!: string;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_model!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  provider_request_id!: string | null;

  @Column({ type: "varchar", length: 16 })
  status!: CustomerOutputTranslationStatus;

  @Column({ type: "datetime", precision: 6, nullable: true })
  finalized_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => UserEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "created_by_user_id", referencedColumnName: "id" })
  created_by_user?: UserEntity;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "finalized_by_user_id", referencedColumnName: "id" })
  finalized_by_user?: UserEntity | null;
}
