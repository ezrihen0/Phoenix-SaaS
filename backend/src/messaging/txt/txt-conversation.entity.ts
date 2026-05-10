import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type TxtConversationLastDirection = "inbound" | "outbound";

@Entity({ name: "txt_conversations" })
export class TxtConversationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "char", length: 7, unique: true })
  public_conversation_code!: string;

  @Column({ type: "char", length: 36, nullable: true })
  customer_id!: string | null;

  @Column({ type: "varchar", length: 64 })
  customer_phone_number!: string;

  @Column({ type: "varchar", length: 32 })
  customer_phone_number_normalized!: string;

  @Column({ type: "char", length: 36 })
  owned_phone_number_id!: string;

  @Column({ type: "varchar", length: 64 })
  owned_phone_number!: string;

  @Column({ type: "varchar", length: 32 })
  owned_phone_number_normalized!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  title!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  display_name!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  last_message_preview!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  last_message_direction!: TxtConversationLastDirection | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_message_at!: Date | null;

  @Column({ type: "int", default: 0 })
  unread_count!: number;

  @Column({ type: "boolean", default: false })
  is_archived!: boolean;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;
}
