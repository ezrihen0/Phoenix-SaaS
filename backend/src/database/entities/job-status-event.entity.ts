import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { jobStatuses, type JobStatus } from "../../crm/constants";
import { JobEntity } from "./job.entity";
import { ProfileEntity } from "./profile.entity";

@Entity({ name: "job_status_events" })
export class JobStatusEventEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id!: number;

  @Column({ type: "varchar", length: 36 })
  job_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  author_profile_id!: string | null;

  @Column({
    type: "enum",
    enum: jobStatuses,
  })
  status!: JobStatus;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @ManyToOne(() => JobEntity, (job) => job.status_events, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "job_id", referencedColumnName: "id" })
  job?: JobEntity;

  @ManyToOne(() => ProfileEntity, (profile) => profile.job_status_events, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "author_profile_id", referencedColumnName: "id" })
  author_profile?: ProfileEntity | null;
}
