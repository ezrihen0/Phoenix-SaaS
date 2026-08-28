/**
 * Stripe billing webhook contract documentation and static assertions.
 * Run: npm run billing:webhook-contract-check --workspace backend
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SUPPORTED_STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export const STRIPE_WEBHOOK_CONTRACT = {
  route: "POST /api/billing/webhooks/stripe",
  rawBodyRequired: true,
  signatureHeader: "stripe-signature",
  signatureRequired: true,
  nestRawBodyEnabled: true,
  supportedEvents: [...SUPPORTED_STRIPE_WEBHOOK_EVENTS],
  rejectionCodes: [
    "stripe_webhook_raw_body_missing",
    "stripe_webhook_signature_missing",
    "stripe_webhook_signature_invalid",
    "stripe_webhook_event_invalid",
  ],
} as const;

const sourceRoot = join(__dirname, "..");
const webhookControllerSource = readFileSync(join(sourceRoot, "billing/billing-webhook.controller.ts"), "utf8");
const webhookServiceSource = readFileSync(join(sourceRoot, "billing/stripe/stripe-webhook.service.ts"), "utf8");
const mainSource = readFileSync(join(sourceRoot, "main.ts"), "utf8");

assert.match(webhookControllerSource, /rawBody\?: Buffer/);
assert.match(webhookControllerSource, /stripe-signature/);
assert.match(webhookControllerSource, /handleWebhook\(request\.rawBody, signature\)/);

assert.match(webhookServiceSource, /stripe_webhook_raw_body_missing/);
assert.match(webhookServiceSource, /stripe_webhook_signature_missing/);
assert.match(webhookServiceSource, /constructWebhookEvent\(rawBody, signature/);

for (const eventType of SUPPORTED_STRIPE_WEBHOOK_EVENTS) {
  assert.match(webhookServiceSource, new RegExp(eventType.replace(/\./g, "\\.")));
}

assert.match(mainSource, /rawBody:\s*true/);
assert.match(webhookServiceSource, /StripeWebhookReceiptService/);

console.log(JSON.stringify(STRIPE_WEBHOOK_CONTRACT, null, 2));
console.log("billing:webhook-contract-check passed");
