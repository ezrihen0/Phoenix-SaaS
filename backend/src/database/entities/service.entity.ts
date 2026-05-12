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

import { serviceTypes, type ServiceType } from "../../crm/constants";
import { JobEntity } from "./job.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "services" })
export class ServiceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({
    type: "enum",
    enum: serviceTypes,
  })
  service_type!: ServiceType;

  @Column({ type: "int", default: 0 })
  default_price_cents!: number;

  @Column({ type: "int", default: 60 })
  duration_minutes!: number;

  @Column({ type: "int", default: 0 })
  sort_position!: number;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToMany(() => JobEntity, (job) => job.service)
  jobs?: JobEntity[];

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
