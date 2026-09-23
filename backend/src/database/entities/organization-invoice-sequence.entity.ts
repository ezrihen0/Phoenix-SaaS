import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from "typeorm";

import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "organization_invoice_sequences" })
export class OrganizationInvoiceSequenceEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "bigint", default: 1001 })
  next_value!: string;

  @Column({ type: "varchar", length: 32, default: "" })
  prefix!: string;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;
}
