import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

@Entity({ name: "web_push_subscriptions" })
@Index("IDX_web_push_subscriptions_org_user", ["organization_id", "auth_user_id"])
export class WebPushSubscriptionEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 36 })
  auth_user_id!: string;

  @Column({ type: "varchar", length: 768, unique: true })
  endpoint!: string;

  @Column({ type: "varchar", length: 255 })
  p256dh!: string;

  @Column({ type: "varchar", length: 255 })
  auth!: string;

  @Column({ type: "varchar", length: 512, nullable: true })
  user_agent!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_success_at!: Date | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  disabled_at!: Date | null;
}
