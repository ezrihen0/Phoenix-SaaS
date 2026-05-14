import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { QuoteEntity } from "./quote.entity";

@Index("IDX_quote_line_items_quote_document_line_key", ["quote_id", "document_line_key"], { unique: true })
@Entity({ name: "quote_line_items" })
export class QuoteLineItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 36 })
  quote_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  pricebook_item_id!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  document_line_key!: string | null;

  @Column({ type: "varchar", length: 128 })
  sku_snapshot!: string;

  @Column({ type: "varchar", length: 255 })
  name_snapshot!: string;

  @Column({ type: "text", nullable: true })
  description_snapshot!: string | null;

  @Column({ type: "varchar", length: 64 })
  item_type_snapshot!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  unit_of_measure_snapshot!: string | null;

  @Column({ type: "int", default: 0 })
  unit_price_cents_snapshot!: number;

  @Column({ type: "int", nullable: true })
  base_cost_cents_snapshot!: number | null;

  @Column({ type: "int", nullable: true })
  material_cost_cents_snapshot!: number | null;

  @Column({ type: "int", nullable: true })
  labor_cost_cents_snapshot!: number | null;

  @Column({ type: "int", nullable: true })
  estimated_labor_minutes_snapshot!: number | null;

  @Column({ type: "int", nullable: true })
  warranty_months_snapshot!: number | null;

  @Column({ type: "decimal", precision: 10, scale: 3, default: 1 })
  quantity!: string;

  @Column({ type: "int", default: 0 })
  line_subtotal_cents!: number;

  @Column({ type: "int", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  created_at!: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updated_at!: Date;

  @ManyToOne(() => QuoteEntity, (quote) => quote.line_items, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "quote_id", referencedColumnName: "id" })
  quote?: QuoteEntity;
}