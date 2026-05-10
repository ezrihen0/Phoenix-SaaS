import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { CustomerEntity } from "./customer.entity";
import { InspectionItemEntity } from "./inspection-item.entity";
import { InspectionPhotoEntity } from "./inspection-photo.entity";
import { InspectionRequiredFieldEntity } from "./inspection-required-field.entity";
import { JobEntity } from "./job.entity";

export const inspectionStatuses = ["pass", "warning", "fail"] as const;
export type InspectionStatus = (typeof inspectionStatuses)[number];

export const reportAccessModes = ["immediate", "after_approval", "after_payment"] as const;
export type ReportAccessMode = (typeof reportAccessModes)[number];

export const inspectionReportTypes = [
  "wood_burning_fireplace",
  "wood_stove",
  "wett_inspection",
  "gas_fireplace",
] as const;
export type InspectionReportType = (typeof inspectionReportTypes)[number];

export const inspectionWorkflowTypes = ["safety_standard", "compliance_wett", "gas_simplified"] as const;
export type InspectionWorkflowType = (typeof inspectionWorkflowTypes)[number];

@Entity({ name: "inspections" })
@Index("IDX_inspections_report_type_created_at", ["report_type", "created_at"])
@Index("IDX_inspections_customer_created_at", ["customer_id", "created_at"])
@Index("IDX_inspections_site_address_snapshot", ["site_address_snapshot"])
export class InspectionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  customer_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  job_id!: string | null;

  @Column({
    type: "enum",
    enum: inspectionReportTypes,
    default: "wood_burning_fireplace",
  })
  report_type!: InspectionReportType;

  @Column({
    type: "enum",
    enum: inspectionWorkflowTypes,
    default: "safety_standard",
  })
  workflow_type!: InspectionWorkflowType;

  @Column({ type: "varchar", length: 8, default: "AB" })
  province_code!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  site_address_snapshot!: string | null;

  @Column({ type: "varchar", length: 180, nullable: true })
  client_display_name_snapshot!: string | null;

  @Column({
    type: "enum",
    enum: inspectionStatuses,
    default: "warning",
  })
  status!: InspectionStatus;

  @Column({ type: "text", nullable: true })
  summary_notes!: string | null;

  @Column({ type: "text", nullable: true })
  customer_recommendations!: string | null;

  @Column({ type: "int", nullable: true })
  safety_score!: number | null;

  @Column({ type: "int", default: 100 })
  safety_score_max!: number;

  @Column({ type: "varchar", length: 32, nullable: true })
  compliance_status!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  gas_license_number!: string | null;

  @Column({ type: "varchar", length: 180, nullable: true })
  gas_license_holder_name!: string | null;

  @Column({
    type: "enum",
    enum: reportAccessModes,
    default: "immediate",
  })
  report_access_mode!: ReportAccessMode;

  @Column({ type: "varchar", length: 64, nullable: true })
  verification_code!: string | null;

  @Column({ type: "varchar", length: 180, nullable: true })
  technician_name!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  technician_license_number!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  report_generated_at!: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  report_snapshot_key!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  generated_pdf_url!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  generated_pdf_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  sent_to_customer_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  locked_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => CustomerEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "customer_id", referencedColumnName: "id" })
  customer?: CustomerEntity;

  @ManyToOne(() => JobEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "job_id", referencedColumnName: "id" })
  job?: JobEntity | null;

  @OneToMany(() => InspectionPhotoEntity, (photo) => photo.inspection)
  photos?: InspectionPhotoEntity[];

  @OneToMany(() => InspectionItemEntity, (item) => item.inspection)
  items?: InspectionItemEntity[];

  @OneToMany(() => InspectionRequiredFieldEntity, (field) => field.inspection)
  required_fields?: InspectionRequiredFieldEntity[];
}
