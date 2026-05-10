import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export const portalAccessEventTypes = [
  "link_generated",
  "link_sent",
  "link_opened",
  "link_expired",
  "link_used",
  "link_resent",
  "preview_opened",
  "session_created",
] as const;
export type PortalAccessEventType = (typeof portalAccessEventTypes)[number];

@Entity({ name: "portal_access_events" })
export class PortalAccessEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  customer_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  portal_magic_link_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  portal_session_id!: string | null;

  @Column({
    type: "enum",
    enum: portalAccessEventTypes,
  })
  event_type!: PortalAccessEventType;

  @Column({ type: "varchar", length: 36, nullable: true })
  actor_user_id!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  delivery_method!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip_address!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  user_agent!: string | null;

  @Column({ type: "json", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;
}
