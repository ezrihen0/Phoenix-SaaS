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

import { InspectionEntity } from "./inspection.entity";
import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "inspection_required_fields" })
@Unique("UQ_inspection_required_fields_inspection_field_key", ["inspection_id", "field_key"])
export class InspectionRequiredFieldEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  organization_id!: string | null;

  @Column({ type: "varchar", length: 36 })
  inspection_id!: string;

  @Column({ type: "varchar", length: 120 })
  field_key!: string;

  @Column({ type: "varchar", length: 255 })
  field_label!: string;

  @Column({ type: "text", nullable: true })
  field_value!: string | null;

  @Column({ type: "boolean", default: true })
  is_mandatory!: boolean;

  @Column({ type: "boolean", default: false })
  is_satisfied!: boolean;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => InspectionEntity, (inspection) => inspection.required_fields, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "inspection_id", referencedColumnName: "id" })
  inspection?: InspectionEntity;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity | null;
}
