import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";

import { OrganizationEntity } from "./organization.entity";

@Entity({ name: "phoenix_field_historical_report_org_locks" })
export class PhoenixFieldHistoricalReportOrgLockEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  organization_id!: string;

  @Column({ type: "datetime", precision: 6 })
  owner_closed_at!: Date;

  @Column({ type: "varchar", length: 36 })
  owner_closed_by_auth_user_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  closing_batch_id!: string | null;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id", referencedColumnName: "id" })
  organization?: OrganizationEntity;
}
