import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

import { BranchEntity } from "./branch.entity";
import { MembershipEntity } from "./membership.entity";

@Entity({ name: "membership_branch_access" })
@Unique("ux_membership_branch_access", ["membership_id", "branch_id"])
@Index("IDX_membership_branch_access_branch", ["branch_id"])
export class MembershipBranchAccessEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  membership_id!: string;

  @Column({ type: "varchar", length: 36 })
  branch_id!: string;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @ManyToOne(() => MembershipEntity, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "membership_id", referencedColumnName: "id" })
  membership?: MembershipEntity;

  @ManyToOne(() => BranchEntity, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "branch_id", referencedColumnName: "id" })
  branch?: BranchEntity;
}
