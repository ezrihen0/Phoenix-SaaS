import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "organization_enabled_languages" })
@Unique("ux_organization_enabled_languages_org_language", ["organization_id", "language_code"])
export class OrganizationEnabledLanguageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "varchar", length: 16 })
  language_code!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  activated_by_user_id!: string | null;

  @Column({ type: "datetime", precision: 6, nullable: true })
  deactivated_at!: Date | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "activated_by_user_id", referencedColumnName: "id" })
  activated_by_user?: UserEntity | null;
}
