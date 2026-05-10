"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  INVENTORY_LOCATION_TYPES,
  getInventoryLocationTypeLabel,
  type InventoryLocation,
  type InventoryLocationType,
  type InventoryTechnicianOption,
} from "@/lib/crm/inventory-model";

type InventoryLocationFormProps = {
  open: boolean;
  mode: "create" | "edit";
  initialLocation?: InventoryLocation | null;
  technicians: InventoryTechnicianOption[];
  onClose: () => void;
  onSaved: (location: InventoryLocation) => void;
};

type FormState = {
  name: string;
  locationType: InventoryLocationType;
  assignedUserId: string;
  assignedUserIdManual: string;
  isCompanyOwned: boolean;
  vehicleLabel: string;
  licensePlate: string;
  notes: string;
  isActive: boolean;
};

function buildInitialState(location?: InventoryLocation | null): FormState {
  return {
    name: location?.name ?? "",
    locationType: location?.location_type ?? "warehouse",
    assignedUserId: location?.assigned_user_id ?? "",
    assignedUserIdManual: location?.assigned_user_id ?? "",
    isCompanyOwned: location?.is_company_owned ?? true,
    vehicleLabel: location?.vehicle_label ?? "",
    licensePlate: location?.license_plate ?? "",
    notes: location?.notes ?? "",
    isActive: location?.is_active ?? true,
  };
}

export function InventoryLocationForm({
  open,
  mode,
  initialLocation = null,
  technicians,
  onClose,
  onSaved,
}: InventoryLocationFormProps) {
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(initialLocation));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFormState(buildInitialState(initialLocation));
    setErrorMessage(null);
  }, [initialLocation, open]);

  const technicianOptions = useMemo(
    () => technicians.filter((technician) => technician.auth_user_id).map((technician) => ({
      value: technician.auth_user_id ?? "",
      label: technician.display_name,
    })),
    [technicians],
  );

  if (!open) {
    return null;
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSave() {
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const payload = {
        name: formState.name.trim(),
        locationType: formState.locationType,
        assignedUserId: (technicianOptions.length > 0 ? formState.assignedUserId : formState.assignedUserIdManual).trim() || null,
        isCompanyOwned: formState.isCompanyOwned,
        vehicleLabel: formState.vehicleLabel.trim() || null,
        licensePlate: formState.licensePlate.trim() || null,
        notes: formState.notes.trim() || null,
        isActive: formState.isActive,
      };

      const result = mode === "create"
        ? await crmApiFetch<InventoryLocation>("/api/inventory/locations", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        : await crmApiFetch<InventoryLocation>(`/api/inventory/locations/${initialLocation?.id ?? ""}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

      onSaved(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The inventory location could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10 backdrop-blur-sm">
      <div className="theme-surface-modal w-full max-w-3xl rounded-[32px] border border-[color:var(--cmp-border-subtle)] p-6 shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--sem-accent-primary)]">Inventory Location</p>
            <h2 className="mt-3 text-2xl font-semibold text-[color:var(--sem-text-primary)]">
              {mode === "create" ? "Add inventory location" : "Edit inventory location"}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--sem-text-secondary)]">
              Locations hold stock. Technicians only see locations assigned to their own account in V1.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-control-surface rounded-full px-4 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-[20px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Location name</span>
            <input
              value={formState.name}
              onChange={(event) => updateField("name", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="Main Warehouse"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Location type</span>
            <select
              value={formState.locationType}
              onChange={(event) => updateField("locationType", event.target.value as InventoryLocationType)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
            >
              {INVENTORY_LOCATION_TYPES.map((locationType) => (
                <option key={locationType} value={locationType}>{getInventoryLocationTypeLabel(locationType)}</option>
              ))}
            </select>
          </label>
          {technicianOptions.length > 0 ? (
            <label className="block space-y-2">
              <span className="text-sm text-[color:var(--sem-text-secondary)]">Assigned technician</span>
              <select
                value={formState.assignedUserId}
                onChange={(event) => updateField("assignedUserId", event.target.value)}
                className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              >
                <option value="">Unassigned</option>
                {technicianOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block space-y-2">
              <span className="text-sm text-[color:var(--sem-text-secondary)]">Assigned user id</span>
              <input
                value={formState.assignedUserIdManual}
                onChange={(event) => updateField("assignedUserIdManual", event.target.value)}
                className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
                placeholder="Optional auth user id"
              />
            </label>
          )}
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">Vehicle label</span>
            <input
              value={formState.vehicleLabel}
              onChange={(event) => updateField("vehicleLabel", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="Tech 1 Van"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[color:var(--sem-text-secondary)]">License plate</span>
            <input
              value={formState.licensePlate}
              onChange={(event) => updateField("licensePlate", event.target.value)}
              className="theme-input-control h-12 w-full rounded-[18px] px-4 text-sm"
              placeholder="ABC-123"
            />
          </label>
          <label className="theme-control-surface flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
            <input
              type="checkbox"
              checked={formState.isCompanyOwned}
              onChange={(event) => updateField("isCompanyOwned", event.target.checked)}
              className="h-4 w-4"
            />
            Company-owned location
          </label>
          <label className="theme-control-surface flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm text-[color:var(--sem-text-secondary)]">
            <input
              type="checkbox"
              checked={formState.isActive}
              onChange={(event) => updateField("isActive", event.target.checked)}
              className="h-4 w-4"
            />
            Active location
          </label>
        </div>

        <label className="mt-5 block space-y-2">
          <span className="text-sm text-[color:var(--sem-text-secondary)]">Notes</span>
          <textarea
            value={formState.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            rows={4}
            className="theme-input-control min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm"
            placeholder="Bay, shelf, kit, or technician handoff notes."
          />
        </label>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="theme-control-surface rounded-full px-5 py-3 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {mode === "create" ? "Create location" : "Save location"}
          </button>
        </div>
      </div>
    </div>
  );
}