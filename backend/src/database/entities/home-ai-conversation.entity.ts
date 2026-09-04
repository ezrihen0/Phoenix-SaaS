import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";
import { HomeAiMessageEntity } from "./home-ai-message.entity";

@Entity({ name: "home_ai_conversations" })
@Index("IDX_home_ai_conversations_user_org_last_message", ["user_id", "organization_id", "last_message_at"])
export class HomeAiConversationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  user_id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 80, default: "New conversation" })
  title!: string;

  @Column({ type: "datetime", precision: 6 })
  last_message_at!: Date;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id", referencedColumnName: "id" })
  user?: UserEntity;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @OneToMany(() => HomeAiMessageEntity, (message) => message.conversation)
  messages?: HomeAiMessageEntity[];
}
