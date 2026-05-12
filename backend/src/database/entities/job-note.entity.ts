import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { JobEntity } from "./job.entity";
import { OrganizationEntity } from "./organization.entity";
import { ProfileEntity } from "./profile.entity";

@Entity({ name: "job_notes" })
export class JobNoteEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id!: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36 })
  job_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  author_profile_id!: string | null;

  @Column({ type: "text", nullable: true })
  findings!: string | null;

  @Column({ type: "text", nullable: true })
  recommendations!: string | null;

  @Column({ type: "json", default: () => "(JSON_ARRAY())" })
  photo_urls!: string[];

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => JobEntity, (job) => job.notes, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "job_id", referencedColumnName: "id" })
  job?: JobEntity;

  @ManyToOne(() => ProfileEntity, (profile) => profile.job_notes, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "author_profile_id", referencedColumnName: "id" })
  author_profile?: ProfileEntity | null;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
