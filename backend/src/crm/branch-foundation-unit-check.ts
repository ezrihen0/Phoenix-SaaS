import assert from "node:assert/strict";

import { membershipSeesAllBranches } from "./branch-access";
import { BranchScopeService } from "./branch-scope.service";
import type { BranchEntity } from "../database/entities/branch.entity";
import {
  describeBranchProvinceCode,
  normalizeServiceProvinceToBranchCode,
} from "./branch-province-resolution";

function branchFixture(partial: Partial<BranchEntity>): BranchEntity {
  return {
    id: partial.id ?? "branch-id",
    organization_id: partial.organization_id ?? "org-id",
    name: partial.name ?? "Alberta",
    code: partial.code ?? "AB",
    phone: null,
    email: null,
    website: null,
    address_line: null,
    city: null,
    province: null,
    postal_code: null,
    logo_url: null,
    tax_label: partial.tax_label ?? "GST",
    default_tax_rate_bps: partial.default_tax_rate_bps ?? 500,
    tax_number: null,
    invoice_prefix: partial.invoice_prefix ?? "AB-INV-",
    estimate_prefix: partial.estimate_prefix ?? "AB-EST-",
    active: true,
    sort_order: partial.sort_order ?? 1,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

const scope = Object.create(BranchScopeService.prototype) as BranchScopeService;

assert.equal(membershipSeesAllBranches("owner"), true);
assert.equal(membershipSeesAllBranches("admin"), true);
assert.equal(membershipSeesAllBranches("technician"), false);

assert.equal(
  BranchScopeService.prototype.resolveDefaultTaxRateBps.call(
    scope,
    branchFixture({ tax_label: "GST", default_tax_rate_bps: 500 }),
  ),
  500,
);
assert.equal(
  BranchScopeService.prototype.resolveDefaultTaxRateBps.call(
    scope,
    branchFixture({ tax_label: "HST", default_tax_rate_bps: 1300, code: "ON" }),
  ),
  1300,
);

assert.equal(normalizeServiceProvinceToBranchCode("ab"), "AB");
assert.equal(normalizeServiceProvinceToBranchCode("Alberta"), "AB");
assert.equal(normalizeServiceProvinceToBranchCode(" on "), "ON");
assert.equal(normalizeServiceProvinceToBranchCode("Ontario"), "ON");
assert.equal(normalizeServiceProvinceToBranchCode("BC"), null);
assert.equal(describeBranchProvinceCode("AB"), "Alberta");

console.log("branch-foundation-unit-check: PASS");
