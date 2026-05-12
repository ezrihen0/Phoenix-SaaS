import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";

import { apiError } from "../../common/api-response";
import { assertTablesExist } from "../../database/schema-readiness";

type TxtTemplateRecord = {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
  quickPickOrder: number | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type TxtTemplatesResponse = {
  items: TxtTemplateRecord[];
};

@Injectable()
export class TxtTemplatesService {
  private static readonly MAX_QUICK_PICKS = 4;
  private schemaEnsured = false;

  constructor(private readonly dataSource: DataSource) {}

  async listActiveTemplates(): Promise<TxtTemplatesResponse> {
    await this.ensureSchema();

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          name,
          body,
          sort_order,
          quick_pick_order,
          created_by_user_id,
          created_at,
          updated_at
        FROM sms_templates
        WHERE is_active = 1
        ORDER BY
          CASE WHEN quick_pick_order IS NULL THEN 1 ELSE 0 END ASC,
          quick_pick_order ASC,
          sort_order ASC,
          created_at ASC
      `,
    ) as Array<Record<string, unknown>>;

    return {
      items: rows.map((row) => this.toTemplate(row)),
    };
  }

  async createTemplate(input: { name: string; body: string; createdByUserId?: string | null }): Promise<TxtTemplateRecord> {
    await this.ensureSchema();

    const name = input.name.trim();
    const body = input.body.trim();

    if (!name) {
      apiError(400, "messaging_txt_template_name_required", "Template name is required.");
    }

    if (!body) {
      apiError(400, "messaging_txt_template_body_required", "Template body is required.");
    }

    if (name.length > 160) {
      apiError(400, "messaging_txt_template_name_too_long", "Template name must be 160 characters or fewer.");
    }

    const rows = await this.dataSource.query(
      `
        SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
        FROM sms_templates
      `,
    ) as Array<Record<string, unknown>>;
    const nextSortOrder = Number(rows[0]?.max_sort_order ?? 0) + 1;
    const id = randomUUID();

    await this.dataSource.query(
      `
        INSERT INTO sms_templates (
          id,
          name,
          body,
          is_active,
          sort_order,
          quick_pick_order,
          created_by_user_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, 1, ?, NULL, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
      `,
      [id, name, body, nextSortOrder, this.asTrimmedString(input.createdByUserId)],
    );

    return this.getTemplateById(id);
  }

  async setQuickPick(templateIdRaw: string, quickPick: boolean): Promise<TxtTemplateRecord> {
    await this.ensureSchema();

    const template = await this.getActiveTemplateRecord(templateIdRaw);

    if (quickPick) {
      if (template.quickPickOrder === null) {
        const currentQuickPicks = await this.listQuickPickRows();

        if (currentQuickPicks.length >= TxtTemplatesService.MAX_QUICK_PICKS) {
          apiError(400, "messaging_txt_template_quick_pick_limit", "Only 4 SMS quick-pick templates can be selected at a time.");
        }

        const nextQuickPickOrder = currentQuickPicks.length + 1;

        await this.dataSource.query(
          `
            UPDATE sms_templates
            SET
              quick_pick_order = ?,
              updated_at = CURRENT_TIMESTAMP(6)
            WHERE id = ?
          `,
          [nextQuickPickOrder, template.id],
        );
      }
    } else if (template.quickPickOrder !== null) {
      await this.dataSource.query(
        `
          UPDATE sms_templates
          SET
            quick_pick_order = NULL,
            updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ?
        `,
        [template.id],
      );
    }

    await this.normalizeQuickPickOrder();
    return this.getTemplateById(template.id);
  }

  async deactivateTemplate(templateIdRaw: string): Promise<{ id: string; deactivated: true }> {
    await this.ensureSchema();

    const template = await this.getActiveTemplateRecord(templateIdRaw);

    await this.dataSource.query(
      `
        UPDATE sms_templates
        SET
          is_active = 0,
          quick_pick_order = NULL,
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ?
      `,
      [template.id],
    );

    await this.normalizeQuickPickOrder();

    return {
      id: template.id,
      deactivated: true,
    };
  }

  private async getTemplateById(id: string): Promise<TxtTemplateRecord> {
    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          name,
          body,
          sort_order,
          quick_pick_order,
          created_by_user_id,
          created_at,
          updated_at
        FROM sms_templates
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      apiError(404, "messaging_txt_template_not_found", "SMS template was not found.");
    }

    return this.toTemplate(rows[0]);
  }

  private toTemplate(row: Record<string, unknown>): TxtTemplateRecord {
    const createdAt = this.asDate(row.created_at) ?? new Date();
    const updatedAt = this.asDate(row.updated_at) ?? createdAt;

    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      body: String(row.body ?? ""),
      sortOrder: Number(row.sort_order ?? 0),
      quickPickOrder: row.quick_pick_order === null || row.quick_pick_order === undefined
        ? null
        : Number(row.quick_pick_order),
      createdByUserId: this.asTrimmedString(row.created_by_user_id),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }

  private async getActiveTemplateRecord(templateIdRaw: string) {
    const templateId = templateIdRaw.trim();

    if (!templateId) {
      apiError(400, "messaging_txt_template_required", "An SMS template id is required.");
    }

    const rows = await this.dataSource.query(
      `
        SELECT
          id,
          name,
          body,
          sort_order,
          quick_pick_order,
          created_by_user_id,
          created_at,
          updated_at
        FROM sms_templates
        WHERE id = ?
          AND is_active = 1
        LIMIT 1
      `,
      [templateId],
    ) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      apiError(404, "messaging_txt_template_not_found", "SMS template was not found.");
    }

    return this.toTemplate(rows[0]);
  }

  private async listQuickPickRows() {
    const rows = await this.dataSource.query(
      `
        SELECT id, quick_pick_order, created_at
        FROM sms_templates
        WHERE is_active = 1
          AND quick_pick_order IS NOT NULL
        ORDER BY quick_pick_order ASC, created_at ASC
      `,
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      quickPickOrder: Number(row.quick_pick_order ?? 0),
      createdAt: this.asDate(row.created_at) ?? new Date(),
    }));
  }

  private async normalizeQuickPickOrder() {
    const rows = await this.listQuickPickRows();

    for (const [index, row] of rows.entries()) {
      const normalizedOrder = index + 1;

      if (row.quickPickOrder === normalizedOrder) {
        continue;
      }

      await this.dataSource.query(
        `
          UPDATE sms_templates
          SET
            quick_pick_order = ?,
            updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ?
        `,
        [normalizedOrder, row.id],
      );
    }
  }

  private asDate(value: unknown) {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value !== "string") {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private asTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : null;
  }

  private async ensureSchema() {
    if (this.schemaEnsured) {
      return;
    }

    await assertTablesExist(this.dataSource, ["sms_templates"]);

    this.schemaEnsured = true;
  }
}