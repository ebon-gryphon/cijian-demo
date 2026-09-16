export type TextProtocol = 'openai' | 'anthropic' | 'gemini';
export const AI_PRESETS: {
  id: string;
  name: string;
  baseUrl: string;
  protocol: TextProtocol;
  model: string;
}[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai',
    model: 'gpt-5-mini',
  },
  {
    id: 'mimo',
    name: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    protocol: 'openai',
    model: 'mimo-v2.5',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai',
    model: '',
  },
  {
    id: 'anthropic',
    name: 'Anthropic / Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    protocol: 'anthropic',
    model: '',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'gemini',
    model: '',
  },
];
export const BUILTIN_PROXY_BASES = [
  ...AI_PRESETS.map((p) => p.baseUrl),
  'https://api.deepseek.com',
  'https://ark.cn-beijing.volces.com/api/v3',
  'https://token-plan-cn.xiaomimimo.com/v1',
];
export function textProtocol(value: unknown): TextProtocol {
  if (value === undefined || value === 'openai') return 'openai';
  if (value === 'anthropic' || value === 'gemini') return value;
  throw new Error('请选择支持的接口协议');
}

export type ImageProtocol = 'openai' | 'gemini' | 'seedream';
export function imageProtocol(value: unknown): ImageProtocol {
  if (value === undefined || value === 'openai') return 'openai';
  if (value === 'gemini' || value === 'seedream') return value;
  throw new Error('请选择支持的图片接口协议');
}
export const IMAGE_PRESETS: {
  id: string;
  name: string;
  baseUrl: string;
  protocol: ImageProtocol;
  model: string;
}[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai',
    model: 'gpt-image-2',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'gemini',
    model: 'gemini-3.1-flash-image',
  },
  {
    id: 'seedream',
    name: '豆包 Seedream（火山引擎）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'seedream',
    model: '',
  },
];
