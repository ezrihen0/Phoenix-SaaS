import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { apiError } from "../common/api-response";
import { assertTablesExist } from "../database/schema-readiness";

export type CallFlowDayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type CallFlowGreetingMode = "standard_greeting" | "custom_greeting" | "ivr_menu";
export type CallFlowAction = "standard_answer" | "dispatcher_queue" | "after_hours_message" | "voicemail" | "callback_queue";
export type BusinessHoursStatus = "open_hours" | "after_hours";

export type CallFlowBusinessHoursWindow = {
  dayKey: CallFlowDayKey;
  label: string;
  enabled: boolean;
  openTime: string;
  closeTime: string;
};

export type CallFlowIvrOption = {
  id: string;
  digit: string;
  label: string;
  serviceType: string | null;
  routeTarget: string | null;
};

export type CallFlowSettings = {
  id: string;
  configName: string;
  isActive: boolean;
  timeZone: string;
  greetingMode: CallFlowGreetingMode;
  greetingText: string | null;
  openHoursAction: CallFlowAction;
  openHoursRouteTarget: string | null;
  afterHoursAction: CallFlowAction;
  afterHoursRouteTarget: string | null;
  whisperMessage: string | null;
  missedCallSmsTemplateKey: string | null;
  businessHours: CallFlowBusinessHoursWindow[];
  ivrOptions: CallFlowIvrOption[];
  updatedAt: Date | null;
};

export type UpdateCallFlowSettingsInput = {
  configName: string;
  timeZone: string;
  greetingMode: CallFlowGreetingMode;
  greetingText: string | null;
  openHoursAction: CallFlowAction;
  openHoursRouteTarget: string | null;
  afterHoursAction: CallFlowAction;
  afterHoursRouteTarget: string | null;
  whisperMessage: string | null;
  missedCallSmsTemplateKey: string | null;
  businessHours: Array<{
    dayKey: CallFlowDayKey;
    enabled: boolean;
    openTime: string;
    closeTime: string;
  }>;
  ivrOptions: Array<{
    digit: string;
    label: string;
    serviceType: string | null;
    routeTarget: string | null;
  }>;
  updatedByAuthUserId: string | null;
};

export type CallFlowDecisionSummary = {
  evaluatedAt: Date;
  timeZone: string;
  businessHoursStatus: BusinessHoursStatus;
  callFlowAction: CallFlowAction;
  callFlowRouteTarget: string | null;
  greetingMode: CallFlowGreetingMode;
  whisperMessage: string | null;
  missedCallSmsTemplateKey: string | null;
};

type RawConfigRow = {
  id: string;
  config_name: string;
  is_active: number | boolean | string;
  time_zone: string;
  greeting_mode: string;
  greeting_text: string | null;
  open_hours_action: string;
  open_hours_route_target: string | null;
  after_hours_action: string;
  after_hours_route_target: string | null;
  whisper_message: string | null;
  missed_call_sms_template_key: string | null;
  updated_at: Date | string | null;
};

const DAY_KEYS: CallFlowDayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS: Record<CallFlowDayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DEFAULT_BUSINESS_HOURS: CallFlowSettings["businessHours"] = [
  { dayKey: "monday", label: DAY_LABELS.monday, enabled: true, openTime: "08:00", closeTime: "17:00" },
  { dayKey: "tuesday", label: DAY_LABELS.tuesday, enabled: true, openTime: "08:00", closeTime: "17:00" },
  { dayKey: "wednesday", label: DAY_LABELS.wednesday, enabled: true, openTime: "08:00", closeTime: "17:00" },
  { dayKey: "thursday", label: DAY_LABELS.thursday, enabled: true, openTime: "08:00", closeTime: "17:00" },
  { dayKey: "friday", label: DAY_LABELS.friday, enabled: true, openTime: "08:00", closeTime: "17:00" },
  { dayKey: "saturday", label: DAY_LABELS.saturday, enabled: true, openTime: "09:00", closeTime: "13:00" },
  { dayKey: "sunday", label: DAY_LABELS.sunday, enabled: false, openTime: "09:00", closeTime: "13:00" },
];

const DEFAULT_IVR_OPTIONS: CallFlowIvrOption[] = [
  { id: "default-1", digit: "1", label: "Inspection or cleaning", serviceType: "inspection", routeTarget: "office-inspection" },
  { id: "default-2", digit: "2", label: "Repair or service", serviceType: "repair", routeTarget: "office-repair" },
];

@Injectable()
export class CallFlowSettingsService {
  private schemaEnsured = false;

  constructor(private readonly dataSource: DataSource) {}

  async getSettings(): Promise<CallFlowSettings> {
    await this.ensureSchema();
    const config = await this.getActiveConfigRow();
    const businessHours = await this.getBusinessHours(config.id);
    const ivrOptions = await this.getIvrOptions(config.id);

    return {
      id: config.id,
      configName: config.config_name,
      isActive: this.toBoolean(config.is_active),
      timeZone: config.time_zone,
      greetingMode: this.validateGreetingMode(config.greeting_mode),
      greetingText: this.normalizeOptionalText(config.greeting_text),
      openHoursAction: this.validateAction(config.open_hours_action),
      openHoursRouteTarget: this.normalizeOptionalText(config.open_hours_route_target),
      afterHoursAction: this.validateAction(config.after_hours_action),
      afterHoursRouteTarget: this.normalizeOptionalText(config.after_hours_route_target),
      whisperMessage: this.normalizeOptionalText(config.whisper_message),
      missedCallSmsTemplateKey: this.normalizeOptionalText(config.missed_call_sms_template_key),
      businessHours,
      ivrOptions,
      updatedAt: this.asDate(config.updated_at),
    };
  }

  async updateSettings(input: UpdateCallFlowSettingsInput): Promise<CallFlowSettings> {
    await this.ensureSchema();

    const config = await this.getActiveConfigRow();
    const configName = this.requireText(input.configName, "call_flow_config_name_invalid", "Configuration name is required.", 100);
    const timeZone = this.validateTimeZone(input.timeZone);
    const greetingMode = this.validateGreetingMode(input.greetingMode);
    const greetingText = this.normalizeOptionalText(input.greetingText);
    const openHoursAction = this.validateAction(input.openHoursAction);
    const openHoursRouteTarget = this.normalizeOptionalText(input.openHoursRouteTarget);
    const afterHoursAction = this.validateAction(input.afterHoursAction);
    const afterHoursRouteTarget = this.normalizeOptionalText(input.afterHoursRouteTarget);
    const whisperMessage = this.normalizeOptionalText(input.whisperMessage);
    const missedCallSmsTemplateKey = this.normalizeOptionalText(input.missedCallSmsTemplateKey);
    const businessHours = this.normalizeBusinessHours(input.businessHours);
    const ivrOptions = this.normalizeIvrOptions(input.ivrOptions);

    await this.dataSource.query(
      `
        UPDATE call_flow_configs
        SET
          config_name = ?,
          time_zone = ?,
          greeting_mode = ?,
          greeting_text = ?,
          open_hours_action = ?,
          open_hours_route_target = ?,
          after_hours_action = ?,
          after_hours_route_target = ?,
          whisper_message = ?,
          missed_call_sms_template_key = ?,
          updated_by_auth_user_id = ?,
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ?
      `,
      [
        configName,
        timeZone,
        greetingMode,
        greetingText,
        openHoursAction,
        openHoursRouteTarget,
        afterHoursAction,
        afterHoursRouteTarget,
        whisperMessage,
        missedCallSmsTemplateKey,
        input.updatedByAuthUserId,
        config.id,
      ],
    );

    await this.dataSource.query(`DELETE FROM call_flow_business_hours WHERE call_flow_config_id = ?`, [config.id]);
    for (const [index, item] of businessHours.entries()) {
      await this.dataSource.query(
        `
          INSERT INTO call_flow_business_hours (
            id,
            call_flow_config_id,
            day_key,
            is_enabled,
            open_time,
            close_time,
            sort_order,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
        `,
        [randomUUID(), config.id, item.dayKey, item.enabled ? 1 : 0, item.openTime, item.closeTime, index],
      );
    }

    await this.dataSource.query(`DELETE FROM call_flow_ivr_options WHERE call_flow_config_id = ?`, [config.id]);
    for (const [index, item] of ivrOptions.entries()) {
      await this.dataSource.query(
        `
          INSERT INTO call_flow_ivr_options (
            id,
            call_flow_config_id,
            digit,
            option_label,
            service_type,
            route_target,
            sort_order,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
        `,
        [randomUUID(), config.id, item.digit, item.label, item.serviceType, item.routeTarget, index],
      );
    }

    return this.getSettings();
  }

  async evaluateActiveCallFlow(occurredAt: Date | null): Promise<CallFlowDecisionSummary> {
    const settings = await this.getSettings();
    const evaluatedAt = occurredAt ?? new Date();
    const parts = this.getZonedDateParts(evaluatedAt, settings.timeZone);
    const businessHours = settings.businessHours.find((item) => item.dayKey === parts.dayKey)
      ?? { dayKey: parts.dayKey, label: DAY_LABELS[parts.dayKey], enabled: false, openTime: "08:00", closeTime: "17:00" };
    const currentMinutes = parts.hour * 60 + parts.minute;
    const openMinutes = this.toClockMinutes(businessHours.openTime);
    const closeMinutes = this.toClockMinutes(businessHours.closeTime);
    const isOpenHours = businessHours.enabled && currentMinutes >= openMinutes && currentMinutes < closeMinutes;

    return {
      evaluatedAt,
      timeZone: settings.timeZone,
      businessHoursStatus: isOpenHours ? "open_hours" : "after_hours",
      callFlowAction: isOpenHours ? settings.openHoursAction : settings.afterHoursAction,
      callFlowRouteTarget: isOpenHours ? settings.openHoursRouteTarget : settings.afterHoursRouteTarget,
      greetingMode: settings.greetingMode,
      whisperMessage: settings.whisperMessage,
      missedCallSmsTemplateKey: settings.missedCallSmsTemplateKey,
    };
  }

  private async ensureSchema() {
    if (this.schemaEnsured) {
      return;
    }

    await assertTablesExist(this.dataSource, [
      "call_flow_configs",
      "call_flow_business_hours",
      "call_flow_ivr_options",
    ]);

    this.schemaEnsured = true;
  }

  private async getActiveConfigRow() {
    const hasModernConfigColumns = await this.hasCallFlowConfigColumn("config_name");

    const rows = await this.dataSource.query(
      hasModernConfigColumns
        ? `
            SELECT
              id,
              config_name,
              is_active,
              time_zone,
              greeting_mode,
              greeting_text,
              open_hours_action,
              open_hours_route_target,
              after_hours_action,
              after_hours_route_target,
              whisper_message,
              missed_call_sms_template_key,
              updated_at
            FROM call_flow_configs
            WHERE is_active = 1
            ORDER BY updated_at DESC
            LIMIT 1
          `
        : `
            SELECT
              id,
              name AS config_name,
              is_active,
              business_timezone AS time_zone,
              CASE
                WHEN greeting_mode = 'ivr' THEN 'ivr_menu'
                WHEN greeting_mode = 'custom' THEN 'custom_greeting'
                ELSE 'standard_greeting'
              END AS greeting_mode,
              greeting_text,
              CASE
                WHEN route_target_open = 'dispatcher' THEN 'dispatcher_queue'
                WHEN route_target_open = 'callback_queue' THEN 'callback_queue'
                ELSE 'standard_answer'
              END AS open_hours_action,
              NULLIF(route_target_open, '') AS open_hours_route_target,
              CASE
                WHEN after_hours_behavior = 'callback_queue' THEN 'callback_queue'
                WHEN after_hours_behavior = 'after_hours_message' THEN 'after_hours_message'
                ELSE 'voicemail'
              END AS after_hours_action,
              NULLIF(route_target_after_hours, '') AS after_hours_route_target,
              whisper_text AS whisper_message,
              missed_call_sms_template_ref AS missed_call_sms_template_key,
              updated_at
            FROM call_flow_configs
            WHERE is_active = 1
            ORDER BY updated_at DESC
            LIMIT 1
          `,
    ) as RawConfigRow[];

    const row = rows[0];
    if (!row) {
      apiError(500, "call_flow_config_missing", "The active call flow configuration could not be loaded.");
    }

    return row;
  }

  private async hasCallFlowConfigColumn(columnName: string) {
    const rows = await this.dataSource.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'call_flow_configs'
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [columnName],
    ) as Array<{ COLUMN_NAME?: string }>;

    return rows.length > 0;
  }

  private async getBusinessHours(configId: string) {
    const hasModernColumns = await this.hasTableColumn("call_flow_business_hours", "day_key");

    const rows = await this.dataSource.query(
      hasModernColumns
        ? `
            SELECT day_key, is_enabled, open_time, close_time
            FROM call_flow_business_hours
            WHERE call_flow_config_id = ?
            ORDER BY sort_order ASC, day_key ASC
          `
        : `
            SELECT day_of_week, is_closed, start_time, end_time
            FROM call_flow_business_hours
            WHERE call_flow_config_id = ?
            ORDER BY day_of_week ASC
          `,
      [configId],
    ) as Array<Record<string, number | boolean | string | null>>;

    const byDay = new Map<CallFlowDayKey, CallFlowBusinessHoursWindow>();
    for (const row of rows) {
      const dayKey = hasModernColumns
        ? this.validateDayKey(String(row.day_key ?? ""))
        : this.legacyDayOfWeekToDayKey(Number(row.day_of_week ?? 0));
      byDay.set(dayKey, {
        dayKey,
        label: DAY_LABELS[dayKey],
        enabled: hasModernColumns
          ? this.toBoolean(row.is_enabled)
          : !this.toBoolean(row.is_closed),
        openTime: String((hasModernColumns ? row.open_time : row.start_time) ?? "08:00"),
        closeTime: String((hasModernColumns ? row.close_time : row.end_time) ?? "17:00"),
      });
    }

    return DAY_KEYS.map((dayKey) => byDay.get(dayKey) ?? {
      dayKey,
      label: DAY_LABELS[dayKey],
      enabled: false,
      openTime: "08:00",
      closeTime: "17:00",
    });
  }

  private async getIvrOptions(configId: string) {
    const hasModernColumns = await this.hasTableColumn("call_flow_ivr_options", "option_label");

    const rows = await this.dataSource.query(
      hasModernColumns
        ? `
            SELECT id, digit, option_label, service_type, route_target
            FROM call_flow_ivr_options
            WHERE call_flow_config_id = ?
            ORDER BY sort_order ASC, digit ASC
          `
        : `
            SELECT id, digit, label, service_type, route_target
            FROM call_flow_ivr_options
            WHERE call_flow_config_id = ?
              AND is_active = 1
            ORDER BY digit ASC
          `,
      [configId],
    ) as Array<Record<string, string | null>>;

    return rows.map((row) => ({
      id: String(row.id ?? randomUUID()),
      digit: String(row.digit ?? ""),
      label: String((hasModernColumns ? row.option_label : row.label) ?? ""),
      serviceType: this.normalizeOptionalText(row.service_type),
      routeTarget: this.normalizeOptionalText(row.route_target),
    }));
  }

  private async hasTableColumn(tableName: string, columnName: string) {
    const rows = await this.dataSource.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1
      `,
      [tableName, columnName],
    ) as Array<{ COLUMN_NAME?: string }>;

    return rows.length > 0;
  }

  private legacyDayOfWeekToDayKey(dayOfWeek: number): CallFlowDayKey {
    const mapping: Record<number, CallFlowDayKey> = {
      1: "monday",
      2: "tuesday",
      3: "wednesday",
      4: "thursday",
      5: "friday",
      6: "saturday",
      7: "sunday",
    };

    return mapping[dayOfWeek] ?? "monday";
  }

  private normalizeBusinessHours(input: UpdateCallFlowSettingsInput["businessHours"]) {
    if (!Array.isArray(input)) {
      apiError(400, "call_flow_business_hours_invalid", "Business hours must be provided for each weekday.");
    }

    const byDay = new Map<CallFlowDayKey, CallFlowBusinessHoursWindow>();
    for (const item of input) {
      const dayKey = this.validateDayKey(item.dayKey);
      const openTime = this.validateClock(item.openTime, "call_flow_open_time_invalid", `Open time for ${DAY_LABELS[dayKey]} must use HH:MM.`);
      const closeTime = this.validateClock(item.closeTime, "call_flow_close_time_invalid", `Close time for ${DAY_LABELS[dayKey]} must use HH:MM.`);
      if (item.enabled && this.toClockMinutes(closeTime) <= this.toClockMinutes(openTime)) {
        apiError(400, "call_flow_business_hours_range_invalid", `${DAY_LABELS[dayKey]} close time must be after open time.`);
      }

      byDay.set(dayKey, {
        dayKey,
        label: DAY_LABELS[dayKey],
        enabled: item.enabled === true,
        openTime,
        closeTime,
      });
    }

    return DAY_KEYS.map((dayKey) => byDay.get(dayKey) ?? {
      dayKey,
      label: DAY_LABELS[dayKey],
      enabled: false,
      openTime: "08:00",
      closeTime: "17:00",
    });
  }

  private normalizeIvrOptions(input: UpdateCallFlowSettingsInput["ivrOptions"]) {
    if (!Array.isArray(input)) {
      apiError(400, "call_flow_ivr_options_invalid", "IVR options must be an array.");
    }

    const seenDigits = new Set<string>();
    const output: UpdateCallFlowSettingsInput["ivrOptions"] = [];

    for (const item of input) {
      const digit = item.digit.trim();
      const label = item.label.trim();
      const serviceType = this.normalizeOptionalText(item.serviceType);
      const routeTarget = this.normalizeOptionalText(item.routeTarget);

      if (!digit && !label && !serviceType && !routeTarget) {
        continue;
      }

      if (!/^[0-9]$/.test(digit)) {
        apiError(400, "call_flow_ivr_digit_invalid", "Each IVR option digit must be a single number from 0 to 9.");
      }

      if (seenDigits.has(digit)) {
        apiError(400, "call_flow_ivr_digit_duplicate", `IVR digit ${digit} is configured more than once.`);
      }

      if (!label) {
        apiError(400, "call_flow_ivr_label_invalid", `IVR digit ${digit} needs a label.`);
      }

      seenDigits.add(digit);
      output.push({ digit, label, serviceType, routeTarget });
    }

    return output;
  }

  private getZonedDateParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const weekday = parts.find((item) => item.type === "weekday")?.value?.toLowerCase() ?? "monday";
    const hourValue = Number(parts.find((item) => item.type === "hour")?.value ?? "0");
    const minuteValue = Number(parts.find((item) => item.type === "minute")?.value ?? "0");

    return {
      dayKey: this.validateDayKey(weekday),
      hour: Number.isFinite(hourValue) ? hourValue % 24 : 0,
      minute: Number.isFinite(minuteValue) ? minuteValue : 0,
    };
  }

  private validateTimeZone(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      apiError(400, "call_flow_time_zone_invalid", "Time zone is required.");
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
      return trimmed;
    } catch {
      apiError(400, "call_flow_time_zone_invalid", "Time zone must be a valid IANA zone such as America/Edmonton.");
    }
  }

  private validateGreetingMode(value: string) {
    if (value === "standard_greeting" || value === "custom_greeting" || value === "ivr_menu") {
      return value;
    }

    apiError(400, "call_flow_greeting_mode_invalid", "Greeting mode is invalid.");
  }

  private validateAction(value: string) {
    if (
      value === "standard_answer"
      || value === "dispatcher_queue"
      || value === "after_hours_message"
      || value === "voicemail"
      || value === "callback_queue"
    ) {
      return value;
    }

    apiError(400, "call_flow_action_invalid", "Call flow action is invalid.");
  }

  private validateDayKey(value: string) {
    if (DAY_KEYS.includes(value as CallFlowDayKey)) {
      return value as CallFlowDayKey;
    }

    apiError(400, "call_flow_day_invalid", "Business hours day value is invalid.");
  }

  private validateClock(value: string, errorCode: string, message: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      apiError(400, errorCode, message);
    }

    const [hoursText, minutesText] = value.split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      apiError(400, errorCode, message);
    }

    return `${hoursText}:${minutesText}`;
  }

  private toClockMinutes(value: string) {
    const [hoursText, minutesText] = value.split(":");
    return Number(hoursText) * 60 + Number(minutesText);
  }

  private requireText(value: string, errorCode: string, message: string, maxLength: number) {
    const trimmed = value.trim();
    if (!trimmed) {
      apiError(400, errorCode, message);
    }

    return trimmed.slice(0, maxLength);
  }

  private normalizeOptionalText(value: string | null | undefined) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private toBoolean(value: unknown) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value !== 0;
    }

    if (typeof value === "string") {
      return value === "1" || value.toLowerCase() === "true";
    }

    return false;
  }

  private asDate(value: Date | string | null) {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value !== "string") {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
