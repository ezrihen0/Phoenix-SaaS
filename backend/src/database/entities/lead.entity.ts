import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  leadSources,
  leadStatuses,
  serviceTypes,
  type LeadSource,
  type LeadStatus,
  type ServiceType,
} from "../../crm/constants";
import { JobEntity } from "./job.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "leads" })
export class LeadEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 255 })
  full_name!: string;

  @Column({ type: "varchar", length: 64 })
  phone!: string;

  @Column({ type: "varchar", length: 320, nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 255 })
  service_address_line_1!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  service_address_line_2!: string | null;

  @Column({ type: "varchar", length: 120 })
  service_city!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  service_state_or_region!: string | null;

  @Column({ type: "varchar", length: 20 })
  service_postal_code!: string;

  @Column({
    type: "enum",
    enum: leadSources,
    default: "website",
  })
  source!: LeadSource;

  @Column({
    type: "enum",
    enum: serviceTypes,
  })
  service_type!: ServiceType;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({
    type: "enum",
    enum: leadStatuses,
    default: "new_lead",
  })
  status!: LeadStatus;

  @Column({ type: "varchar", length: 36, nullable: true })
  converted_job_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_auth_user_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => JobEntity, (job) => job.converted_leads, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "converted_job_id", referencedColumnName: "id" })
  converted_job?: JobEntity | null;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
