export const customerOutputTranslationProviderToken = "CUSTOMER_OUTPUT_TRANSLATION_PROVIDER";

export type CustomerOutputTranslationProviderRequest = {
  sourceLanguageCode: string;
  sourceLanguageLabel: string;
  targetLanguageCode: "en";
  sourceText: string;
};

export type CustomerOutputTranslationProviderResult = {
  translatedText: string;
  providerKey: string;
  providerModel: string | null;
  providerRequestId: string | null;
};

export interface CustomerOutputTranslationProvider {
  translateToEnglish(
    input: CustomerOutputTranslationProviderRequest,
  ): Promise<CustomerOutputTranslationProviderResult>;
}

export class CustomerOutputTranslationProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerOutputTranslationProviderConfigurationError";
  }
}

export class CustomerOutputTranslationProviderExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerOutputTranslationProviderExecutionError";
  }
}
