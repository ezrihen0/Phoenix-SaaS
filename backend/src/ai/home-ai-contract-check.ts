import assert from "node:assert/strict";

import { HOME_AI_TOOL_KEYS } from "./ai.constants";
import { resolveHomeAiRoleProfile } from "./home-ai-role-profiles";
import { HomeAiToolRegistryService, listRegisteredHomeAiToolKeys } from "./home-ai-tool-registry.service";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

const registry = new HomeAiToolRegistryService(null as never);
const definitions = registry.listToolDefinitions();

expect("exactly six home tools registered", () => {
  assert.equal(listRegisteredHomeAiToolKeys().length, 6);
  assert.deepEqual(listRegisteredHomeAiToolKeys(), [...HOME_AI_TOOL_KEYS]);
});

expect("all home tools are read-only", () => {
  assert.equal(definitions.every((tool) => tool.readOnly === true), true);
});

expect("every home tool has permission mapping and result limit", () => {
  for (const tool of definitions) {
    assert.ok(tool.permission);
    assert.ok(tool.resultLimit > 0);
  }
});

expect("quick prompts exist for core roles", () => {
  const roles = ["owner", "admin", "office_admin", "csr", "dispatcher", "technician"] as const;
  for (const role of roles) {
    const profile = resolveHomeAiRoleProfile({
      user: { id: "u1" },
      organization_id: "org1",
      membership: { role, custom_role_id: null, custom_permission_keys: null },
      profile: { id: "p1", role, full_name: "Test" },
    } as never);
    assert.ok(profile.quickPrompts.length > 0, `missing prompts for ${role}`);
  }

  const customProfile = resolveHomeAiRoleProfile({
    user: { id: "u1" },
    organization_id: "org1",
    membership: {
      role: "technician",
      custom_role_id: "cr1",
      custom_permission_keys: ["customers.view"],
      custom_role: { name: "Custom CSR" },
    },
    profile: { id: "p1", role: "technician", full_name: "Test" },
  } as never);
  assert.equal(customProfile.profileKey, "custom");
  assert.ok(customProfile.quickPrompts.length > 0);
});

expect("no forbidden mutation tools registered", () => {
  const forbidden = ["create", "update", "delete", "send", "assign", "book", "pay"];
  for (const tool of definitions) {
    const haystack = `${tool.key} ${tool.openAiTool.function.description}`.toLowerCase();
    for (const token of forbidden) {
      assert.equal(haystack.includes(`${token}_`), false, `forbidden token ${token} in ${tool.key}`);
    }
  }
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

console.log("home:ai:contract-check complete");
