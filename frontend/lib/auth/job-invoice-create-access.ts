/**
 * Job-scoped invoice composer access (mirrors backend `canManageInvoiceResource`).
 */
export type JobInvoiceCreateSession = {
  permissions: string[];
  technician: { id: string } | null;
};

export function canManageJobInvoiceForAssignedJob(
  session: JobInvoiceCreateSession,
  assignedTechnicianId: string | null | undefined,
): boolean {
  if (session.permissions.includes("invoices.manage")) {
    return true;
  }

  if (!session.permissions.includes("invoices.assigned.manage")) {
    return false;
  }

  const technicianId = session.technician?.id?.trim();
  const assignedId = assignedTechnicianId?.trim();

  if (!technicianId || !assignedId) {
    return false;
  }

  return technicianId === assignedId;
}
