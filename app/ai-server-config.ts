import {
  AIError,
  DEFAULT_API_BASE_URL,
  normalizeApiBaseUrl,
} from './journal-ai';
import { BUILTIN_PROXY_BASES, textProtocol } from './ai-connections';
export type AIEnvironment = {
  DIARY_API_KEY?: string;
  DIARY_API_BASE_URL?: string;
  DIARY_API_PROTOCOL?: string;
  DIARY_TEXT_MODEL?: string;
  DIARY_IMAGE_MODEL?: string;
  DIARY_IMAGE_API_KEY?: string;
  DIARY_IMAGE_API_BASE_URL?: string;
  DIARY_ALLOWED_API_BASES?: string;
};
export function proxyBases(env: AIEnvironment) {
  return [
    ...new Set([
      ...BUILTIN_PROXY_BASES,
      normalizeApiBaseUrl(env.DIARY_API_BASE_URL),
      normalizeApiBaseUrl(env.DIARY_IMAGE_API_BASE_URL),
      ...(env.DIARY_ALLOWED_API_BASES || '')
        .split(',')
        .filter(Boolean)
        .map(normalizeApiBaseUrl),
    ]),
  ];
}
export function resolveAIConnection(
  body: Record<string, unknown>,
  env: AIEnvironment,
) {
  const supplied = typeof body.key === 'string' ? body.key.trim() : '';
  if (supplied.length > 4096) throw new AIError('API Key 过长');
  const image = body.action === 'image' || body.action === 'edit';
  if (supplied) {
    const baseUrl = normalizeApiBaseUrl(
      typeof body.apiBaseUrl === 'string'
        ? body.apiBaseUrl
        : DEFAULT_API_BASE_URL,
    );
    if (!proxyBases(env).includes(baseUrl))
      throw new AIError(
        '此自定义地址尚未配置站点转发。请在 AI 设置选择浏览器直连，或由部署者添加服务地址。',
        400,
      );
    const model = (value: unknown) => {
      if (typeof value !== 'string' || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(value))
        throw new AIError('请填写服务商提供的有效模型 ID');
      return value;
    };
    let protocol;
    try {
      protocol = textProtocol(body.protocol);
    } catch {
      throw new AIError('请选择支持的接口协议');
    }
    return {
      key: supplied,
      models: {
        baseUrl,
        protocol,
        text: image ? 'unused' : model(body.textModel),
        image: image ? model(body.imageModel) : 'unused',
      },
    };
  }
  // A request can never choose where deployment-managed credentials are sent.
  const baseUrl = image
    ? normalizeApiBaseUrl(env.DIARY_IMAGE_API_BASE_URL)
    : normalizeApiBaseUrl(env.DIARY_API_BASE_URL);
  return {
    key: image
      ? env.DIARY_IMAGE_API_KEY ||
        (baseUrl === normalizeApiBaseUrl(env.DIARY_API_BASE_URL)
          ? env.DIARY_API_KEY
          : '') ||
        ''
      : env.DIARY_API_KEY || '',
    models: {
      baseUrl,
      protocol: image
        ? ('openai' as const)
        : textProtocol(env.DIARY_API_PROTOCOL),
      text: env.DIARY_TEXT_MODEL || 'gpt-5-mini',
      image: env.DIARY_IMAGE_MODEL || 'gpt-image-2',
    },
  };
}
