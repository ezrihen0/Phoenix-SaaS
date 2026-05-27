"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { InspectionArchiveModal } from "@/components/inspections/inspection-archive-modal";
import { InspectionWorkspaceDesk } from "@/components/inspections/inspection-workspace-desk";
import { canManageInspections, formatSectionLabel } from "@/components/inspections/inspection-labels";
import type { StructuredRecommendationDraft } from "@/components/inspections/inspection-checklist-row";
import {
  archiveInspection,
  assignInspectionPhoto,
  generateInspection,
  getInspectionWorkspace,
  patchInspectionItem,
  patchInspectionMeta,
  patchRequiredField,
  restoreInspection,
  sendInspection,
  type InspectionArchiveReasonCode,
  type InspectionWorkspacePayload,
  unlockInspectionForCorrection,
  uploadInspectionPhotos,
} from "@/lib/inspections/browser-api";
import type { SessionRole } from "@/lib/auth/server-session";

export const SHOW_LEGACY_INSPECTIONS = false;

type InspectionWorkspaceClientProps = {
  inspectionId: string;
  permissions: string[];
  sessionRole: SessionRole | null;
};

const priorityRanks: Record<StructuredRecommendationDraft["priorityLevel"], string> = {
  P1: "1/4",
  P2: "2/4",
  P3: "3/4",
  P4: "4/4",
};

const priorityDescriptions: Record<StructuredRecommendationDraft["priorityLevel"], string> = {
  P1: "Safety Concern / Action Required Before Continued Use",
  P2: "Recommended Repair / Prevent Further Damage",
  P3: "Preventive Maintenance / System Longevity",
  P4: "Optional Upgrade / Performance or Protection Improvement",
};

function parseStructuredRecommendationText(raw: string | null | undefined) {
  const text = raw?.trim() ?? "";
  if (!text) {
    return {
      issueObserved: "",
      riskIfIgnored: "",
      recommendedAction: "",
      priorityLevel: "P2" as const,
    };
  }

  const issueObserved = text.match(/^Issue Observed:[ \t]*([^\r\n]*)/im)?.[1]?.trim() ?? "";
  const riskIfIgnored = text.match(/^Risk If Ignored:[ \t]*([^\r\n]*)/im)?.[1]?.trim() ?? "";
  const recommendedAction = text.match(/^Recommended Action:[ \t]*([^\r\n]*)/im)?.[1]?.trim() ?? "";
  const priorityLevel = (text.match(/^Priority Level:[ \t]*(P[1-4])/im)?.[1]?.toUpperCase() ?? "P2") as "P1" | "P2" | "P3" | "P4";
  const hasStructuredLabels = /Issue Observed:|Risk If Ignored:|Recommended Action:|Priority Level:/i.test(text);

  if (!issueObserved && !riskIfIgnored && !recommendedAction && !hasStructuredLabels) {
    return {
      issueObserved: text,
      riskIfIgnored: "",
      recommendedAction: "",
      priorityLevel,
    };
  }

  return {
    issueObserved,
    riskIfIgnored,
    recommendedAction,
    priorityLevel,
  };
}

function buildStructuredRecommendationText(draft: StructuredRecommendationDraft) {
  const issueObserved = draft.issueObserved.trim();
  const riskIfIgnored = draft.riskIfIgnored.trim();
  const recommendedAction = draft.recommendedAction.trim();

  if (!issueObserved && !riskIfIgnored && !recommendedAction && draft.priorityLevel === "P2") {
    return null;
  }

  return [
    `Issue Observed: ${issueObserved}`,
    `Risk If Ignored: ${riskIfIgnored}`,
    `Recommended Action: ${recommendedAction}`,
    `Priority Level: ${draft.priorityLevel}`,
  ].join("\n");
}

function parseStructuredRecommendationForGate(recommendationText: string | null | undefined) {
  const text = recommendationText?.trim() ?? "";
  if (!text) {
    return null;
  }
  const issueObserved = text.match(/^Issue Observed:[ \t]*([^\r\n]*)/im)?.[1]?.trim() ?? "";
  const riskIfIgnored = text.match(/^Risk If Ignored:[ \t]*([^\r\n]*)/im)?.[1]?.trim() ?? "";
  const recommendedAction = text.match(/^Recommended Action:[ \t]*([^\r\n]*)/im)?.[1]?.trim() ?? "";
  const priorityLevel = text.match(/^Priority Level:[ \t]*(P[1-4])/im)?.[1]?.toUpperCase() ?? "";
  return {
    issueObserved,
    riskIfIgnored,
    recommendedAction,
    priorityLevel,
  };
}

function deriveStandardPriorityFromSignals(signalSource: string) {
  const signal = signalSource.toLowerCase();
  if (/(unsafe|hazard|critical|co|carbon\s*monoxide|smoke|fire\s*risk|do\s*not\s*use)/.test(signal)) {
    return "P1" as const;
  }
  if (/(water|weather|flashing|leak|moisture|crown|chase|cap|damage)/.test(signal)) {
    return "P2" as const;
  }
  if (/(maintenance|service|clean|sweep|creosote|draft|vent)/.test(signal)) {
    return "P3" as const;
  }
  return "P2" as const;
}

function resolveStandardPriorityCode(item: InspectionWorkspacePayload["items"][number]) {
  if (item.status !== "unsatisfactory") {
    return null;
  }
  const explicit = item.recommendation_text?.match(/\bP([1-4])\b/i);
  if (explicit) {
    return `P${explicit[1]}` as "P1" | "P2" | "P3" | "P4";
  }
  return deriveStandardPriorityFromSignals(`${item.item_key} ${item.recommendation_text ?? ""}`);
}

function hasStandardDefectSignals(item: InspectionWorkspacePayload["items"][number]) {
  const signal = `${item.item_key} ${item.recommendation_text ?? ""}`.toLowerCase();
  if (/(no\s+(immediate\s+)?(defect|hazard|risk|damage|issue|concern))/i.test(signal)) {
    return false;
  }
  return /(hazard|unsafe|critical|crack|leak|moisture|damage|deterioration|structural|blockage|backdraft|smoke|\bco\b|carbon\s*monoxide|fire\s*risk|do\s*not\s*use|staining|rust|defect)/.test(
    signal,
  );
}

function resolveStandardPenalty(item: InspectionWorkspacePayload["items"][number]) {
  const priority = resolveStandardPriorityCode(item);
  if (!priority) {
    return 0;
  }
  if (priority === "P4") {
    return hasStandardDefectSignals(item) ? 4 : 0;
  }
  if (priority === "P1") {
    return 22;
  }
  if (priority === "P2") {
    return 12;
  }
  return 6;
}

export default function InspectionWorkspaceClient({ inspectionId, permissions, sessionRole }: InspectionWorkspaceClientProps) {
  const router = useRouter();
  const canManage = canManageInspections(permissions);
  const [workspace, setWorkspace] = useState<InspectionWorkspacePayload | null>(null);
  const [localItems, setLocalItems] = useState<InspectionWorkspacePayload["items"]>([]);
  const [pendingItemPatches, setPendingItemPatches] = useState<
    Record<string, { status?: "satisfactory" | "unsatisfactory" | "na"; recommendation_text?: string | null }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sendFeedback, setSendFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [gasLicenseNumber, setGasLicenseNumber] = useState("");
  const [gasLicenseHolderName, setGasLicenseHolderName] = useState("");
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [recommendationDrafts, setRecommendationDrafts] = useState<Record<string, StructuredRecommendationDraft>>({});
  const [activeSectionKey, setActiveSectionKey] = useState<string | "all" | null>("all");
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const isFlushingItemPatchesRef = useRef(false);
  const pendingItemPatchesRef = useRef(pendingItemPatches);
  const recommendationDraftsRef = useRef(recommendationDrafts);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const photoTargetItemIdRef = useRef<string | null>(null);

  async function optimizeImageForUpload(file: File) {
    const bitmap = await createImageBitmap(file);
    const targetWidth = Math.min(1200, bitmap.width);
    const targetHeight = Math.max(1, Math.round((bitmap.height * targetWidth) / bitmap.width));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.82);
    });
    if (!blob) {
      return file;
    }
    const optimizedName = file.name.replace(/\.[^.]+$/, "") || "inspection-photo";
    return new File([blob], `${optimizedName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  }

  async function optimizeImagesForUpload(files: File[]) {
    const optimizedFiles: File[] = [];
    for (const file of files) {
      try {
        optimizedFiles.push(await optimizeImageForUpload(file));
      } catch {
        optimizedFiles.push(file);
      }
    }
    return optimizedFiles;
  }

  function applyWorkspace(nextWorkspace: InspectionWorkspacePayload) {
    setWorkspace(nextWorkspace);
    setLocalItems(nextWorkspace.items);
    const drafts: Record<string, StructuredRecommendationDraft> = {};
    for (const item of nextWorkspace.items) {
      drafts[item.id] = parseStructuredRecommendationText(item.recommendation_text);
    }
    recommendationDraftsRef.current = drafts;
    setRecommendationDrafts(drafts);
  }

  async function refresh() {
    try {
      const data = await getInspectionWorkspace(inspectionId);
      applyWorkspace(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load inspection workspace.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGasLicenseNumber(workspace?.inspectionMeta.gas_license_number ?? "");
    setGasLicenseHolderName(workspace?.inspectionMeta.gas_license_holder_name ?? "");
  }, [workspace?.inspectionMeta.gas_license_number, workspace?.inspectionMeta.gas_license_holder_name]);
  useEffect(() => {
    const syncViewport = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    pendingItemPatchesRef.current = pendingItemPatches;
  }, [pendingItemPatches]);

  useEffect(() => {
    recommendationDraftsRef.current = recommendationDrafts;
  }, [recommendationDrafts]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, InspectionWorkspacePayload["items"]>();
    for (const item of localItems) {
      const items = map.get(item.section_key) ?? [];
      items.push(item);
      map.set(item.section_key, items);
    }
    return Array.from(map.entries());
  }, [localItems]);
  const activeSectionEntry = useMemo(() => {
    if (!groupedItems.length) {
      return null;
    }

    return groupedItems.find(([section]) => section === activeSectionKey) ?? groupedItems[0];
  }, [activeSectionKey, groupedItems]);
  const missingWettFieldsCount = useMemo(
    () => (workspace?.required_fields ?? []).filter((field) => field.is_mandatory && !field.is_satisfied).length,
    [workspace?.required_fields],
  );
  const gasLicenseMissing = useMemo(
    () =>
      workspace?.inspectionMeta.workflow_type === "gas_simplified"
      && (!workspace.inspectionMeta.gas_license_number?.trim() || !workspace.inspectionMeta.gas_license_holder_name?.trim()),
    [workspace],
  );
  const liveClientScoreOrCompliance = useMemo(() => {
    if (!workspace) {
      return {
        score: null as number | null,
        score_max: 100,
        compliance_status: null as string | null,
        can_generate: false,
        gate_errors: [] as string[],
      };
    }
    const errors: string[] = [];
    const requiredItems = localItems.filter((item) => item.is_required);
    const unsatisfactoryItems = localItems.filter((item) => item.status === "unsatisfactory");
    for (const item of requiredItems) {
      if (item.status === "na") {
        errors.push(`Required checklist item is incomplete: ${item.item_key}`);
      }
    }
    for (const item of unsatisfactoryItems) {
      if (!item.recommendation_text?.trim()) {
        errors.push(`Recommendation required for unsatisfactory item: ${item.item_key}`);
      }

      if (workspace.inspectionMeta.workflow_type === "safety_standard") {
        const structured = parseStructuredRecommendationForGate(item.recommendation_text);
        if (!structured?.issueObserved) {
          errors.push(`Issue observed is required for unsatisfactory STANDARD item: ${item.item_key}`);
        }
        if (!structured?.riskIfIgnored) {
          errors.push(`Risk if ignored is required for unsatisfactory STANDARD item: ${item.item_key}`);
        }
        if (!structured?.recommendedAction) {
          errors.push(`Recommended action is required for unsatisfactory STANDARD item: ${item.item_key}`);
        }
        if (!structured?.priorityLevel || !/^P[1-4]$/i.test(structured.priorityLevel)) {
          errors.push(`Priority level (P1-P4) is required for unsatisfactory STANDARD item: ${item.item_key}`);
        }
      }
    }

    if (workspace.inspectionMeta.workflow_type === "gas_simplified") {
      if (!gasLicenseNumber.trim()) {
        errors.push("Gas license number is required for gas fireplace reports.");
      }
      if (!gasLicenseHolderName.trim()) {
        errors.push("Gas license holder name is required for gas fireplace reports.");
      }
    }

    if (workspace.inspectionMeta.workflow_type === "compliance_wett") {
      for (const item of localItems) {
        if (item.is_legal_mandatory && item.status === "na") {
          errors.push(`WETT legal checklist item is incomplete: ${item.item_key}`);
        }
      }
      for (const field of workspace.required_fields) {
        if (field.is_mandatory && !field.is_satisfied) {
          errors.push(`WETT mandatory field missing: ${field.field_key}`);
        }
      }
      const hasMandatoryNa = localItems.some((item) => item.is_legal_mandatory && item.status === "na");
      return {
        score: null as number | null,
        score_max: 100,
        compliance_status: hasMandatoryNa ? "incomplete" : "ready_to_generate",
        can_generate: errors.length === 0,
        gate_errors: errors,
      };
    }

    if (!requiredItems.length) {
      return {
        score: 100,
        score_max: 100,
        compliance_status: null,
        can_generate: errors.length === 0,
        gate_errors: errors,
      };
    }

    if (workspace.inspectionMeta.workflow_type === "safety_standard") {
      const evaluatedItems = requiredItems.filter((item) => item.status !== "na");
      const score = Math.max(
        0,
        Math.min(
          100,
          100
            - evaluatedItems
              .filter((item) => item.status === "unsatisfactory")
              .reduce((sum, item) => sum + resolveStandardPenalty(item), 0),
        ),
      );

      return {
        score,
        score_max: 100,
        compliance_status: null,
        can_generate: errors.length === 0,
        gate_errors: errors,
      };
    }

    let score = 100;
    for (const item of requiredItems) {
      if (item.status === "unsatisfactory") {
        score -= Math.round(100 / requiredItems.length);
      }
      if (item.status === "na") {
        score -= Math.round(50 / requiredItems.length);
      }
    }
    score = Math.max(0, Math.min(100, score));
    return {
      score,
      score_max: 100,
      compliance_status: null,
      can_generate: errors.length === 0,
      gate_errors: errors,
    };
  }, [workspace, localItems, gasLicenseNumber, gasLicenseHolderName]);

  useEffect(() => {
    const pendingEntries = Object.entries(pendingItemPatches);
    if (!pendingEntries.length || isFlushingItemPatchesRef.current) {
      return;
    }
    const batch = Object.fromEntries(pendingEntries);
    const timer = window.setTimeout(async () => {
      if (isFlushingItemPatchesRef.current) {
        return;
      }
      isFlushingItemPatchesRef.current = true;
      let lastWorkspace: InspectionWorkspacePayload | null = null;
      try {
        for (const [itemId, patch] of Object.entries(batch)) {
          if (patch.status === undefined && patch.recommendation_text === undefined) {
            continue;
          }
          lastWorkspace = await patchInspectionItem(inspectionId, itemId, patch);
        }
        if (lastWorkspace) {
          applyWorkspace(lastWorkspace);
          setError(null);
        }
        setPendingItemPatches((current) => {
          const next = { ...current };
          for (const [itemId, patch] of Object.entries(batch)) {
            const currentPatch = current[itemId];
            if (
              currentPatch
              && currentPatch.status === patch.status
              && currentPatch.recommendation_text === patch.recommendation_text
            ) {
              delete next[itemId];
            }
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Background item sync failed.");
      } finally {
        isFlushingItemPatchesRef.current = false;
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [inspectionId, pendingItemPatches]);

  const filteredItems = useMemo(() => {
    if (!activeSectionKey || activeSectionKey === "all") {
      return localItems;
    }
    return localItems.filter((item) => item.section_key === activeSectionKey);
  }, [activeSectionKey, localItems]);

  useEffect(() => {
    if (!groupedItems.length) {
      setActiveSectionKey(null);
      return;
    }

    if (activeSectionKey === null) {
      setActiveSectionKey("all");
      return;
    }

    if (activeSectionKey !== "all" && !groupedItems.some(([section]) => section === activeSectionKey)) {
      setActiveSectionKey("all");
    }
  }, [activeSectionKey, groupedItems]);

  async function flushPendingItemPatches() {
    if (isFlushingItemPatchesRef.current) {
      return;
    }
    const pending = { ...pendingItemPatchesRef.current };
    if (!Object.keys(pending).length) {
      return;
    }
    isFlushingItemPatchesRef.current = true;
    let lastWorkspace: InspectionWorkspacePayload | null = null;
    try {
      for (const [itemId, patch] of Object.entries(pending)) {
        if (patch.status === undefined && patch.recommendation_text === undefined) {
          continue;
        }
        lastWorkspace = await patchInspectionItem(inspectionId, itemId, patch);
      }
      if (lastWorkspace) {
        applyWorkspace(lastWorkspace);
        setError(null);
      }
      setPendingItemPatches((current) => {
        const next = { ...current };
        for (const [itemId, patch] of Object.entries(pending)) {
          const currentPatch = current[itemId];
          if (
            currentPatch
            && currentPatch.status === patch.status
            && currentPatch.recommendation_text === patch.recommendation_text
          ) {
            delete next[itemId];
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Background item sync failed.");
    } finally {
      isFlushingItemPatchesRef.current = false;
    }
  }

  function updateStructuredRecommendationDraft(
    item: InspectionWorkspacePayload["items"][number],
    patch: Partial<StructuredRecommendationDraft>,
    shouldCommit = false,
  ) {
    const currentDraft = recommendationDraftsRef.current[item.id] ?? parseStructuredRecommendationText(item.recommendation_text);
    const nextDraft = { ...currentDraft, ...patch };

    recommendationDraftsRef.current = {
      ...recommendationDraftsRef.current,
      [item.id]: nextDraft,
    };
    setRecommendationDrafts(recommendationDraftsRef.current);

    if (!shouldCommit) {
      return;
    }

    const normalizedValue = buildStructuredRecommendationText(nextDraft);
    setLocalItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, recommendation_text: normalizedValue } : entry))
    );
    setPendingItemPatches((current) => ({
      ...current,
      [item.id]: {
        ...current[item.id],
        recommendation_text: normalizedValue,
      },
    }));
  }

  function commitStructuredRecommendationDraft(item: InspectionWorkspacePayload["items"][number]) {
    updateStructuredRecommendationDraft(item, {}, true);
  }

  function openItemPhotoPicker(itemId: string, source: "camera" | "library") {
    photoTargetItemIdRef.current = itemId;
    const input = source === "camera" ? cameraInputRef.current : libraryInputRef.current;
    if (!input) {
      return;
    }
    input.value = "";
    input.click();
  }

  async function attachPhotoFilesToItem(fileList: FileList | null) {
    const itemId = photoTargetItemIdRef.current;
    photoTargetItemIdRef.current = null;
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (!itemId || !files.length) {
      return;
    }

    try {
      setBusy(`photo-${itemId}`);
      await flushPendingItemPatches();
      const existingPhotoIds = new Set((workspace?.photoPool ?? []).map((photo) => photo.id));
      const optimizedFiles = await optimizeImagesForUpload(files);
      const uploadWorkspace = await uploadInspectionPhotos(inspectionId, optimizedFiles);
      const uploadedPhotos = uploadWorkspace.photoPool.filter((photo) => !existingPhotoIds.has(photo.id));

      if (!uploadedPhotos.length) {
        applyWorkspace(uploadWorkspace);
        setError("Photo uploaded, but it could not be matched for assignment. Please try again.");
        return;
      }

      let nextWorkspace = uploadWorkspace;
      for (const photo of uploadedPhotos) {
        nextWorkspace = await assignInspectionPhoto(inspectionId, { photo_id: photo.id, item_id: itemId });
      }

      applyWorkspace(nextWorkspace);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setBusy(null);
    }
  }

  const generatedPdfUrl = workspace?.inspectionMeta.generated_pdf_url ?? workspace?.pdfPreviewUrl ?? null;

  function openGeneratedPdfInNewTab() {
    if (!generatedPdfUrl) {
      return;
    }
    window.open(generatedPdfUrl, "_blank", "noopener,noreferrer");
  }

  function downloadGeneratedPdf() {
    if (!generatedPdfUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = generatedPdfUrl;
    link.download = `inspection-${inspectionId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleGenerate() {
    setSendFeedback(null);
    setBusy("generate");
    try {
      await flushPendingItemPatches();
      const data = await generateInspection(inspectionId);
      applyWorkspace(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleMarkSentAndLock() {
    setSendFeedback(null);
    setBusy("send");
    try {
      await flushPendingItemPatches();
      const data = await sendInspection(inspectionId);
      applyWorkspace(data);
      setError(null);
      const sentAt = data.inspectionMeta.sent_to_customer_at;
      const lockedAt = data.inspectionMeta.locked_at;
      if (sentAt && lockedAt) {
        setSendFeedback({
          type: "success",
          message: "Report marked as sent and locked for editing.",
        });
      } else if (sentAt) {
        setSendFeedback({
          type: "success",
          message: "Report marked as sent.",
        });
      } else {
        setSendFeedback({
          type: "success",
          message: "Mark sent request completed.",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mark sent failed.";
      setError(message);
      setSendFeedback({
        type: "error",
        message,
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleUnlock() {
    setBusy("unlock");
    try {
      const data = await unlockInspectionForCorrection(inspectionId);
      applyWorkspace(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleArchive(input: { reasonCode: InspectionArchiveReasonCode; reasonText: string }) {
    setBusy("archive");
    setArchiveError(null);
    try {
      await archiveInspection(inspectionId, input);
      setIsArchiveModalOpen(false);
      router.push("/inspections");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Archive failed.";
      setArchiveError(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore() {
    setBusy("restore");
    try {
      const data = await restoreInspection(inspectionId);
      applyWorkspace(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveGasLicense() {
    const data = await patchInspectionMeta(inspectionId, {
      gas_license_number: gasLicenseNumber,
      gas_license_holder_name: gasLicenseHolderName,
    });
    applyWorkspace(data);
  }

  async function handleRequiredFieldBlur(fieldId: string, value: string) {
    const data = await patchRequiredField(inspectionId, fieldId, { field_value: value });
    applyWorkspace(data);
  }

  function handleStatusChange(itemId: string, status: "satisfactory" | "unsatisfactory" | "na") {
    setLocalItems((current) => current.map((entry) => (entry.id === itemId ? { ...entry, status } : entry)));
    setPendingItemPatches((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        status,
      },
    }));
  }

  function handleRecommendationBlur(itemId: string, value: string | null) {
    setLocalItems((current) =>
      current.map((entry) => (entry.id === itemId ? { ...entry, recommendation_text: value } : entry))
    );
    setPendingItemPatches((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        recommendation_text: value,
      },
    }));
  }

  const isArchived = Boolean(workspace?.inspectionMeta.archived_at);

  const sendDisabled = Boolean(busy)
    || isArchived
    || Boolean(workspace?.inspectionMeta.is_internal_draft)
    || !workspace?.inspectionMeta.generated_pdf_at
    || Boolean(workspace?.inspectionMeta.locked_at);

  const generateDisabled = Boolean(busy)
    || isArchived
    || Boolean(workspace?.inspectionMeta.is_internal_draft)
    || !liveClientScoreOrCompliance.can_generate
    || !canManage;
  const generateRemainingCount = liveClientScoreOrCompliance.gate_errors.length;
  const generateDisabledTooltip = generateDisabled
    ? generateRemainingCount > 0
      ? liveClientScoreOrCompliance.gate_errors.join("\n")
      : workspace?.inspectionMeta.is_internal_draft
        ? "Internal drafts must be converted before generating."
        : "Generate report is not available yet."
    : undefined;
  const photoButtonsDisabled = Boolean(busy) || Boolean(workspace?.inspectionMeta.locked_at) || isArchived || !canManage;

  const sendDisabledReason = isArchived
    ? "Archived reports are read-only history."
    : workspace?.inspectionMeta.locked_at
    ? "Report already sent and locked."
    : workspace?.inspectionMeta.is_internal_draft
      ? "Internal drafts must be converted before Generate/Send."
    : !workspace?.inspectionMeta.generated_pdf_at
      ? "Generate PDF before sending report."
      : null;

  const requiresStrongerArchiveReason = Boolean(
    workspace?.inspectionMeta.generated_pdf_at
    || workspace?.inspectionMeta.sent_to_customer_at
    || workspace?.inspectionMeta.locked_at,
  );

  if (isDesktop === null) {
    return <main className="p-6 text-sm text-zinc-500">Loading workspace...</main>;
  }

  if (!isDesktop) {
    return <main className="p-6 text-sm text-zinc-500">Desktop authoring required for MVP.</main>;
  }

  if (!workspace) {
    return <main className="p-6 text-sm text-zinc-500">Loading workspace...</main>;
  }

  const fileInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void attachPhotoFilesToItem(event.target.files);
        }}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void attachPhotoFilesToItem(event.target.files);
        }}
      />
    </>
  );

  const previewModal = isPreviewExpanded ? (
    <div className="fixed inset-0 z-[80] bg-black/70 p-4">
      <div className="theme-surface-card mx-auto flex h-full w-full max-w-[1200px] flex-col rounded-[16px] border border-[color:var(--cmp-border-subtle)] bg-[color:var(--cmp-surface-card)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Expanded Preview</p>
          <button type="button" className="theme-control-surface rounded-xl border px-3 py-1 text-xs" onClick={() => setIsPreviewExpanded(false)}>
            Close
          </button>
        </div>
        <div className="theme-control-surface-soft min-h-0 flex-1 overflow-auto rounded border border-[color:var(--cmp-border-subtle)] p-2">
          {generatedPdfUrl ? (
            <iframe title="pdf-preview-expanded" src={generatedPdfUrl} className="h-full min-h-[640px] w-full rounded" />
          ) : (
            <p className="text-xs text-zinc-500">Generate report to preview PDF.</p>
          )}
        </div>
      </div>
    </div>
  ) : null;

  if (SHOW_LEGACY_INSPECTIONS) {
    return (
      <main className="relative h-[calc(100vh-92px)] px-2 pb-3 pt-4">
        {fileInputs}
        {error ? <p className="theme-alert-error mb-2 rounded-[12px] border px-3 py-2 text-sm">{error}</p> : null}
        <div className="grid h-full grid-cols-[260px_1fr_420px] gap-3">
        <aside className="theme-surface-card overflow-auto rounded-[18px] p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Sections</p>
          <div className="mt-3 space-y-2">
            {workspace?.sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSectionKey(section.key)}
                className={[
                  "block w-full rounded-[12px] px-3 py-2 text-left text-sm transition",
                  activeSectionEntry?.[0] === section.key
                    ? "theme-selected-card"
                    : "theme-control-surface hover:border-[color:var(--cmp-border-accent)] hover:bg-[color:var(--cmp-hover-surface)]",
                ].join(" ")}
              >
                {formatSectionLabel(section.key)} ({section.completed}/{section.total})
              </button>
            ))}
          </div>
        </aside>

        <section className="theme-surface-card overflow-auto rounded-[18px] p-3">
          {activeSectionEntry ? (
            <div id={`section-${activeSectionEntry[0]}`} key={activeSectionEntry[0]}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">{formatSectionLabel(activeSectionEntry[0])}</h3>
              <div className="space-y-2">
                {activeSectionEntry[1].map((item) => (
                  <div key={item.id} className="theme-control-surface rounded-[12px] p-3">
                    {(() => {
                      const isStandardWorkflow = workspace?.inspectionMeta.workflow_type === "safety_standard";
                      const isAttentionRequiredItem = item.status === "unsatisfactory";
                      const recommendationDraft = recommendationDrafts[item.id] ?? parseStructuredRecommendationText(item.recommendation_text);
                      return (
                        <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-[color:var(--text-primary)]">{item.item_label}</p>
                        {item.photo_attached_count > 0 ? (
                          <span className="theme-badge mt-1 inline-flex rounded-full px-2 py-1 text-xs">Photo Attached ({item.photo_attached_count})</span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className="theme-btn-ghost rounded-[10px] px-2 py-1 text-[11px]"
                          disabled={photoButtonsDisabled}
                          onClick={() => openItemPhotoPicker(item.id, "camera")}
                        >
                          + Take Photo
                        </button>
                        <button
                          type="button"
                          className="theme-btn-ghost rounded-[10px] px-2 py-1 text-[11px]"
                          disabled={photoButtonsDisabled}
                          onClick={() => openItemPhotoPicker(item.id, "library")}
                        >
                          + Library
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {(["satisfactory", "unsatisfactory", "na"] as const).map((status) => (
                        <button
                          key={status}
                          className={`rounded-[10px] px-3 py-2 text-xs ${item.status === status ? "theme-btn-secondary" : "theme-btn-ghost"}`}
                          onClick={() => {
                            setLocalItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status } : entry)));
                            setPendingItemPatches((current) => ({
                              ...current,
                              [item.id]: {
                                ...current[item.id],
                                status,
                              },
                            }));
                          }}
                          disabled={Boolean(busy)}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                    {isAttentionRequiredItem ? (
                      isStandardWorkflow ? (
                      <div className="mt-2 grid gap-2">
                        <label className="grid gap-1 text-xs text-[color:var(--text-secondary)]">
                          <span>Priority rank ({priorityRanks[recommendationDraft.priorityLevel]})</span>
                          <select
                            className="theme-input-control w-full rounded-[10px] px-2 py-2 text-xs"
                            value={recommendationDraft.priorityLevel}
                            onChange={(event) => {
                              updateStructuredRecommendationDraft(
                                item,
                                { priorityLevel: event.target.value as "P1" | "P2" | "P3" | "P4" },
                                true,
                              );
                            }}
                          >
                            <option value="P1">{priorityDescriptions.P1}</option>
                            <option value="P2">{priorityDescriptions.P2}</option>
                            <option value="P3">{priorityDescriptions.P3}</option>
                            <option value="P4">{priorityDescriptions.P4}</option>
                          </select>
                        </label>
                        <input
                          className="theme-input-control w-full rounded-[10px] px-2 py-2 text-xs"
                          placeholder="Issue observed"
                          value={recommendationDraft.issueObserved}
                          onChange={(event) => {
                            updateStructuredRecommendationDraft(item, { issueObserved: event.target.value }, true);
                          }}
                          onBlur={() => {
                            commitStructuredRecommendationDraft(item);
                          }}
                        />
                        <input
                          className="theme-input-control w-full rounded-[10px] px-2 py-2 text-xs"
                          placeholder="Risk if ignored"
                          value={recommendationDraft.riskIfIgnored}
                          onChange={(event) => {
                            updateStructuredRecommendationDraft(item, { riskIfIgnored: event.target.value }, true);
                          }}
                          onBlur={() => {
                            commitStructuredRecommendationDraft(item);
                          }}
                        />
                        <input
                          className="theme-input-control w-full rounded-[10px] px-2 py-2 text-xs"
                          placeholder="Recommended action"
                          value={recommendationDraft.recommendedAction}
                          onChange={(event) => {
                            updateStructuredRecommendationDraft(item, { recommendedAction: event.target.value }, true);
                          }}
                          onBlur={() => {
                            commitStructuredRecommendationDraft(item);
                          }}
                        />
                      </div>
                    ) : (
                      <textarea
                        className="theme-input-control mt-2 w-full rounded-[10px] px-2 py-2 text-xs"
                        placeholder="Recommendation"
                        defaultValue={item.recommendation_text ?? ""}
                        onBlur={async (event) => {
                          const value = event.target.value;
                          const normalizedValue = value.trim() ? value : null;
                          setLocalItems((current) =>
                            current.map((entry) => (entry.id === item.id ? { ...entry, recommendation_text: normalizedValue } : entry))
                          );
                          setPendingItemPatches((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              recommendation_text: normalizedValue,
                            },
                          }));
                        }}
                      />
                      )
                    ) : null}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="theme-control-surface rounded-[12px] p-4 text-sm text-[color:var(--text-secondary)]">
              No inspection sections are available.
            </div>
          )}

          {workspace?.required_fields.length ? (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">Legal Required Fields</h3>
              <div className="space-y-2">
                {workspace.required_fields.map((field) => (
                  <div key={field.id} className="theme-control-surface rounded-[12px] p-3">
                    <p className="text-xs text-[color:var(--text-secondary)]">
                      {field.field_label}
                      {field.is_mandatory ? " *" : ""}
                    </p>
                    <input
                      className={`theme-input-control mt-2 w-full rounded-[10px] px-2 py-2 text-xs ${
                        field.is_mandatory && !field.is_satisfied ? "border-[color:var(--status-error-border)]" : ""
                      }`}
                      defaultValue={field.field_value ?? ""}
                      onBlur={async (event) => {
                        const data = await patchRequiredField(inspectionId, field.id, { field_value: event.target.value });
                        applyWorkspace(data);
                      }}
                    />
                    {field.is_mandatory && !field.is_satisfied ? (
                      <p className="mt-1 text-[11px] text-[color:var(--status-error-text)]">Required before Generate/Send.</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="theme-surface-card overflow-auto rounded-[18px] p-3">
          <div className="space-y-2">
            <div className="theme-control-surface rounded-[12px] p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Live Status</p>
              {workspace?.inspectionMeta.is_internal_draft ? (
                <p className="mt-2 rounded-[10px] border border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] px-2 py-1 text-xs text-[color:var(--status-warning-text)]">
                  Internal Draft / Not Sendable
                </p>
              ) : null}
              {workspace?.inspectionMeta.public_job_code ? (
                <div className="mt-2 space-y-1 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-soft)] px-2 py-2 text-xs text-[color:var(--text-secondary)]">
                  <p>Job Number: {workspace.inspectionMeta.public_job_code}</p>
                  <p>Quote Number: {workspace.inspectionMeta.quote_number}</p>
                  <p>Invoice Number: {workspace.inspectionMeta.invoice_number}</p>
                  <p>Report Number: {workspace.inspectionMeta.report_number}</p>
                </div>
              ) : null}
              {workspace?.inspectionMeta.workflow_type === "compliance_wett" ? (
                <div className="mt-2 space-y-1">
                  <p className="text-sm">{liveClientScoreOrCompliance.compliance_status}</p>
                  <p className={`text-xs ${missingWettFieldsCount > 0 ? "text-[color:var(--status-error-text)]" : "text-[color:var(--status-success-text)]"}`}>
                    {missingWettFieldsCount > 0
                      ? `${missingWettFieldsCount} mandatory legal field(s) missing`
                      : "All mandatory legal fields completed"}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm">
                  Safety Score: {liveClientScoreOrCompliance.score ?? 0}/{liveClientScoreOrCompliance.score_max ?? 100}
                </p>
              )}
              {workspace?.inspectionMeta.workflow_type === "gas_simplified" ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-[color:var(--text-secondary)]">Provincial Gas License (AB)</p>
                  <input
                    className="theme-input-control w-full rounded-[10px] px-2 py-2 text-xs"
                    placeholder="License Number"
                    value={gasLicenseNumber}
                    onChange={(event) => setGasLicenseNumber(event.target.value)}
                  />
                  <input
                    className="theme-input-control w-full rounded-[10px] px-2 py-2 text-xs"
                    placeholder="License Holder Name"
                    value={gasLicenseHolderName}
                    onChange={(event) => setGasLicenseHolderName(event.target.value)}
                  />
                  <button
                    className="theme-btn-secondary w-full rounded-[10px] px-2 py-2 text-xs"
                    onClick={async () => {
                      const data = await patchInspectionMeta(inspectionId, {
                        gas_license_number: gasLicenseNumber,
                        gas_license_holder_name: gasLicenseHolderName,
                      });
                      applyWorkspace(data);
                    }}
                  >
                    Save Gas License
                  </button>
                  {gasLicenseMissing ? (
                    <p className="text-[11px] text-[color:var(--status-error-text)]">License number and holder are required before Generate/Send.</p>
                  ) : (
                    <p className="text-[11px] text-[color:var(--status-success-text)]">Gas license information is complete.</p>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <span
                className="group relative w-full"
                title={generateDisabledTooltip}
                tabIndex={generateDisabledTooltip ? 0 : undefined}
              >
                <button
                  className="theme-btn-secondary w-full rounded-[10px] px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={async () => {
                    setSendFeedback(null);
                    setBusy("generate");
                    try {
                      await flushPendingItemPatches();
                      const data = await generateInspection(inspectionId);
                      applyWorkspace(data);
                      setError(null);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Generate failed.");
                    } finally {
                      setBusy(null);
                    }
                  }}
                  disabled={generateDisabled}
                  aria-label={generateDisabledTooltip ?? "Generate PDF"}
                >
                  {busy === "generate" ? "Generating PDF..." : "Generate PDF"}
                </button>
                {generateDisabledTooltip ? (
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-3 py-2 text-center text-[11px] text-[color:var(--text-secondary)] opacity-0 shadow-lg transition group-hover:opacity-100 group-focus:opacity-100">
                    {generateDisabledTooltip}
                  </span>
                ) : null}
              </span>
              <button
                className="theme-btn-primary w-full rounded-[10px] px-2 py-2 text-xs"
                onClick={async () => {
                  setSendFeedback(null);
                  setBusy("send");
                  try {
                    await flushPendingItemPatches();
                    const data = await sendInspection(inspectionId);
                    applyWorkspace(data);
                    setError(null);
                    const sentAt = data.inspectionMeta.sent_to_customer_at;
                    const lockedAt = data.inspectionMeta.locked_at;
                    if (sentAt && lockedAt) {
                      setSendFeedback({
                        type: "success",
                        message: "Report sent successfully and locked for editing.",
                      });
                    } else if (sentAt) {
                      setSendFeedback({
                        type: "success",
                        message: "Report sent successfully.",
                      });
                    } else {
                      setSendFeedback({
                        type: "success",
                        message: "Send request completed.",
                      });
                    }
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Send failed.";
                    setError(message);
                    setSendFeedback({
                      type: "error",
                      message,
                    });
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={sendDisabled}
                aria-busy={busy === "send"}
              >
                {busy === "send" ? "Sending Report..." : "Send Report"}
              </button>
            </div>
            {sendFeedback ? (
              <p className={`rounded-[10px] px-3 py-2 text-xs ${sendFeedback.type === "success" ? "theme-alert-success border" : "theme-alert-error border"}`}>
                {sendFeedback.message}
              </p>
            ) : sendDisabledReason ? (
              <p className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-soft)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                {sendDisabledReason}
              </p>
            ) : null}
            {workspace?.inspectionMeta.is_internal_draft ? (
              <p className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-soft)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                {workspace.inspectionMeta.draft_action_label}
              </p>
            ) : null}
            {workspace?.inspectionMeta.locked_at ? (
              <button
                className="theme-btn-secondary w-full rounded-[10px] px-2 py-2 text-xs"
                onClick={async () => {
                  setBusy("unlock");
                  try {
                    const data = await unlockInspectionForCorrection(inspectionId);
                    applyWorkspace(data);
                    setError(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Unlock failed.");
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={Boolean(busy)}
              >
                Unlock for Correction
              </button>
            ) : null}
            <div className="theme-control-surface rounded-[12px] p-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">PDF Preview</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="theme-btn-ghost rounded-[10px] px-2 py-1 text-xs"
                    onClick={() => setIsPreviewExpanded(true)}
                    disabled={!generatedPdfUrl}
                  >
                    Expand Preview
                  </button>
                  <button
                    className="theme-btn-ghost rounded-[10px] px-2 py-1 text-xs"
                    onClick={openGeneratedPdfInNewTab}
                    disabled={!workspace?.inspectionMeta.generated_pdf_at || !generatedPdfUrl}
                  >
                    Open PDF
                  </button>
                  <button
                    className="theme-btn-ghost rounded-[10px] px-2 py-1 text-xs"
                    onClick={downloadGeneratedPdf}
                    disabled={!workspace?.inspectionMeta.generated_pdf_at || !generatedPdfUrl}
                  >
                    Download PDF
                  </button>
                </div>
              </div>
              {generatedPdfUrl ? (
                <iframe title="pdf-preview" src={generatedPdfUrl} className="h-[420px] w-full rounded border border-[color:var(--border-subtle)]" />
              ) : (
                <p className="text-xs text-[color:var(--text-secondary)]">Generate report to preview PDF.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
      {previewModal}
      </main>
    );
  }

  return (
    <>
      {fileInputs}
      <InspectionArchiveModal
        open={isArchiveModalOpen}
        busy={busy === "archive"}
        error={archiveError}
        requiresStrongerReason={requiresStrongerArchiveReason}
        onClose={() => {
          if (busy !== "archive") {
            setIsArchiveModalOpen(false);
            setArchiveError(null);
          }
        }}
        onConfirm={(input) => {
          void handleArchive(input);
        }}
      />
      <InspectionWorkspaceDesk
        error={error}
        workspace={workspace}
        localItems={localItems}
        filteredItems={filteredItems}
        activeSectionKey={activeSectionKey}
        recommendationDrafts={recommendationDrafts}
        liveClientScoreOrCompliance={liveClientScoreOrCompliance}
        missingWettFieldsCount={missingWettFieldsCount}
        gasLicenseNumber={gasLicenseNumber}
        gasLicenseHolderName={gasLicenseHolderName}
        gasLicenseMissing={gasLicenseMissing}
        generateDisabled={generateDisabled}
        generateDisabledTooltip={generateDisabledTooltip}
        sendDisabled={sendDisabled}
        sendDisabledReason={sendDisabledReason}
        sendFeedback={sendFeedback}
        busy={busy}
        generatedPdfUrl={generatedPdfUrl}
        canManage={canManage}
        sessionRole={sessionRole}
        onSelectSection={setActiveSectionKey}
        onStatusChange={handleStatusChange}
        onOpenPhotoPicker={openItemPhotoPicker}
        onUpdateRecommendationDraft={updateStructuredRecommendationDraft}
        onCommitRecommendationDraft={commitStructuredRecommendationDraft}
        onRecommendationBlur={handleRecommendationBlur}
        onGasLicenseNumberChange={setGasLicenseNumber}
        onGasLicenseHolderNameChange={setGasLicenseHolderName}
        onSaveGasLicense={() => {
          void handleSaveGasLicense();
        }}
        onGenerate={() => {
          void handleGenerate();
        }}
        onMarkSentAndLock={() => {
          void handleMarkSentAndLock();
        }}
        onUnlock={() => {
          void handleUnlock();
        }}
        onExpandPreview={() => setIsPreviewExpanded(true)}
        onOpenPdf={openGeneratedPdfInNewTab}
        onDownloadPdf={downloadGeneratedPdf}
        onRequiredFieldBlur={(fieldId, value) => {
          void handleRequiredFieldBlur(fieldId, value);
        }}
        onOpenArchive={() => {
          setArchiveError(null);
          setIsArchiveModalOpen(true);
        }}
        onRestore={() => {
          void handleRestore();
        }}
      />
      {previewModal}
    </>
  );
}
