import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  customerLifecycleStatuses,
  leadSources,
  serviceTypes,
  type CustomerLifecycleStatus,
  type LeadSource,
  type ServiceType,
} from "../../crm/constants";
import { JobEntity } from "./job.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "customers" })
export class CustomerEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  external_client_number!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 255 })
  full_name!: string;

  @Column({ type: "varchar", length: 320, nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  company_name!: string | null;

  @Column({ type: "varchar", length: 255 })
  service_address_line_1!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  service_address_line_2!: string | null;

  @Column({ type: "varchar", length: 120, default: "" })
  service_city!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  service_state_or_region!: string | null;

  @Column({ type: "varchar", length: 20, default: "" })
  service_postal_code!: string;

  @Column({ type: "varchar", length: 64 })
  phone!: string;

  @Column({ type: "datetime", precision: 6, nullable: true })
  legacy_created_at!: Date | null;

  @Column({
    type: "enum",
    enum: leadSources,
    default: "website",
  })
  source!: LeadSource;

  @Column({
    type: "enum",
    enum: serviceTypes,
    nullable: true,
  })
  preferred_service_type!: ServiceType | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({
    type: "enum",
    enum: customerLifecycleStatuses,
    nullable: true,
  })
  lifecycle_status!: CustomerLifecycleStatus | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToMany(() => JobEntity, (job) => job.customer)
  jobs?: JobEntity[];

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
