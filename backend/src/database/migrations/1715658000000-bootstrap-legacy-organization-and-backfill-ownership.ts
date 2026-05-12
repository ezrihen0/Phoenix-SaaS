import { randomUUID } from "crypto";

import { MigrationInterface, QueryRunner } from "typeorm";

const LEGACY_ORGANIZATION_ID = "9c4d2b7e-6b7c-4d21-9ee3-2f0b5ef4f001";
const LEGACY_ORGANIZATION_NAME = "Phoenix Chimney & Fireplace";
const LEGACY_ORGANIZATION_SLUG = "phoenix";
const PREVIOUS_DEFAULT_ORGANIZATION_SLUG = "phoenix-default";

const OWNERSHIP_TABLES = [
  "customers",
  "leads",
  "jobs",
  "quotes",
  "invoices",
  "invoice_payments",
  "services",
  "technicians",
  "job_notes",
  "job_status_events",
  "inspections",
  "inspection_items",
  "inspection_photos",
  "inspection_required_fields",
  "pricebook_items",
  "pricebook_bundles",
  "pricebook_bundle_items",
  "inventory_items",
  "inventory_locations",
  "inventory_movements",
  "organization_settings",
  "portal_magic_links",
  "portal_sessions",
  "portal_access_events",
] as const;

const ORGANIZATION_REFERENCE_COLUMNS = [
  { tableName: "memberships", columnName: "organization_id" },
  { tableName: "auth_sessions", columnName: "active_organization_id" },
  ...OWNERSHIP_TABLES.map((tableName) => ({ tableName, columnName: "organization_id" as const })),
] as const;

type OrganizationRow = {
  id?: unknown;
};

type UserProfileRow = {
  user_id?: unknown;
  is_active?: unknown;
  role?: unknown;
};

type MembershipRow = {
  user_id?: unknown;
};

export class BootstrapLegacyOrganizationAndBackfillOwnership1715658000000 implements MigrationInterface {
  name = "BootstrapLegacyOrganizationAndBackfillOwnership1715658000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const canonical = await this.findOrganizationBySlug(queryRunner, LEGACY_ORGANIZATION_SLUG);
    const previousDefault = await this.findOrganizationBySlug(queryRunner, PREVIOUS_DEFAULT_ORGANIZATION_SLUG);

    let organizationId = canonical?.id ?? previousDefault?.id ?? LEGACY_ORGANIZATION_ID;

    if (canonical) {
      await this.updateOrganization(queryRunner, canonical.id);
    } else if (previousDefault) {
      await this.updateOrganization(queryRunner, previousDefault.id, PREVIOUS_DEFAULT_ORGANIZATION_SLUG);
    } else {
      await queryRunner.query(`
        INSERT INTO organizations (
          id,
          name,
          slug,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          '${LEGACY_ORGANIZATION_ID}',
          '${LEGACY_ORGANIZATION_NAME}',
          '${LEGACY_ORGANIZATION_SLUG}',
          ${this.trueLiteral(queryRunner)},
          ${this.currentTimestampLiteral(queryRunner)},
          ${this.currentTimestampLiteral(queryRunner)}
        )
      `);
    }

    if (canonical?.id && previousDefault?.id && canonical.id !== previousDefault.id) {
      await this.reassignOrganizationReferences(queryRunner, previousDefault.id, canonical.id);
      await queryRunner.query(`
        DELETE FROM organizations
        WHERE id = '${previousDefault.id}'
      `);
      organizationId = canonical.id;
      await this.updateOrganization(queryRunner, canonical.id);
    } else {
      organizationId = canonical?.id ?? previousDefault?.id ?? LEGACY_ORGANIZATION_ID;
    }

    await this.bootstrapMemberships(queryRunner, organizationId);
    await this.backfillOwnership(queryRunner, organizationId);
    await this.backfillActiveAuthSessions(queryRunner, organizationId);
  }

  public async down(): Promise<void> {
    throw new Error("BootstrapLegacyOrganizationAndBackfillOwnership1715658000000 is intentionally irreversible.");
  }

  private async bootstrapMemberships(queryRunner: QueryRunner, organizationId: string) {
    const userProfiles = await queryRunner.query(`
      SELECT
        u.id AS user_id,
        u.is_active AS is_active,
        p.role AS role
      FROM users u
      INNER JOIN profiles p
        ON p.auth_user_id = u.id
    `) as UserProfileRow[];

    const existingMemberships = await queryRunner.query(`
      SELECT
        user_id
      FROM memberships
      WHERE organization_id = '${organizationId}'
    `) as MembershipRow[];

    const membershipByUserId = new Map(
      existingMemberships
        .map((membership) => {
          const userId = this.asString(membership.user_id);
          return userId ? [userId, membership] as const : null;
        })
        .filter((entry): entry is readonly [string, MembershipRow] => Boolean(entry)),
    );

    for (const row of userProfiles) {
      if (!this.isTruthy(row.is_active)) {
        continue;
      }

      const userId = this.asString(row.user_id);
      const role = this.asString(row.role);

      if (!userId || !role) {
        continue;
      }

      const existing = membershipByUserId.get(userId);

      if (existing) {
        continue;
      }

      await queryRunner.query(`
        INSERT INTO memberships (
          id,
          user_id,
          organization_id,
          role,
          status,
          created_at,
          updated_at
        ) VALUES (
          '${randomUUID()}',
          '${userId}',
          '${organizationId}',
          '${role}',
          'active',
          ${this.currentTimestampLiteral(queryRunner)},
          ${this.currentTimestampLiteral(queryRunner)}
        )
      `);
    }
  }

  private async backfillOwnership(queryRunner: QueryRunner, organizationId: string) {
    for (const tableName of OWNERSHIP_TABLES) {
      await queryRunner.query(`
        UPDATE ${tableName}
        SET organization_id = '${organizationId}'
        WHERE organization_id IS NULL
      `);
    }
  }

  private async backfillActiveAuthSessions(queryRunner: QueryRunner, organizationId: string) {
    await queryRunner.query(`
      UPDATE auth_sessions
      SET active_organization_id = '${organizationId}'
      WHERE active_organization_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM memberships membership
          WHERE membership.user_id = auth_sessions.user_id
            AND membership.organization_id = '${organizationId}'
            AND membership.status = 'active'
        )
    `);
  }

  private async reassignOrganizationReferences(queryRunner: QueryRunner, fromOrganizationId: string, toOrganizationId: string) {
    for (const reference of ORGANIZATION_REFERENCE_COLUMNS) {
      if (reference.tableName === "memberships") {
        await queryRunner.query(`
          DELETE FROM memberships
          WHERE organization_id = '${fromOrganizationId}'
            AND user_id IN (
              SELECT membership.user_id
              FROM memberships membership
              WHERE membership.organization_id = '${toOrganizationId}'
            )
        `);
      }

      await queryRunner.query(`
        UPDATE ${reference.tableName}
        SET ${reference.columnName} = '${toOrganizationId}'
        WHERE ${reference.columnName} = '${fromOrganizationId}'
      `);
    }
  }

  private async updateOrganization(
    queryRunner: QueryRunner,
    organizationId: string,
    currentSlug = LEGACY_ORGANIZATION_SLUG,
  ) {
    await queryRunner.query(`
      UPDATE organizations
      SET
        name = '${LEGACY_ORGANIZATION_NAME}',
        slug = '${LEGACY_ORGANIZATION_SLUG}',
        is_active = ${this.trueLiteral(queryRunner)},
        updated_at = ${this.currentTimestampLiteral(queryRunner)}
      WHERE id = '${organizationId}'
        AND slug = '${currentSlug}'
    `);
  }

  private async findOrganizationBySlug(queryRunner: QueryRunner, slug: string) {
    const rows = await queryRunner.query(`
      SELECT id
      FROM organizations
      WHERE slug = '${slug}'
      LIMIT 1
    `) as OrganizationRow[];

    const id = this.asString(rows[0]?.id);
    return id ? { id } : null;
  }

  private asString(value: unknown) {
    return typeof value === "string" && value.trim() ? value : null;
  }

  private isTruthy(value: unknown) {
    return value === true || value === 1 || value === "1" || value === "true";
  }

  private trueLiteral(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === "postgres" ? "TRUE" : "1";
  }

  private currentTimestampLiteral(queryRunner: QueryRunner) {
    return queryRunner.connection.options.type === "postgres" ? "CURRENT_TIMESTAMP" : "CURRENT_TIMESTAMP(6)";
  }
}
