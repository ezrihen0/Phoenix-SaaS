/**
 * Part 2 customer/communications/intelligence checkpoint.
 * Fast static contract checks that complement DB-backed smoke tests.
 *
 * Run: npm run part2:checkpoint --workspace backend
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(__dirname, "..");
const repoRoot = join(__dirname, "..", "..", "..");
const errors: string[] = [];

function read(relativePath: string) {
  return readFileSync(join(sourceRoot, relativePath), "utf8");
}

function readRepo(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function expectIncludes(relativePath: string, token: string, message: string) {
  const source = read(relativePath);
  if (!source.includes(token)) {
    errors.push(`${relativePath}: ${message}`);
  }
}

function expectExcludes(relativePath: string, token: string, message: string) {
  const source = read(relativePath);
  if (source.includes(token)) {
    errors.push(`${relativePath}: ${message}`);
  }
}

function expectRepoIncludes(relativePath: string, token: string, message: string) {
  const source = readRepo(relativePath);
  if (!source.includes(token)) {
    errors.push(`${relativePath}: ${message}`);
  }
}

expectIncludes("messaging/txt/txt-conversation.entity.ts", "organization_id", "TXT conversations must persist organization_id.");
expectIncludes("messaging/txt/txt-message.entity.ts", "organization_id", "TXT messages must persist organization_id.");
expectIncludes("messaging/txt/txt-conversations.service.ts", "WHERE organization_id = ?", "TXT conversation reads must be org scoped.");
expectIncludes("messaging/txt/txt.service.ts", "matchCustomerByPhoneNormalized(fromNumberNormalized, organizationId)", "Inbound TXT customer matching must be scoped.");
expectIncludes("messaging/txt/txt.service.ts", "deliveryUpdate: true", "TXT delivery callbacks must reconcile outbound rows.");
expectIncludes("telephony/twilio-messages-webhook.controller.ts", "TWILIO_MESSAGES_WEBHOOK_ENABLED", "Twilio compatibility webhook must be disabled unless explicitly enabled.");
expectIncludes("telephony/twilio-messages-webhook.controller.ts", "verifyTwilioSignature", "Twilio compatibility webhook must verify signatures.");

expectIncludes("public/public-bookings.service.ts", "findOrCreateCustomerForBooking", "Public booking must create or link same-org prospect customers.");
expectIncludes("public/public-bookings.service.ts", "findRecentDuplicateLead", "Public booking must suppress duplicate/replayed requests.");
expectIncludes("customer-portal/customer-portal.service.ts", "setLock(\"pessimistic_write\")", "Portal magic-link redemption must lock against replay races.");
expectExcludes("customer-portal/customer-portal.service.ts", "organization_id: IsNull()", "Portal home must not read legacy org-null records.");
expectExcludes("warranty/warranty-certificates.service.ts", "organization_id: IsNull()", "Portal warranty reads must be strict-org scoped.");

expectIncludes("telephony/call-flow-settings.service.ts", "organizationId", "Call-flow settings must accept organization scope.");
expectIncludes("telephony/telnyx-webhook.service.ts", "resolveRecentCallSource(recentCall.to_number)", "Missed-call SMS must derive call organization settings from the owned destination number.");
expectIncludes("telephony/telnyx-webhook.service.ts", "evaluateActiveCallFlow(", "Inbound calls must evaluate call flow through the settings service.");

for (const controller of [
  "messaging/txt/txt.controller.ts",
  "messaging/messaging-short-link.controller.ts",
  "customer-portal/customer-portal.staff.controller.ts",
  "ai/ai.controller.ts",
  "marketing/marketing.controller.ts",
  "marketing/marketing-analytics.controller.ts",
  "marketing/marketing-automation.controller.ts",
  "marketing/marketing-campaign.controller.ts",
  "marketing/marketing-channels.controller.ts",
  "marketing/marketing-publish.controller.ts",
  "language-store/language-store.controller.ts",
  "language-store/customer-output-translation.controller.ts",
]) {
  expectIncludes(controller, "OperationalAccessGuard", "Part 2 staff controller must use OperationalAccessGuard.");
}

expectIncludes("ai/ai-chat.service.ts", "You cannot update CRM records, send messages, schedule jobs, change pricing, or take autonomous actions.", "AI chat prompt must remain advisory only.");
expectIncludes("ai/ai-operator-copilot.service.ts", "executeGuardedSmsSend", "SMS Copilot must send only through guarded confirmation.");
expectIncludes("language-store/customer-output-translation.service.ts", "assertTranslationGenerationAllowed", "Language Store generation must enforce entitlement gates.");
expectIncludes("language-store/customer-output-translation.service.ts", "translation_record_already_finalized", "Language Store final records must be immutable.");
expectRepoIncludes("frontend/components/marketing/marketing-content-studio.tsx", "can_enqueue_publishing", "Growth Center publishing controls must be capability gated.");
expectRepoIncludes("frontend/components/marketing/marketing-content-studio.tsx", "Publishing requires connected OAuth channels", "Approved drafts must explain when publishing is unavailable.");
expectIncludes("ai/ai-intelligence-failsafe-check.ts", "hydrateSmsDraftOutcomeTracking", "Part 2 AI fail-safe check script must exist.");
expectIncludes("marketing/growth-center-visible-alignment-check.ts", "MARKETING_PUBLISH_DISPATCHER_ENABLED", "Part 2 Growth Center visible alignment check must exist.");
expectIncludes("language-store/language-store-part2-contract-check.ts", "assertTranslationGenerationAllowed", "Part 2 Language Store contract check must exist.");

if (errors.length) {
  console.error("part2_regression_checkpoint_fail:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("part2_regression_checkpoint: ok");
