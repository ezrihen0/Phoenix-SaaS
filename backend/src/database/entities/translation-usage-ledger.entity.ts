import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

import { CustomerOutputTranslationRecordEntity } from "./customer-output-translation-record.entity";
import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "translation_usage_ledger" })
@Unique("ux_translation_usage_ledger_record", ["translation_record_id"])
@Index("IDX_translation_usage_ledger_org_created", ["organization_id", "created_at"])
export class TranslationUsageLedgerEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  translation_record_id!: string;

  @Column({ type: "varchar", length: 36 })
  created_by_user_id!: string;

  @Column({ type: "varchar", length: 32 })
  usage_kind!: string;

  @Column({ type: "int", default: 0 })
  source_character_count!: number;

  @Column({ type: "int", default: 0 })
  units_consumed!: number;

  @Column({ type: "datetime", precision: 6, nullable: true })
  billing_period_start!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  billing_period_end!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => CustomerOutputTranslationRecordEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "translation_record_id", referencedColumnName: "id" })
  translation_record?: CustomerOutputTranslationRecordEntity;

  @ManyToOne(() => UserEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "created_by_user_id", referencedColumnName: "id" })
  created_by_user?: UserEntity;
}
