import { AutomationWorkflowWorkspace } from "@/components/automations/automation-workflow-canvas";
import { requireServerRoles } from "@/lib/auth/server-session";

export default async function AutomationsPage() {
  const session = await requireServerRoles("/automations", ["owner", "admin", "office_admin", "dispatcher"]);
  const sessionRole = session.profile?.role ?? session.active_membership?.role ?? null;

  return (
    <AutomationWorkflowWorkspace
      sessionRole={sessionRole}
      permissions={session.permissions}
    />
  );
}
