import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { InspectionItemEntity, type InspectionPhotoAssignmentType } from "./inspection-item.entity";
import { InspectionEntity } from "./inspection.entity";

export const inspectionPhotoTypes = ["overview", "finding", "before", "after"] as const;
export type InspectionPhotoType = (typeof inspectionPhotoTypes)[number];

@Entity({ name: "inspection_photos" })
export class InspectionPhotoEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  inspection_id!: string;

  @Column({
    type: "enum",
    enum: inspectionPhotoTypes,
    default: "finding",
  })
  photo_type!: InspectionPhotoType;

  @Column({ type: "varchar", length: 255, nullable: true })
  caption!: string | null;

  @Column({ type: "int", default: 0 })
  sort_order!: number;

  @Column({ type: "varchar", length: 255 })
  storage_key!: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  thumbnail_url!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  asset_url!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  assignment_item_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  assignment_label!: string | null;

  @Column({
    type: "enum",
    enum: ["required_photo", "unsatisfactory_evidence"],
    nullable: true,
  })
  assignment_type!: InspectionPhotoAssignmentType | null;

  @Column({ type: "boolean", default: false })
  is_primary_for_item!: boolean;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => InspectionEntity, (inspection) => inspection.photos, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "inspection_id", referencedColumnName: "id" })
  inspection?: InspectionEntity;

  @ManyToOne(() => InspectionItemEntity, (item) => item.assigned_photos, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "assignment_item_id", referencedColumnName: "id" })
  assignment_item?: InspectionItemEntity | null;
}
