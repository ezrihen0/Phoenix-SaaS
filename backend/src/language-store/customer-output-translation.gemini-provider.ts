import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  CustomerOutputTranslationProviderConfigurationError,
  CustomerOutputTranslationProviderExecutionError,
  type CustomerOutputTranslationProvider,
  type CustomerOutputTranslationProviderRequest,
  type CustomerOutputTranslationProviderResult,
} from "./customer-output-translation.provider";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_GENERATE_CONTENT_URL = "https://generativelanguage.googleapis.com/v1beta/models";

@Injectable()
export class GeminiCustomerOutputTranslationProvider implements CustomerOutputTranslationProvider {
  constructor(private readonly configService: ConfigService) {}

  async translateToEnglish(
    input: CustomerOutputTranslationProviderRequest,
  ): Promise<CustomerOutputTranslationProviderResult> {
    const apiKey = this.configService.get<string>("GEMINI_API_KEY")?.trim() ?? "";
    if (!apiKey) {
      throw new CustomerOutputTranslationProviderConfigurationError(
        "Gemini translation is not configured. Set GEMINI_API_KEY in the backend environment.",
      );
    }

    const model = this.configService.get<string>("GEMINI_MODEL")?.trim() || DEFAULT_GEMINI_MODEL;
    const response = await fetch(
      `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "Translate the provided field-service customer-facing text into clear, professional English. Preserve meaning, units, quantities, punctuation, and line breaks. Return only the English output with no explanation.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    `Source language: ${input.sourceLanguageLabel} (${input.sourceLanguageCode})`,
                    `Target language: English (${input.targetLanguageCode})`,
                    "Translate this customer-facing text:",
                    input.sourceText,
                  ].join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      },
    );

    const payload = await response.json().catch(() => null) as GeminiGenerateContentResponse | null;
    if (!response.ok) {
      const providerMessage = payload?.error?.message?.trim() || `Gemini returned HTTP ${response.status}.`;
      throw new CustomerOutputTranslationProviderExecutionError(providerMessage);
    }

    const translatedText = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!translatedText) {
      throw new CustomerOutputTranslationProviderExecutionError(
        "Gemini returned an empty translation response.",
      );
    }

    return {
      translatedText,
      providerKey: "gemini",
      providerModel: payload?.modelVersion?.trim() || model,
      providerRequestId: readProviderRequestId(response),
    };
  }
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  modelVersion?: string;
  error?: {
    message?: string;
  };
};

function readProviderRequestId(response: Response) {
  return response.headers.get("x-request-id")
    ?? response.headers.get("x-goog-request-id")
    ?? null;
}
