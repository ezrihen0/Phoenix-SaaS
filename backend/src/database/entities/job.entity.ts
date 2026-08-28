import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  jobStatuses,
  jobTypes,
  leadSources,
  serviceTypes,
  type JobStatus,
  type JobType,
  type LeadSource,
  type ServiceType,
} from "../../crm/constants";
import { CustomerEntity } from "./customer.entity";
import { InvoiceEntity } from "./invoice.entity";
import { JobNoteEntity } from "./job-note.entity";
import { JobStatusEventEntity } from "./job-status-event.entity";
import { LeadEntity } from "./lead.entity";
import { OrganizationEntity } from "./organization.entity";
import { QuoteEntity } from "./quote.entity";
import { ServiceEntity } from "./service.entity";
import { TechnicianEntity } from "./technician.entity";

@Entity({ name: "jobs" })
export class JobEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36 })
  customer_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  service_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  assigned_technician_id!: string | null;

  @Column({ type: "varchar", length: 180 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({
    type: "enum",
    enum: leadSources,
    default: "website",
  })
  lead_source!: LeadSource;

  @Column({
    type: "enum",
    enum: serviceTypes,
  })
  requested_service_type!: ServiceType;

  @Column({
    type: "enum",
    enum: jobTypes,
    default: "inspection",
  })
  job_type!: JobType;

  @Column({
    type: "enum",
    enum: jobStatuses,
    default: "scheduled",
  })
  status!: JobStatus;

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

  @Column({ type: "datetime", precision: 6, nullable: true })
  scheduled_for!: Date | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  scheduled_window!: string | null;

  @Column({ type: "datetime", precision: 6, default: () => "CURRENT_TIMESTAMP(6)" })
  requested_at!: Date;

  @Column({ type: "datetime", precision: 6, nullable: true })
  on_the_way_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  started_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  completed_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  paid_at!: Date | null;

  @Column({ type: "text", nullable: true })
  cancellation_reason!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  cancelled_at!: Date | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  cancelled_by!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  created_by_auth_user_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  updated_by_auth_user_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => CustomerEntity, (customer) => customer.jobs, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "customer_id", referencedColumnName: "id" })
  customer?: CustomerEntity;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;

  @ManyToOne(() => ServiceEntity, (service) => service.jobs, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "service_id", referencedColumnName: "id" })
  service?: ServiceEntity | null;

  @ManyToOne(() => TechnicianEntity, (technician) => technician.assigned_jobs, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "assigned_technician_id", referencedColumnName: "id" })
  technician?: TechnicianEntity | null;

  @OneToMany(() => LeadEntity, (lead) => lead.converted_job)
  converted_leads?: LeadEntity[];

  @OneToOne(() => QuoteEntity, (quote) => quote.job)
  quote?: QuoteEntity | null;

  @OneToOne(() => InvoiceEntity, (invoice) => invoice.job)
  invoice?: InvoiceEntity | null;

  @OneToMany(() => JobNoteEntity, (note) => note.job)
  notes?: JobNoteEntity[];

  @OneToMany(() => JobStatusEventEntity, (event) => event.job)
  status_events?: JobStatusEventEntity[];
}
