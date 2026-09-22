const ACTIONS = [
  { id: "job", permission: "jobs.create" },
  { id: "invoice", permission: "invoices.manage" },
  { id: "estimate", permission: "estimates.manage" },
  { id: "inspection", permission: "inspections.admin" },
  { id: "lead", permission: "leads.manage" },
  { id: "customer", permission: "customers.manage" },
];

function filterQuickCreateActions(permissions) {
  const permissionSet = new Set(permissions);
  return ACTIONS.filter((action) => permissionSet.has(action.permission));
}

function resolveQuickCreateHref(actionId, pathname) {
  const jobMatch = pathname.match(/^\/jobs\/([^/?#]+)/);
  const customerMatch = pathname.match(/^\/customers\/([^/?#]+)/);
  const uuid = /^[0-9a-f-]{36}$/i;
  const jobId = jobMatch?.[1] && uuid.test(jobMatch[1]) ? jobMatch[1] : null;
  const customerId = customerMatch?.[1] && uuid.test(customerMatch[1]) ? customerMatch[1] : null;

  switch (actionId) {
    case "job":
      return customerId ? `/jobs/new?customerId=${encodeURIComponent(customerId)}` : "/jobs/new";
    case "invoice":
      if (jobId) return `/invoices/create/${jobId}`;
      return customerId ? `/invoices/create?customerId=${encodeURIComponent(customerId)}` : "/invoices/create";
    case "estimate":
      if (jobId) return `/estimates/create/${jobId}`;
      return customerId ? `/estimates/create?customerId=${encodeURIComponent(customerId)}` : "/estimates/create";
    default:
      return "/";
  }
}

const ownerPermissions = ACTIONS.map((action) => action.permission);
const ownerActions = filterQuickCreateActions(ownerPermissions);

if (ownerActions.length !== ACTIONS.length) {
  throw new Error(`Expected ${ACTIONS.length} owner quick-create actions, received ${ownerActions.length}.`);
}

const technicianActions = filterQuickCreateActions([
  "jobs.assigned.view",
  "invoices.assigned.view",
  "estimates.assigned.view",
]);

if (technicianActions.length !== 0) {
  throw new Error("Technician default permissions should not expose quick-create actions without create grants.");
}

const jobContextInvoiceHref = resolveQuickCreateHref("invoice", "/jobs/11111111-1111-1111-1111-111111111111");
if (jobContextInvoiceHref !== "/invoices/create/11111111-1111-1111-1111-111111111111") {
  throw new Error(`Unexpected job-context invoice href: ${jobContextInvoiceHref}`);
}

const jobContextEstimateHref = resolveQuickCreateHref("estimate", "/jobs/11111111-1111-1111-1111-111111111111");
if (jobContextEstimateHref !== "/estimates/create/11111111-1111-1111-1111-111111111111") {
  throw new Error(`Unexpected job-context estimate href: ${jobContextEstimateHref}`);
}

console.log("quick-create-registry check passed");
