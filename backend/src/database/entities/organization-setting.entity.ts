import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "organization_settings" })
export class OrganizationSettingEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  settings_key!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  business_name!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  display_initials!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  company_description!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  address!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  city!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  zip!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  website!: string | null;

  @Column({ type: "varchar", length: 320, nullable: true })
  company_email!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  phone!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  timezone!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  google_review_url!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  default_sms_number!: string | null;

  @Column({ type: "text", nullable: true })
  business_hours!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  invoice_email_subject!: string | null;

  @Column({ type: "text", nullable: true })
  invoice_email_body!: string | null;

  @Column({ type: "varchar", length: 480, nullable: true })
  invoice_sms_body!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  invoice_pdf_footer!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  logo_url!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  accent_color!: string | null;

  @Column({ type: "text", nullable: true })
  payment_instructions!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  business_license!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  gst_number!: string | null;

  @Column({ type: "text", nullable: true })
  warranty_message!: string | null;

  @Column({ type: "int", nullable: true })
  default_due_days!: number | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
