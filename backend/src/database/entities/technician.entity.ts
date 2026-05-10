import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { JobEntity } from "./job.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "technicians" })
export class TechnicianEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  auth_user_id!: string | null;

  @Column({ type: "varchar", length: 255 })
  display_name!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  phone!: string | null;

  @Column({ type: "json", default: () => "(JSON_ARRAY())" })
  specialties!: string[];

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "datetime", precision: 6, nullable: true })
  last_seen_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @OneToOne(() => UserEntity, (user) => user.technician, {
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "auth_user_id", referencedColumnName: "id" })
  user?: UserEntity | null;

  @OneToMany(() => JobEntity, (job) => job.technician)
  assigned_jobs?: JobEntity[];
}
