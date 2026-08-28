import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { HomeAiConversationEntity } from "./home-ai-conversation.entity";

export const homeAiMessageRoles = ["user", "assistant", "system"] as const;
export type HomeAiMessageRole = (typeof homeAiMessageRoles)[number];

@Entity({ name: "home_ai_messages" })
export class HomeAiMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  conversation_id!: string;

  @Column({ type: "varchar", length: 16 })
  role!: HomeAiMessageRole;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  run_id!: string | null;

  @Column({ type: "json", nullable: true })
  record_links!: Array<{ type: string; id: string; label: string }> | null;

  @Column({ type: "json", nullable: true })
  tool_metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @ManyToOne(() => HomeAiConversationEntity, (conversation) => conversation.messages, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "conversation_id", referencedColumnName: "id" })
  conversation?: HomeAiConversationEntity;
}
