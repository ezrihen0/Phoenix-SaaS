/**
 * Credential exposure scanner unit checks (no secret values printed).
 * Run: npm run security:secrets-check:unit --workspace backend
 */
import assert from "node:assert/strict";

import {
  findCredentialExposureInEnvExample,
  findCredentialExposureInSource,
  findUnsafeDefaultsInLocalEnv,
  isPlaceholderCredentialValue,
} from "./credential-exposure.policy";

assert.equal(isPlaceholderCredentialValue(""), true);
assert.equal(isPlaceholderCredentialValue("<set-in-local-env-only>"), true);
assert.equal(isPlaceholderCredentialValue("changeme"), true);

const placeholderExample = [
  "BACKEND_BOOTSTRAP_ADMIN_PASSWORD=<set-in-local-env-only>",
  "PHOENIX_OWNER_PASSWORD=",
  "DEEPSEEK_API_KEY=",
  "GEMINI_API_KEY=",
].join("\n");
assert.deepEqual(
  findCredentialExposureInEnvExample("backend/.env.example", placeholderExample),
  [],
  "Placeholder .env.example should pass.",
);

const defaultBootstrapExample = [
  "BACKEND_BOOTSTRAP_ADMIN_PASSWORD=Admin12345!",
].join("\n");
assert.ok(
  findCredentialExposureInEnvExample("backend/.env.example", defaultBootstrapExample).length > 0,
  ".env.example with known default bootstrap password should fail.",
);

const telnyxSource = "const key = 'KEY0123456789ABCDEF0123456789ABCDEF';";
assert.ok(
  findCredentialExposureInSource("backend/src/example.ts", telnyxSource).some((issue) => issue.includes("Telnyx")),
  "Tracked source with fake Telnyx-shaped key should fail.",
);

const openAiSource = "const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';";
assert.ok(
  findCredentialExposureInSource("backend/src/example.ts", openAiSource).some((issue) => issue.includes("OpenAI")),
  "Tracked source with fake OpenAI-shaped key should fail.",
);

const googleSource = "const key = 'AIzaSyAbcdefghijklmnopqrstuvwxyz123456';";
assert.ok(
  findCredentialExposureInSource("backend/src/example.ts", googleSource).some((issue) => issue.includes("Google")),
  "Tracked source with fake Google-shaped key should fail.",
);

assert.ok(
  findCredentialExposureInSource("backend/src/example.ts", 'MARKETING_OAUTH_SECRET_KEY="supersecretvalue123456"').length > 0,
  "Tracked source with hardcoded generic secret assignment should fail.",
);

const legitimateLocalEnv = [
  "TELNYX_API_KEY=KEY0123456789ABCDEF0123456789ABCDEF0123456789AB",
  "DEEPSEEK_API_KEY=ds-abcdefghijklmnopqrstuvwxyz12345",
].join("\n");
assert.deepEqual(
  findUnsafeDefaultsInLocalEnv(legitimateLocalEnv),
  [],
  "Legitimate non-empty gitignored local .env must not fail solely because secrets exist.",
);

console.log("secrets-check-unit-check: ok");
