"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { crmApiFetch } from "@/lib/crm/browser-api";

export type CallbackTaskAssigneeOption = {
  id: string;
  fullName: string;
  role: string;
};

export type CallbackTaskItem = {
  id: string;
  recentCallId: string;
  clientId: string | null;
  leadId: string | null;
  phoneNumber: string | null;
  source: string;
  priority: "high" | "normal" | "low";
  dueAt: string | null;
  assignedToProfileId: string | null;
  assignedTo: CallbackTaskAssigneeOption | null;
  status: "open" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type CallbackTaskControlProps = {
  recentCallId: string;
  callbackTasks: CallbackTaskItem[];
  assignees: CallbackTaskAssigneeOption[];
};

type FormState = {
  status: CallbackTaskItem["status"];
  priority: CallbackTaskItem["priority"];
  dueAt: string;
  assignedToProfileId: string;
  notes: string;
};

function formatTaskStatusLabel(value: CallbackTaskItem["status"]) {
  switch (value) {
    case "in_progress":
      return "In progress";
    default:
      return value.replace(/_/g, " ");
  }
}

function formatTaskPriorityLabel(value: CallbackTaskItem["priority"]) {
  if (value === "high") {
    return "High";
  }

  if (value === "low") {
    return "Low";
  }

  return "Normal";
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offsetMilliseconds = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMilliseconds).toISOString().slice(0, 16);
}

function buildFormState(task: CallbackTaskItem | null): FormState {
  return {
    status: task?.status ?? "open",
    priority: task?.priority ?? "high",
    dueAt: toDateTimeLocalValue(task?.dueAt ?? null),
    assignedToProfileId: task?.assignedToProfileId ?? "",
    notes: task?.notes ?? "",
  };
}

export default function CallbackTaskControl({ recentCallId, callbackTasks, assignees }: CallbackTaskControlProps) {
  const router = useRouter();
  const activeTask = callbackTasks.find((task) => task.status === "open" || task.status === "in_progress") ?? callbackTasks[0] ?? null;
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(() => buildFormState(activeTask));

  useEffect(() => {
    setFormState(buildFormState(activeTask));
  }, [activeTask]);

  async function handleSave() {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (activeTask) {
        await crmApiFetch(`/api/telephony/callback-tasks/${activeTask.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: formState.status,
            priority: formState.priority,
            dueAt: formState.dueAt ? new Date(formState.dueAt).toISOString() : null,
            assignedToProfileId: formState.assignedToProfileId || null,
            notes: formState.notes.trim() || null,
          }),
        });
      } else {
        await crmApiFetch("/api/telephony/callback-tasks", {
          method: "POST",
          body: JSON.stringify({
            recentCallId,
            priority: formState.priority,
            dueAt: formState.dueAt ? new Date(formState.dueAt).toISOString() : null,
            assignedToProfileId: formState.assignedToProfileId || null,
            notes: formState.notes.trim() || null,
          }),
        });
      }

      setIsOpen(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The callback task could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {activeTask ? (
        <div className="rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-soft)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
          <div className="font-medium text-[color:var(--text-primary)]">
            Callback {formatTaskStatusLabel(activeTask.status)}
          </div>
          <div className="mt-1">
            {formatTaskPriorityLabel(activeTask.priority)} priority
            {activeTask.assignedTo ? ` • ${activeTask.assignedTo.fullName}` : " • Unassigned"}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setErrorMessage(null);
          setIsOpen((current) => !current);
        }}
        className="theme-control-surface rounded-[14px] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
      >
        {activeTask ? "Manage Callback" : "Create Callback Task"}
      </button>

      {isOpen ? (
        <div className="theme-control-surface-soft rounded-[18px] border border-[color:var(--border-subtle)] p-3 text-sm text-[color:var(--text-secondary)]">
          <div className="grid gap-3 md:grid-cols-2">
            {activeTask ? (
              <label className="space-y-2">
                <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Status</span>
                <select
                  value={formState.status}
                  onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as FormState["status"] }))}
                  className="theme-input-control w-full rounded-[14px] px-3 py-2 text-sm"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            ) : null}

            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Priority</span>
              <select
                value={formState.priority}
                onChange={(event) => setFormState((current) => ({ ...current, priority: event.target.value as FormState["priority"] }))}
                className="theme-input-control w-full rounded-[14px] px-3 py-2 text-sm"
              >
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Due at</span>
              <input
                type="datetime-local"
                value={formState.dueAt}
                onChange={(event) => setFormState((current) => ({ ...current, dueAt: event.target.value }))}
                className="theme-input-control w-full rounded-[14px] px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Assigned to</span>
              <select
                value={formState.assignedToProfileId}
                onChange={(event) => setFormState((current) => ({ ...current, assignedToProfileId: event.target.value }))}
                className="theme-input-control w-full rounded-[14px] px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.fullName} ({assignee.role.replace(/_/g, " ")})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 block space-y-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Notes</span>
            <textarea
              value={formState.notes}
              onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              className="theme-input-control w-full rounded-[14px] px-3 py-2 text-sm"
              placeholder="Callback context, voicemail notes, or routing instructions"
            />
          </label>

          {errorMessage ? <p className="mt-3 text-sm text-[color:var(--flat-coral)]">{errorMessage}</p> : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="theme-btn-secondary rounded-[14px] px-3 py-2 text-xs uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : activeTask ? "Save Callback" : "Create Callback"}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="theme-control-surface rounded-[14px] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}