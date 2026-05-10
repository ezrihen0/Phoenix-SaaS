import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { CustomerEntity } from "./customer.entity";

@Entity({ name: "portal_sessions" })
export class PortalSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 128, unique: true })
  session_token_hash!: string;

  @Column({ type: "varchar", length: 36 })
  customer_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  portal_magic_link_id!: string | null;

  @Column({ type: "boolean", default: false })
  is_preview!: boolean;

  @Column({ type: "boolean", default: false })
  is_read_only!: boolean;

  @Column({ type: "datetime", precision: 6 })
  expires_at!: Date;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip_address!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  user_agent!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => CustomerEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "customer_id", referencedColumnName: "id" })
  customer?: CustomerEntity;
}
