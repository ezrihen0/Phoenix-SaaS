import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { canManageCallbackTasks } from "./telephony-role";
import { requireTelephonyOrganizationId } from "./telephony-org-scope";
import { CallbackTaskService } from "./callback-task.service";

type CreateCallbackTaskPayload = {
  recentCallId?: unknown;
  priority?: unknown;
  dueAt?: unknown;
  assignedToProfileId?: unknown;
  notes?: unknown;
};

type UpdateCallbackTaskPayload = {
  status?: unknown;
  priority?: unknown;
  dueAt?: unknown;
  assignedToProfileId?: unknown;
  notes?: unknown;
};

@UseGuards(SessionGuard, OperationalAccessGuard)
@Controller("api/telephony")
export class CallbackTasksController {
  constructor(private readonly callbackTaskService: CallbackTaskService) {}

  @Get("callback-task-assignees")
  async listAssignees(@Req() request: RequestWithActor) {
    const actor = this.requireOfficeActor(request);
    const organizationId = requireTelephonyOrganizationId(actor);
    return apiSuccess(await this.callbackTaskService.listAssignableProfiles(organizationId));
  }

  @Post("callback-tasks")
  async createCallbackTask(
    @Req() request: RequestWithActor,
    @Body() payload: CreateCallbackTaskPayload,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = requireTelephonyOrganizationId(actor);

    if (typeof payload.recentCallId !== "string" || !payload.recentCallId.trim()) {
      apiError(400, "callback_task_recent_call_required", "Recent call id is required.");
    }

    return apiSuccess(await this.callbackTaskService.createCallbackTask({
      organizationId,
      recentCallId: payload.recentCallId.trim(),
      priority: typeof payload.priority === "string" ? payload.priority as never : undefined,
      dueAt: this.parseOptionalDate(payload.dueAt),
      assignedToProfileId: typeof payload.assignedToProfileId === "string"
        ? payload.assignedToProfileId.trim() || null
        : null,
      notes: typeof payload.notes === "string" ? payload.notes : null,
      createdByAuthUserId: actor.user.id,
    }));
  }

  @Patch("callback-tasks/:taskId")
  async updateCallbackTask(
    @Req() request: RequestWithActor,
    @Param("taskId") taskId: string,
    @Body() payload: UpdateCallbackTaskPayload,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = requireTelephonyOrganizationId(actor);

    return apiSuccess(await this.callbackTaskService.updateCallbackTask(taskId, organizationId, {
      status: typeof payload.status === "string" ? payload.status as never : undefined,
      priority: typeof payload.priority === "string" ? payload.priority as never : undefined,
      dueAt: payload.dueAt === undefined ? undefined : this.parseOptionalDate(payload.dueAt),
      assignedToProfileId: payload.assignedToProfileId === undefined
        ? undefined
        : typeof payload.assignedToProfileId === "string"
          ? payload.assignedToProfileId.trim() || null
          : null,
      notes: payload.notes === undefined ? undefined : typeof payload.notes === "string" ? payload.notes : null,
    }));
  }

  private requireOfficeActor(request: RequestWithActor) {
    const actor = request.actor;

    if (!actor || !canManageCallbackTasks(actor.role ?? actor.profile?.role ?? null)) {
      apiError(403, "forbidden", "Only office roles can manage callback tasks.");
    }

    return actor;
  }

  private parseOptionalDate(value: unknown) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (typeof value !== "string") {
      apiError(400, "callback_task_due_at_invalid", "Callback due date must be an ISO date string or null.");
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      apiError(400, "callback_task_due_at_invalid", "Callback due date must be a valid date.");
    }

    return parsed;
  }
}
