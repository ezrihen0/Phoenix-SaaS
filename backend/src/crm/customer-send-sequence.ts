/**
 * Provider delivery runs before the customer-facing snapshot is committed.
 * A thrown deliver leaves the invoice unfrozen so it can be corrected and retried.
 * Document-number reservation stays with the caller and must be idempotent.
 */
export async function executeCustomerSend<TSnapshot>(steps: {
  reserveDocumentNumber: () => Promise<string>;
  buildUnsavedSnapshot: (documentNumber: string) => TSnapshot;
  deliver: (input: { documentNumber: string; snapshot: TSnapshot }) => Promise<void>;
  commitFrozenSnapshot: (input: { documentNumber: string; snapshot: TSnapshot }) => Promise<void>;
}) {
  const documentNumber = await steps.reserveDocumentNumber();
  const snapshot = steps.buildUnsavedSnapshot(documentNumber);
  await steps.deliver({ documentNumber, snapshot });
  await steps.commitFrozenSnapshot({ documentNumber, snapshot });
  return { documentNumber, snapshot };
}
