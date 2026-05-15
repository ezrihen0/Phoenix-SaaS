export const aiModelInvokerToken = Symbol("AI_MODEL_INVOKER");

/** Provider-neutral facade; Phase 0 always skips external HTTP. */
export type AiModelInvoker = {
  /** Human-readable provider label for persisted runs (often null). */
  readonly descriptor: string;
  invoke(_input: { featureKey: string; organizationId: string }): Promise<{ skipped: true; reasonCode: string }>;
};
