export function paymentAttemptFingerprint(attempt) {
  return `${attempt.amountCents}|${attempt.method}|${attempt.note}`;
}

/**
 * One payment attempt owns one idempotency key until it succeeds
 * or the amount, method, or note changes.
 */
export function resolvePaymentAttempt(previous, attempt, createKey) {
  const fingerprint = paymentAttemptFingerprint(attempt);
  if (previous && !previous.succeeded && previous.fingerprint === fingerprint) {
    return previous;
  }

  return {
    fingerprint,
    idempotencyKey: createKey(),
    succeeded: false,
  };
}
