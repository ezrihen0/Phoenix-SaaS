import { Injectable } from "@nestjs/common";

import { automationRegistry } from "./automation-registry";

export type AutomationTokenValidationResult = {
  valid: boolean;
  unresolvedTokens: string[];
};

export type AutomationTemplateTokenValidationResult = {
  valid: boolean;
  usedTokens: string[];
  unknownTokens: string[];
};

@Injectable()
export class AutomationTemplateRendererService {
  renderTemplate(template: string, values: Record<string, string | number | null | undefined>) {
    return template.replace(/\{\{[^}]+\}\}/g, (token) => {
      const value = values[token];

      if (value === null || value === undefined || value === "") {
        return token;
      }

      return String(value);
    });
  }

  validateRenderedTemplate(preview: string): AutomationTokenValidationResult {
    const unresolvedTokens = preview.match(/\{\{[^}]+\}\}/g) ?? [];

    return {
      valid: unresolvedTokens.length === 0,
      unresolvedTokens,
    };
  }

  validateTemplateTokens(template: string): AutomationTemplateTokenValidationResult {
    const knownTokens = new Set(automationRegistry.tokenDefinitions.map((token) => token.token));
    const usedTokens = [...new Set(template.match(/\{\{[^}]+\}\}/g) ?? [])];
    const unknownTokens = usedTokens.filter((token) => !knownTokens.has(token));

    return {
      valid: unknownTokens.length === 0,
      usedTokens,
      unknownTokens,
    };
  }
}
