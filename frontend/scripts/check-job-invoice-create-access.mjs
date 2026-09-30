import assert from "node:assert/strict";

function canManageJobInvoiceForAssignedJob(session, assignedTechnicianId) {
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

const techSession = {
  permissions: ["invoices.assigned.manage"],
  technician: { id: "tech-1" },
};

assert.equal(canManageJobInvoiceForAssignedJob(techSession, "tech-1"), true);
assert.equal(canManageJobInvoiceForAssignedJob(techSession, "tech-2"), false);
assert.equal(canManageJobInvoiceForAssignedJob(techSession, null), false);
assert.equal(canManageJobInvoiceForAssignedJob(techSession, ""), false);

assert.equal(
  canManageJobInvoiceForAssignedJob(
    { permissions: ["invoices.manage"], technician: null },
    null,
  ),
  true,
);

assert.equal(
  canManageJobInvoiceForAssignedJob(
    { permissions: ["invoices.view"], technician: { id: "tech-1" } },
    "tech-1",
  ),
  false,
);

console.log("job-invoice-create-access check passed");
