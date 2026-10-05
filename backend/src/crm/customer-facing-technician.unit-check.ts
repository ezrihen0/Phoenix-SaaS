import assert from "node:assert/strict";

import {
  normalizeCustomerFacingTechnicianLabel,
  resolveCustomerFacingTechnicianIdentity,
  toPortalTechnicianIdentity,
} from "./customer-facing-technician";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

expect("trims and collapses customer-facing labels", () => {
  assert.equal(normalizeCustomerFacingTechnicianLabel("  Chris  "), "Chris");
  assert.equal(normalizeCustomerFacingTechnicianLabel("Lead   Technician"), "Lead Technician");
  assert.equal(normalizeCustomerFacingTechnicianLabel("   "), null);
  assert.equal(normalizeCustomerFacingTechnicianLabel(null), null);
});

expect("uses the dedicated public name and never falls back to internal display_name", () => {
  const identity = resolveCustomerFacingTechnicianIdentity({
    customer_facing_name: "Chris",
    customer_facing_title: "Lead Technician",
    customer_facing_photo_url: "https://cdn.example.com/chris.jpg",
  });

  assert.deepEqual(identity, {
    name: "Chris",
    title: "Lead Technician",
    photoUrl: "https://cdn.example.com/chris.jpg",
  });
});

expect("omits technician identity when the public name is unset", () => {
  const identity = resolveCustomerFacingTechnicianIdentity({
    customer_facing_name: null,
    customer_facing_title: "Technician",
    customer_facing_photo_url: null,
  });

  assert.equal(identity.name, null);
  assert.equal(identity.title, "Technician");
  assert.deepEqual(
    toPortalTechnicianIdentity({
      customer_facing_name: "   ",
      customer_facing_title: null,
      customer_facing_photo_url: null,
    }),
    {
      name: null,
      title: null,
      photo_url: null,
    },
  );
});

expect("does not read internal roster fields from a mixed technician record", () => {
  const technician = {
    display_name: "Eden Real Name",
    customer_facing_name: null,
    customer_facing_title: null,
    customer_facing_photo_url: null,
  };
  const identity = resolveCustomerFacingTechnicianIdentity(technician);
  assert.equal(identity.name, null);
  assert.notEqual(identity.name, technician.display_name);
});
