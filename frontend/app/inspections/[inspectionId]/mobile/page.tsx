import { requireServerSession } from "@/lib/auth/server-session";
import { canManageInspections } from "@/components/inspections/inspection-labels";

import MobileWorkspaceClient from "./mobile-workspace-client";

export default async function MobileInspectionWorkspacePage({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const { inspectionId } = await params;
  const session = await requireServerSession(`/inspections/${inspectionId}/mobile`);

  return (
    <MobileWorkspaceClient
      inspectionId={inspectionId}
      canManage={canManageInspections(session.permissions)}
    />
  );
}
