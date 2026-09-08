import {
  modelSettingsIssue,
  normalizeModelSettings,
} from './model-settings.ts';
import { people, type Memory, type Message } from './demo.ts';
import { normalizeStyle } from './speaking-style.ts';
import {
  decisionPattern,
  fragmentsOf,
  modelPrompt,
  parseModelReply,
  type ReceptionInput,
} from './reception-model.ts';

export function providerEndpoint(
  settings: ReturnType<typeof normalizeModelSettings>,
  allowedOrigins = '',
) {
  if (settings.provider === 'openai')
    return 'https://api.openai.com/v1/chat/completions';
  if (settings.provider === 'deepseek')
    return 'https://api.deepseek.com/chat/completions';
  const url = new URL(settings.baseUrl);
  const allowed = allowedOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !allowed.includes(url.origin)
  )
    throw new Error('此自定义接口尚未启用，请由部署者配置允许的 API 地址');
  return (
    url.href.replace(/\/$/, '').replace(/\/chat\/completions$/, '') +
    '/chat/completions'
  );
}
export function normalizeReceptionInput(value: unknown): ReceptionInput {
  if (!value || typeof value !== 'object') throw new Error('请求内容不完整');
  const v = value as ReceptionInput;
  if (
    !people.includes(v.active) ||
    !people.includes(v.partner) ||
    v.active === v.partner ||
    typeof v.text !== 'string' ||
    !v.text.trim() ||
    v.text.length > 1000 ||
    typeof v.replyToId !== 'string' ||
    v.replyToId.length > 100
  )
    throw new Error('请求内容不正确');
  const memories: Memory[] = Array.isArray(v.memories)
    ? v.memories
        .filter(
          (m) =>
            m &&
            typeof m.id === 'string' &&
            typeof m.text === 'string' &&
            typeof m.title === 'string' &&
            people.includes(m.owner) &&
            [...people, '我们'].includes(m.subject) &&
            Array.isArray(m.tags),
        )
        .slice(-100)
        .map((m) => ({ ...m, attachments: undefined }))
    : [];
  const messages: Message[] = Array.isArray(v.messages)
    ? v.messages
        .filter(
          (m) =>
            m &&
            [...people, '此间'].includes(m.from) &&
            typeof m.text === 'string',
        )
        .slice(-12)
    : [];
  return {
    text: v.text.trim(),
    active: v.active,
    partner: v.partner,
    replyToId: v.replyToId,
    style: normalizeStyle(v.style),
    memories,
    messages,
  };
}
export async function generateReception(
  body: unknown,
  fetcher: typeof fetch = fetch,
  allowedOrigins = '',
  signal?: AbortSignal,
) {
  const b = body as { input?: unknown; settings?: unknown };
  const input = normalizeReceptionInput(b?.input);
  const settings = normalizeModelSettings(b?.settings);
  const issue = modelSettingsIssue(settings);
  if (issue) throw new Error(issue);
  const endpoint = providerEndpoint(settings, allowedOrigins);
  const fragments = fragmentsOf(input.text);
  if (fragments.every((text) => decisionPattern.test(text))) {
    return JSON.stringify({
      parts: fragments.map((_, index) => ({
        index,
        action: 'handoff',
        text: '',
        sourceIds: [],
        reason: 'relationship',
      })),
    });
  }
  const response = await fetcher(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: modelPrompt(input),
      response_format: { type: 'json_object' },
      ...(settings.provider === 'openai'
        ? { max_completion_tokens: 2400, reasoning_effort: 'low' }
        : { max_tokens: 2400 }),
      ...(settings.provider === 'deepseek'
        ? { thinking: { type: 'disabled' } }
        : {}),
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    // Never forward provider bodies: they may contain credentials or user content.
    if (response.status === 401 || response.status === 403)
      throw new Error('API Key 无效或没有模型权限，请检查模型设置');
    if (response.status === 429)
      throw new Error('模型额度不足或请求过于频繁，请稍后再试');
    throw new Error('模型服务暂时不可用，请检查模型与接口设置');
  }
  const data = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[];
  };
  const choice = data.choices?.[0];
  if (
    choice?.finish_reason !== 'stop' ||
    typeof choice.message?.content !== 'string'
  )
    throw new Error('模型没有返回完整回复，请稍后再试');
  parseModelReply(choice.message.content, input);
  return choice.message.content;
}
