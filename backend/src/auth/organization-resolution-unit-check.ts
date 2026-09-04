/**
 * Run: node -r ts-node/register src/auth/organization-resolution-unit-check.ts
 */
import assert from "node:assert/strict";

import type { MembershipEntity } from "../database/entities/membership.entity";
import type { OrganizationEntity } from "../database/entities/organization.entity";
import {
  filterSwitchableMemberships,
  rankMembershipsForDefaultSelection,
  selectDefaultMembership,
  shouldBlockBootstrapOrganizationSwitch,
  shouldRepairBootstrapOrganizationPreference,
} from "./organization-resolution.policy";

function membership(input: {
  id: string;
  organization_id: string;
  slug: string;
  created_at: string;
}): MembershipEntity {
  return {
    id: input.id,
    organization_id: input.organization_id,
    status: "active",
    created_at: new Date(input.created_at),
    organization: {
      id: input.organization_id,
      slug: input.slug,
      name: input.slug,
      is_active: true,
    } as OrganizationEntity,
  } as MembershipEntity;
}

const bootstrap = membership({
  id: "m-bootstrap",
  organization_id: "90137527-3fd0-435c-9032-358f7f670662",
  slug: "phoenix",
  created_at: "2024-01-01T00:00:00.000Z",
});

const operating = membership({
  id: "m-operating",
  organization_id: "5edc3ccd-efbd-4f74-9f99-d2b8c05ad644",
  slug: "phoenix-fireplace",
  created_at: "2026-08-31T00:00:00.000Z",
});

const ranked = rankMembershipsForDefaultSelection([bootstrap, operating]);
assert.equal(ranked[0]?.organization_id, operating.organization_id);

const selected = selectDefaultMembership([bootstrap, operating]);
assert.equal(selected?.organization_id, operating.organization_id);

assert.equal(
  shouldRepairBootstrapOrganizationPreference(
    bootstrap.organization,
    [bootstrap, operating],
  ),
  true,
);

assert.equal(
  shouldRepairBootstrapOrganizationPreference(
    operating.organization,
    [bootstrap, operating],
  ),
  false,
);

assert.equal(
  shouldRepairBootstrapOrganizationPreference(
    bootstrap.organization,
    [bootstrap],
  ),
  false,
);

const switchable = filterSwitchableMemberships([bootstrap, operating]);
assert.equal(switchable.length, 1);
assert.equal(switchable[0]?.organization_id, operating.organization_id);

assert.equal(
  shouldBlockBootstrapOrganizationSwitch(bootstrap.organization, [bootstrap, operating]),
  true,
);

assert.equal(
  shouldBlockBootstrapOrganizationSwitch(operating.organization, [bootstrap, operating]),
  false,
);

console.log("organization-resolution-unit-check: ok");
