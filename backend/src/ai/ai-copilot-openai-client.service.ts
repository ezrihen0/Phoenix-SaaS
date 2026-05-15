import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Minimal OpenAI Chat Completions client for Phase 2 Copilot Path B only.
 * No dependency on `openai` npm package — uses `fetch`.
 */
@Injectable()
export class AiCopilotOpenAiClient {
  private readonly logger = new Logger(AiCopilotOpenAiClient.name);

  constructor(private readonly configService: ConfigService) {}

  async tryCompleteUserPrompt(input: {
    userPrompt: string;
    featureKey: string;
  }): Promise<{ ok: true; text: string; modelId: string } | { ok: false; reasonCode: string }> {
    const apiKey = (
      this.configService.get<string>("OPENAI_API_KEY")
      ?? process.env.OPENAI_API_KEY
      ?? ""
    ).trim();

    if (!apiKey) {
      return { ok: false, reasonCode: "openai_api_key_missing" };
    }

    const model = (
      this.configService.get<string>("OPENAI_COPILOT_MODEL")
      ?? process.env.OPENAI_COPILOT_MODEL
      ?? "gpt-4o-mini"
    ).trim();

    const cappedPrompt = input.userPrompt.length > 12000 ? input.userPrompt.slice(0, 12000) : input.userPrompt;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: 400,
          messages: [
            {
              role: "system",
              content:
                "You draft short SMS follow-up messages for a field-service business. "
                + "Output plain text only, under 300 characters when possible. "
                + "Never confirm appointments, prices, or guarantees. "
                + "Never invent customer names or phone numbers not given in context.",
            },
            { role: "user", content: cappedPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        this.logger.warn(`openai_copilot_http_error status=${response.status} body=${errText.slice(0, 500)}`);
        return { ok: false, reasonCode: "openai_http_error" };
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";

      if (!text) {
        return { ok: false, reasonCode: "openai_empty_content" };
      }

      const normalized = text.length > 2000 ? text.slice(0, 2000) : text;
      return { ok: true, text: normalized, modelId: model };
    } catch (error) {
      this.logger.warn(`openai_copilot_fetch_failed: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, reasonCode: "openai_fetch_failed" };
    }
  }
}
