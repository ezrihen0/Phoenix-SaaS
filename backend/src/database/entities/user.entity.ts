import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { AuthSessionEntity } from "./auth-session.entity";
import { MembershipEntity } from "./membership.entity";
import { ProfileEntity } from "./profile.entity";
import { TechnicianEntity } from "./technician.entity";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 320, unique: true })
  email!: string;

  @Column({ type: "varchar", length: 255 })
  password_hash!: string;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToOne(() => ProfileEntity, (profile) => profile.user)
  profile?: ProfileEntity | null;

  @OneToOne(() => TechnicianEntity, (technician) => technician.user)
  technician?: TechnicianEntity | null;

  @OneToMany(() => AuthSessionEntity, (session) => session.user)
  sessions?: AuthSessionEntity[];

  @OneToMany(() => MembershipEntity, (membership) => membership.user)
  memberships?: MembershipEntity[];
}
