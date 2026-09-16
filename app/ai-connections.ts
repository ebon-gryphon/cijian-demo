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
  'https://token-plan-cn.xiaomimimo.com/v1',
];
export function textProtocol(value: unknown): TextProtocol {
  if (value === undefined || value === 'openai') return 'openai';
  if (value === 'anthropic' || value === 'gemini') return value;
  throw new Error('请选择支持的接口协议');
}
