export interface PublicLLMSettings {
  provider: string | null;
  ollamaHost: string | null;
  ollamaModel: string | null;
  openaiModel: string | null;
  anthropicModel: string | null;
  openaiApiKeyConfigured: boolean;
  anthropicApiKeyConfigured: boolean;
}

export function toPublicLLMSettings(config: {
  provider?: string;
  ollamaHost?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
}): PublicLLMSettings {
  return {
    provider: config.provider ?? null,
    ollamaHost: config.ollamaHost ?? null,
    ollamaModel: config.ollamaModel ?? null,
    openaiModel: config.openaiModel ?? null,
    anthropicModel: config.anthropicModel ?? null,
    openaiApiKeyConfigured: Boolean(config.openaiApiKey && config.openaiApiKey.trim().length > 0),
    anthropicApiKeyConfigured: Boolean(config.anthropicApiKey && config.anthropicApiKey.trim().length > 0),
  };
}
