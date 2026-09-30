import assert from "node:assert/strict";

import { resolvePaymentAttempt } from "../lib/crm/invoice-payment-attempt.mjs";

let issued = 0;
function createKey() {
  issued += 1;
  return `key-${issued}`;
}

const first = resolvePaymentAttempt(null, { amountCents: 10_000, method: "cash", note: "Recorded from invoice workflow." }, createKey);
const retried = resolvePaymentAttempt(first, { amountCents: 10_000, method: "cash", note: "Recorded from invoice workflow." }, createKey);
assert.equal(retried.idempotencyKey, first.idempotencyKey);
assert.equal(issued, 1);

const changedAmount = resolvePaymentAttempt(retried, { amountCents: 5_000, method: "cash", note: "Recorded from invoice workflow." }, createKey);
assert.notEqual(changedAmount.idempotencyKey, first.idempotencyKey);

const succeeded = { ...changedAmount, succeeded: true };
const nextAttempt = resolvePaymentAttempt(succeeded, { amountCents: 5_000, method: "cash", note: "Recorded from invoice workflow." }, createKey);
assert.notEqual(nextAttempt.idempotencyKey, changedAmount.idempotencyKey);

const form = await import("node:fs").then((fs) => fs.readFileSync(new URL("../lib/crm/invoice-payment-form.tsx", import.meta.url), "utf8"));
assert.match(form, /resolvePaymentAttempt/);
assert.doesNotMatch(form, /idempotencyKey: crypto\.randomUUID\(\)/);

console.log("PASS payment attempt reuses one key until success or a new attempt");
console.log("check-invoice-payment-attempt complete");
