import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import { InspectionPhotoEntity } from "./inspection-photo.entity";
import { InspectionEntity } from "./inspection.entity";

export const inspectionItemStatuses = ["satisfactory", "unsatisfactory", "na"] as const;
export type InspectionItemStatus = (typeof inspectionItemStatuses)[number];

export const inspectionPhotoAssignmentTypes = ["required_photo", "unsatisfactory_evidence"] as const;
export type InspectionPhotoAssignmentType = (typeof inspectionPhotoAssignmentTypes)[number];

@Entity({ name: "inspection_items" })
@Unique("UQ_inspection_items_inspection_item_key", ["inspection_id", "item_key"])
@Index("IDX_inspection_items_section_sort", ["inspection_id", "section_key", "sort_order"])
export class InspectionItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  inspection_id!: string;

  @Column({ type: "varchar", length: 80 })
  section_key!: string;

  @Column({ type: "varchar", length: 120 })
  item_key!: string;

  @Column({ type: "varchar", length: 255 })
  item_label!: string;

  @Column({
    type: "enum",
    enum: inspectionPhotoAssignmentTypes,
    nullable: true,
  })
  assignment_type!: InspectionPhotoAssignmentType | null;

  @Column({
    type: "enum",
    enum: inspectionItemStatuses,
    default: "na",
  })
  status!: InspectionItemStatus;

  @Column({ type: "boolean", default: false })
  is_required!: boolean;

  @Column({ type: "boolean", default: false })
  is_legal_mandatory!: boolean;

  @Column({ type: "text", nullable: true })
  recommendation_text!: string | null;

  @Column({ type: "int", default: 0 })
  sort_order!: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  updated_by_user_id!: string | null;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => InspectionEntity, (inspection) => inspection.items, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "inspection_id", referencedColumnName: "id" })
  inspection?: InspectionEntity;

  @OneToMany(() => InspectionPhotoEntity, (photo) => photo.assignment_item)
  assigned_photos?: InspectionPhotoEntity[];
}
