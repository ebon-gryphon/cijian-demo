import type { Person } from './demo';

export type ModelProvider = 'openai' | 'deepseek' | 'custom';

export type ModelSettings = {
  provider: ModelProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
};

export const MODEL_PROVIDERS: Record<
  ModelProvider,
  {
    label: string;
    defaultModel: string;
    models: { value: string; label: string }[];
  }
> = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-5.2',
    models: [
      { value: 'gpt-5.2', label: 'GPT-5.2' },
      { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    defaultModel: 'deepseek-v4-flash',
    models: [
      { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    ],
  },
  custom: {
    label: '自定义兼容接口',
    defaultModel: '',
    models: [],
  },
};

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: 'openai',
  apiKey: '',
  model: MODEL_PROVIDERS.openai.defaultModel,
  baseUrl: '',
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeModelSettings(value: unknown): ModelSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_MODEL_SETTINGS };
  const candidate = value as Partial<ModelSettings>;
  const provider =
    typeof candidate.provider === 'string' &&
    Object.hasOwn(MODEL_PROVIDERS, candidate.provider)
      ? (candidate.provider as ModelProvider)
      : DEFAULT_MODEL_SETTINGS.provider;
  const available = MODEL_PROVIDERS[provider].models.map((item) => item.value);
  const requestedModel = cleanText(candidate.model, 120);
  return {
    provider,
    apiKey: cleanText(candidate.apiKey, 512),
    model:
      provider === 'custom'
        ? requestedModel
        : available.includes(requestedModel)
          ? requestedModel
          : MODEL_PROVIDERS[provider].defaultModel,
    baseUrl: provider === 'custom' ? cleanText(candidate.baseUrl, 500) : '',
  };
}

export function restoreModelSettings(
  value: unknown,
): Record<Person, ModelSettings> {
  const saved =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    林屿: normalizeModelSettings(saved.林屿),
    许知夏: normalizeModelSettings(saved.许知夏),
  };
}

export function modelSettingsIssue(settings: ModelSettings) {
  if (!settings.apiKey.trim()) return '请先填写 API Key';
  if (!settings.model.trim()) return '请填写模型 ID';
  if (settings.provider !== 'custom') return '';
  if (!settings.baseUrl.trim()) return '请填写 API 地址';
  try {
    const url = new URL(settings.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    return '请填写有效的 API 地址';
  }
  return '';
}

export function modelDisplayName(settings: ModelSettings) {
  const preset = MODEL_PROVIDERS[settings.provider].models.find(
    (item) => item.value === settings.model,
  );
  return preset?.label ?? (settings.model || '未选择模型');
}
