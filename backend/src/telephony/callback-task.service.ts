import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { ProfileEntity } from "../database/entities/profile.entity";
import { RecentCallEntity } from "../database/entities/recent-call.entity";
import { assertTablesExist } from "../database/schema-readiness";

export type CallbackTaskStatus = "open" | "in_progress" | "completed" | "cancelled";
export type CallbackTaskPriority = "high" | "normal" | "low";

export type CallbackTaskAssignee = {
  id: string;
  fullName: string;
  role: ProfileEntity["role"];
};

export type CallbackTaskSummary = {
  id: string;
  recentCallId: string;
  clientId: string | null;
  leadId: string | null;
  phoneNumber: string | null;
  source: string;
  priority: CallbackTaskPriority;
  dueAt: Date | null;
  assignedToProfileId: string | null;
  assignedTo: CallbackTaskAssignee | null;
  status: CallbackTaskStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type CreateCallbackTaskInput = {
  recentCallId: string;
  priority?: CallbackTaskPriority;
  dueAt?: Date | null;
  assignedToProfileId?: string | null;
  notes?: string | null;
  createdByAuthUserId?: string | null;
};

type UpdateCallbackTaskInput = {
  status?: CallbackTaskStatus;
  priority?: CallbackTaskPriority;
  dueAt?: Date | null;
  assignedToProfileId?: string | null;
  notes?: string | null;
};

const CALLBACK_TASK_STATUSES: CallbackTaskStatus[] = ["open", "in_progress", "completed", "cancelled"];
const CALLBACK_TASK_PRIORITIES: CallbackTaskPriority[] = ["high", "normal", "low"];
const CALLBACK_TASK_ASSIGNABLE_ROLES: ProfileEntity["role"][] = [
  "owner",
  "admin",
  "office_admin",
  "dispatcher",
  "csr",
  "technician",
];

@Injectable()
export class CallbackTaskService {
  private callbackTasksSchemaEnsured = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(RecentCallEntity)
    private readonly recentCallsRepository: Repository<RecentCallEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profilesRepository: Repository<ProfileEntity>,
  ) {}

  async listAssignableProfiles() {
    await this.ensureSchema();

    const profiles = await this.profilesRepository.find({
      select: {
        id: true,
        full_name: true,
        role: true,
      },
      where: {
        role: In(CALLBACK_TASK_ASSIGNABLE_ROLES),
      },
      order: {
        full_name: "ASC",
      },
    });

    return profiles.map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      role: profile.role,
    } satisfies CallbackTaskAssignee));
  }

  async listCallbackTasksByRecentCallIds(recentCallIds: string[]) {
    await this.ensureSchema();

    const uniqueRecentCallIds = [...new Set(recentCallIds.filter(Boolean))];
    const output = new Map<string, CallbackTaskSummary[]>();

    if (!uniqueRecentCallIds.length) {
      return output;
    }

    const placeholders = uniqueRecentCallIds.map(() => "?").join(", ");
    const rows = await this.dataSource.query(
      `
        SELECT
          task.id,
          task.recent_call_id,
          task.client_id,
          task.lead_id,
          task.phone_number,
          task.source,
          task.priority,
          task.due_at,
          task.assigned_to_profile_id,
          task.status,
          task.notes,
          task.created_at,
          task.updated_at,
          task.completed_at,
          profile.id AS assigned_profile_id,
          profile.full_name AS assigned_profile_name,
          profile.role AS assigned_profile_role
        FROM callback_tasks task
        LEFT JOIN profiles profile
          ON profile.id = task.assigned_to_profile_id
        WHERE task.recent_call_id IN (${placeholders})
        ORDER BY task.created_at DESC
      `,
      uniqueRecentCallIds,
    ) as Array<Record<string, unknown>>;

    for (const row of rows) {
      const summary = this.hydrateCallbackTaskSummary(row);
      const existing = output.get(summary.recentCallId) ?? [];
      existing.push(summary);
      output.set(summary.recentCallId, existing);
    }

    return output;
  }

  async countOpenCallbackTasks() {
    await this.ensureSchema();

    const rows = await this.dataSource.query(
      `
        SELECT COUNT(*) AS total
        FROM callback_tasks
        WHERE status IN (?, ?)
      `,
      ["open", "in_progress"],
    ) as Array<Record<string, unknown>>;

    const value = rows[0]?.total;
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async createCallbackTask(input: CreateCallbackTaskInput) {
    await this.ensureSchema();

    const recentCall = await this.recentCallsRepository.findOne({
      where: {
        id: input.recentCallId,
      },
    });

    if (!recentCall) {
      apiError(404, "recent_call_not_found", "The recent call could not be found.");
    }

    const existingOpenTask = await this.findActiveCallbackTaskByRecentCallId(recentCall.id);
    if (existingOpenTask) {
      return existingOpenTask;
    }

    const priority = this.validatePriority(input.priority ?? this.defaultPriorityForCallStatus(recentCall.call_status));
    const dueAt = input.dueAt ?? this.defaultDueAtForCallStatus(recentCall.call_status);
    const notes = this.normalizeNotes(input.notes);
    const assignee = await this.validateAssignedProfile(input.assignedToProfileId ?? null);
    const createdAt = new Date();
    const id = crypto.randomUUID();

    await this.dataSource.query(
      `
        INSERT INTO callback_tasks (
          id,
          recent_call_id,
          client_id,
          lead_id,
          phone_number,
          source,
          priority,
          due_at,
          assigned_to_profile_id,
          status,
          notes,
          created_by_auth_user_id,
          created_at,
          updated_at,
          completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      [
        id,
        recentCall.id,
        recentCall.matched_client_id,
        recentCall.matched_lead_id,
        recentCall.from_number ?? null,
        recentCall.source,
        priority,
        dueAt,
        assignee?.id ?? null,
        "open",
        notes,
        input.createdByAuthUserId ?? null,
        createdAt,
        createdAt,
      ],
    );

    return this.getCallbackTaskById(id);
  }

  async maybeAutoCreateForRecentCall(recentCall: RecentCallEntity) {
    await this.ensureSchema();

    if (!this.isCallbackWorthyStatus(recentCall.call_status)) {
      return null;
    }

    const existingOpenTask = await this.findActiveCallbackTaskByRecentCallId(recentCall.id);
    if (existingOpenTask) {
      return existingOpenTask;
    }

    return this.createCallbackTask({
      recentCallId: recentCall.id,
      priority: this.defaultPriorityForCallStatus(recentCall.call_status),
      dueAt: this.defaultDueAtForCallStatus(recentCall.call_status),
      assignedToProfileId: null,
      notes: `Auto-created from ${recentCall.call_status.replace(/_/g, " ")} call outcome.`,
      createdByAuthUserId: null,
    });
  }

  async updateCallbackTask(taskId: string, input: UpdateCallbackTaskInput) {
    await this.ensureSchema();

    const current = await this.getRawCallbackTaskById(taskId);
    if (!current) {
      apiError(404, "callback_task_not_found", "The callback task could not be found.");
    }

    const nextStatus = this.validateStatus(input.status ?? this.readString(current.status) ?? "open");
    const nextPriority = this.validatePriority(input.priority ?? this.readString(current.priority) ?? "normal");
    const nextDueAt = input.dueAt === undefined ? this.asDate(current.due_at) : input.dueAt;
    const nextNotes = input.notes === undefined ? this.normalizeNotes(this.readString(current.notes)) : this.normalizeNotes(input.notes);
    const nextAssignee = input.assignedToProfileId === undefined
      ? await this.validateAssignedProfile(this.readString(current.assigned_to_profile_id))
      : await this.validateAssignedProfile(input.assignedToProfileId);
    const completedAt = nextStatus === "completed" ? new Date() : null;

    await this.dataSource.query(
      `
        UPDATE callback_tasks
        SET
          priority = ?,
          due_at = ?,
          assigned_to_profile_id = ?,
          status = ?,
          notes = ?,
          completed_at = ?,
          updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ?
      `,
      [nextPriority, nextDueAt, nextAssignee?.id ?? null, nextStatus, nextNotes, completedAt, taskId],
    );

    return this.getCallbackTaskById(taskId);
  }

  private async ensureSchema() {
    if (this.callbackTasksSchemaEnsured) {
      return;
    }

    await assertTablesExist(this.dataSource, ["callback_tasks"]);

    this.callbackTasksSchemaEnsured = true;
  }

  private async getCallbackTaskById(taskId: string) {
    const row = await this.getRawCallbackTaskById(taskId);

    if (!row) {
      apiError(404, "callback_task_not_found", "The callback task could not be found.");
    }

    return this.hydrateCallbackTaskSummary(row);
  }

  private async findActiveCallbackTaskByRecentCallId(recentCallId: string) {
    const rows = await this.dataSource.query(
      `
        SELECT
          task.id,
          task.recent_call_id,
          task.client_id,
          task.lead_id,
          task.phone_number,
          task.source,
          task.priority,
          task.due_at,
          task.assigned_to_profile_id,
          task.status,
          task.notes,
          task.created_at,
          task.updated_at,
          task.completed_at,
          profile.id AS assigned_profile_id,
          profile.full_name AS assigned_profile_name,
          profile.role AS assigned_profile_role
        FROM callback_tasks task
        LEFT JOIN profiles profile
          ON profile.id = task.assigned_to_profile_id
        WHERE task.recent_call_id = ?
          AND task.status IN ('open', 'in_progress')
        ORDER BY task.created_at DESC
        LIMIT 1
      `,
      [recentCallId],
    ) as Array<Record<string, unknown>>;

    const row = rows[0] ?? null;
    return row ? this.hydrateCallbackTaskSummary(row) : null;
  }

  private async getRawCallbackTaskById(taskId: string) {
    const rows = await this.dataSource.query(
      `
        SELECT
          task.id,
          task.recent_call_id,
          task.client_id,
          task.lead_id,
          task.phone_number,
          task.source,
          task.priority,
          task.due_at,
          task.assigned_to_profile_id,
          task.status,
          task.notes,
          task.created_at,
          task.updated_at,
          task.completed_at,
          profile.id AS assigned_profile_id,
          profile.full_name AS assigned_profile_name,
          profile.role AS assigned_profile_role
        FROM callback_tasks task
        LEFT JOIN profiles profile
          ON profile.id = task.assigned_to_profile_id
        WHERE task.id = ?
        LIMIT 1
      `,
      [taskId],
    ) as Array<Record<string, unknown>>;

    return rows[0] ?? null;
  }

  private hydrateCallbackTaskSummary(row: Record<string, unknown>): CallbackTaskSummary {
    const assignedProfileId = this.readString(row.assigned_profile_id);
    const assignedProfileName = this.readString(row.assigned_profile_name);
    const assignedProfileRole = this.readRole(row.assigned_profile_role);

    return {
      id: this.readString(row.id) ?? "",
      recentCallId: this.readString(row.recent_call_id) ?? "",
      clientId: this.readString(row.client_id),
      leadId: this.readString(row.lead_id),
      phoneNumber: this.readString(row.phone_number),
      source: this.readString(row.source) ?? "unknown",
      priority: this.validatePriority(this.readString(row.priority) ?? "normal"),
      dueAt: this.asDate(row.due_at),
      assignedToProfileId: this.readString(row.assigned_to_profile_id),
      assignedTo: assignedProfileId && assignedProfileName && assignedProfileRole
        ? {
          id: assignedProfileId,
          fullName: assignedProfileName,
          role: assignedProfileRole,
        }
        : null,
      status: this.validateStatus(this.readString(row.status) ?? "open"),
      notes: this.readString(row.notes),
      createdAt: this.asDate(row.created_at) ?? new Date(),
      updatedAt: this.asDate(row.updated_at) ?? new Date(),
      completedAt: this.asDate(row.completed_at),
    };
  }

  private async validateAssignedProfile(profileId: string | null) {
    if (!profileId) {
      return null;
    }

    const profile = await this.profilesRepository.findOne({
      where: {
        id: profileId,
      },
      select: {
        id: true,
        full_name: true,
        role: true,
      },
    });

    if (!profile || !CALLBACK_TASK_ASSIGNABLE_ROLES.includes(profile.role)) {
      apiError(400, "callback_task_assignee_invalid", "The selected callback assignee is not available.");
    }

    return {
      id: profile.id,
      fullName: profile.full_name,
      role: profile.role,
    } satisfies CallbackTaskAssignee;
  }

  private validateStatus(status: string): CallbackTaskStatus {
    if (!CALLBACK_TASK_STATUSES.includes(status as CallbackTaskStatus)) {
      apiError(400, "callback_task_status_invalid", "The callback task status is invalid.");
    }

    return status as CallbackTaskStatus;
  }

  private validatePriority(priority: string): CallbackTaskPriority {
    if (!CALLBACK_TASK_PRIORITIES.includes(priority as CallbackTaskPriority)) {
      apiError(400, "callback_task_priority_invalid", "The callback task priority is invalid.");
    }

    return priority as CallbackTaskPriority;
  }

  private isCallbackWorthyStatus(status: string | null) {
    return status === "missed" || status === "abandoned" || status === "voicemail";
  }

  private defaultPriorityForCallStatus(status: string | null): CallbackTaskPriority {
    if (status === "voicemail") {
      return "normal";
    }

    return "high";
  }

  private defaultDueAtForCallStatus(status: string | null) {
    const minutes = status === "voicemail" ? 60 : 30;
    return new Date(Date.now() + minutes * 60_000);
  }

  private normalizeNotes(value: string | null | undefined) {
    const trimmed = value?.trim() ?? "";
    return trimmed ? trimmed : null;
  }

  private asDate(value: unknown) {
    if (!value || typeof value !== "string" && !(value instanceof Date)) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private readString(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private readRole(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }

    return value as ProfileEntity["role"];
  }
}
