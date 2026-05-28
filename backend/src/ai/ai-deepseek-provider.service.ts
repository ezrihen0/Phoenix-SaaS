import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AI_DEEPSEEK_PROVIDER_NAME } from "./ai.constants";

/** Static USD rates per 1M tokens — estimates only. */
const MODEL_COST_RATES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
};

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_BASE_URL = "https://api.deepseek.com";

export type AiDeepSeekCompletionResult =
  | {
      ok: true;
      text: string;
      modelId: string;
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
      estimatedCostUsd: number;
    }
  | { ok: false; reasonCode: string };

/**
 * DeepSeek Chat Completions boundary (OpenAI-compatible wire format).
 * Reads backend env only — never crashes when the key is missing.
 */
@Injectable()
export class AiDeepSeekProviderService {
  private readonly logger = new Logger(AiDeepSeekProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  readonly providerName = AI_DEEPSEEK_PROVIDER_NAME;

  isConfigured(): boolean {
    return this.readApiKey() !== "";
  }

  readConfiguredModelId(): string {
    return (
      this.configService.get<string>("DEEPSEEK_CHAT_MODEL")
      ?? process.env.DEEPSEEK_CHAT_MODEL
      ?? DEFAULT_MODEL
    ).trim();
  }

  readBaseUrl(): string {
    const raw = (
      this.configService.get<string>("DEEPSEEK_BASE_URL")
      ?? process.env.DEEPSEEK_BASE_URL
      ?? DEFAULT_BASE_URL
    ).trim();
    return raw.replace(/\/+$/, "");
  }

  private readApiKey(): string {
    return (
      this.configService.get<string>("DEEPSEEK_API_KEY")
      ?? process.env.DEEPSEEK_API_KEY
      ?? ""
    ).trim();
  }

  private chatCompletionsUrl(): string {
    return `${this.readBaseUrl()}/chat/completions`;
  }

  estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
    const rates = MODEL_COST_RATES_USD_PER_1M[modelId]
      ?? MODEL_COST_RATES_USD_PER_1M[DEFAULT_MODEL];
    const inputCost = (inputTokens / 1_000_000) * rates.input;
    const outputCost = (outputTokens / 1_000_000) * rates.output;
    return Number((inputCost + outputCost).toFixed(6));
  }

  async completeChat(input: {
    userPrompt: string;
    systemPrompt: string;
    maxTokens?: number;
    temperature?: number;
    maxOutputChars?: number;
  }): Promise<AiDeepSeekCompletionResult> {
    const apiKey = this.readApiKey();
    if (!apiKey) {
      return { ok: false, reasonCode: "provider_not_configured" };
    }

    const model = this.readConfiguredModelId();
    const cappedPrompt = input.userPrompt.length > 12000 ? input.userPrompt.slice(0, 12000) : input.userPrompt;
    const startedAt = Date.now();

    try {
      const response = await fetch(this.chatCompletionsUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: input.temperature ?? 0.35,
          max_tokens: input.maxTokens ?? 800,
          messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content: cappedPrompt },
          ],
        }),
      });

      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        this.logger.warn(`deepseek_http_error status=${response.status} body=${errText.slice(0, 500)}`);
        return { ok: false, reasonCode: "deepseek_http_error" };
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";

      if (!text) {
        return { ok: false, reasonCode: "deepseek_empty_content" };
      }

      const maxChars = input.maxOutputChars ?? 4000;
      const normalized = text.length > maxChars ? text.slice(0, maxChars) : text;
      const inputTokens = body.usage?.prompt_tokens ?? 0;
      const outputTokens = body.usage?.completion_tokens ?? 0;

      return {
        ok: true,
        text: normalized,
        modelId: model,
        inputTokens,
        outputTokens,
        latencyMs,
        estimatedCostUsd: this.estimateCostUsd(model, inputTokens, outputTokens),
      };
    } catch (error) {
      this.logger.warn(`deepseek_fetch_failed: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, reasonCode: "deepseek_fetch_failed" };
    }
  }

  /** Copilot SMS draft path — short output, dedicated system prompt. */
  async tryCompleteUserPrompt(input: {
    userPrompt: string;
    featureKey: string;
  }): Promise<AiDeepSeekCompletionResult> {
    return this.completeChat({
      userPrompt: input.userPrompt,
      systemPrompt:
        "You draft short SMS follow-up messages for a field-service business. "
        + "Output plain text only, under 300 characters when possible. "
        + "Never confirm appointments, prices, or guarantees. "
        + "Never invent customer names or phone numbers not given in context.",
      maxTokens: 400,
      temperature: 0.35,
      maxOutputChars: 2000,
    });
  }
}
