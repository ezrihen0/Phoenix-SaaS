import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type TxtMessageDirection = "inbound" | "outbound";

export type TxtMessageStatus = "pending" | "sent" | "delivered" | "failed" | "received";

@Entity({ name: "txt_messages" })
export class TxtMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "char", length: 36 })
  conversation_id!: string;

  @Column({ type: "varchar", length: 16 })
  direction!: TxtMessageDirection;

  @Column({ type: "char", length: 36, nullable: true })
  sent_by_user_id!: string | null;

  @Column({ type: "varchar", length: 32, default: "telnyx" })
  provider!: "telnyx";

  @Column({ type: "varchar", length: 255, nullable: true })
  provider_message_id!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  provider_status!: string | null;

  @Column({ type: "varchar", length: 64 })
  from_number!: string;

  @Column({ type: "varchar", length: 32 })
  from_number_normalized!: string;

  @Column({ type: "varchar", length: 64 })
  to_number!: string;

  @Column({ type: "varchar", length: 32 })
  to_number_normalized!: string;

  @Column({ type: "longtext" })
  body!: string;

  @Column({ type: "varchar", length: 16 })
  status!: TxtMessageStatus;

  @Column({ type: "varchar", length: 128, nullable: true })
  error_code!: string | null;

  @Column({ type: "longtext", nullable: true })
  error_message!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  sent_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  received_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  delivered_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  read_at!: Date | null;

  @Column({ type: "longtext", nullable: true })
  raw_payload!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;
}
