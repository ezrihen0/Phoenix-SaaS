import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from "typeorm";

import { BranchEntity } from "./branch.entity";

@Entity({ name: "branch_invoice_sequences" })
export class BranchInvoiceSequenceEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  branch_id!: string;

  @Column({ type: "bigint", default: 1001 })
  next_value!: string;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToOne(() => BranchEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "branch_id", referencedColumnName: "id" })
  branch?: BranchEntity;
}
