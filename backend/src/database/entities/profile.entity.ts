import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { profileRoles, type ProfileRole } from "../../crm/constants";
import { JobNoteEntity } from "./job-note.entity";
import { JobStatusEventEntity } from "./job-status-event.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "profiles" })
export class ProfileEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, unique: true })
  auth_user_id!: string;

  @Column({ type: "varchar", length: 255 })
  full_name!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  phone!: string | null;

  @Column({
    type: "enum",
    enum: profileRoles,
  })
  role!: ProfileRole;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToOne(() => UserEntity, (user) => user.profile, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "auth_user_id", referencedColumnName: "id" })
  user?: UserEntity;

  @OneToMany(() => JobNoteEntity, (note) => note.author_profile)
  job_notes?: JobNoteEntity[];

  @OneToMany(() => JobStatusEventEntity, (event) => event.author_profile)
  job_status_events?: JobStatusEventEntity[];
}
