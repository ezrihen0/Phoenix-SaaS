import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { CustomerEntity } from "./customer.entity";
import { LeadEntity } from "./lead.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "public_booking_submissions" })
export class PublicBookingSubmissionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 64 })
  idempotency_key!: string;

  @Column({ type: "varchar", length: 36 })
  lead_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  customer_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  client_ip_hash!: string | null;

  @Column({ type: "varchar", length: 10, nullable: true })
  phone_last_10!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @ManyToOne(() => OrganizationEntity, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => LeadEntity, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "lead_id", referencedColumnName: "id" })
  lead?: LeadEntity;

  @ManyToOne(() => CustomerEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "customer_id", referencedColumnName: "id" })
  customer?: CustomerEntity | null;
}
