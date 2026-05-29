import { Injectable } from "@nestjs/common";

import { AiDeepSeekProviderService } from "./ai-deepseek-provider.service";

/**
 * Thin delegate — Copilot Phase 2 Path B behavior unchanged; tokens/cost live in DeepSeek provider.
 */
@Injectable()
export class AiCopilotDeepSeekClient {
  constructor(private readonly deepSeekProvider: AiDeepSeekProviderService) {}

  async tryCompleteUserPrompt(input: {
    userPrompt: string;
    featureKey: string;
  }): Promise<{ ok: true; text: string; modelId: string } | { ok: false; reasonCode: string }> {
    const outcome = await this.deepSeekProvider.tryCompleteUserPrompt(input);

    if (!outcome.ok) {
      const reasonCode = outcome.reasonCode === "provider_not_configured"
        ? "deepseek_api_key_missing"
        : outcome.reasonCode;
      return { ok: false, reasonCode };
    }

    return {
      ok: true,
      text: outcome.text,
      modelId: outcome.modelId,
    };
  }
}
