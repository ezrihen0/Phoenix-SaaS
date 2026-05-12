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

import { quoteStatuses, type QuoteStatus } from "../../crm/constants";
import { JobEntity } from "./job.entity";
import { OrganizationEntity } from "./organization.entity";
import { QuoteLineItemEntity } from "./quote-line-item.entity";

@Entity({ name: "quotes" })
export class QuoteEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, unique: true })
  job_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "int" })
  price_cents!: number;

  @Column({ type: "int", default: 0 })
  subtotal_cents!: number;

  @Column({ type: "int", default: 0 })
  tax_rate_bps_snapshot!: number;

  @Column({ type: "int", default: 0 })
  tax_cents!: number;

  @Column({ type: "int", default: 0 })
  total_cents!: number;

  @Column({
    type: "enum",
    enum: quoteStatuses,
    default: "draft",
  })
  status!: QuoteStatus;

  @Column({ type: "datetime", precision: 6, nullable: true })
  sent_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  approved_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  approval_requested_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  signature_requested_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  signed_at!: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  signed_by_name!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToOne(() => JobEntity, (job) => job.quote, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "job_id", referencedColumnName: "id" })
  job?: JobEntity;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;

  @OneToMany(() => QuoteLineItemEntity, (lineItem) => lineItem.quote)
  line_items?: QuoteLineItemEntity[];
}
