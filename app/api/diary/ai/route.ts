import { env } from 'cloudflare:workers';
import {
  readJson,
  sameOrigin,
  requireMember,
  JournalError,
} from '@/app/journal-server';
import {
  AIError,
  generateJournal,
  normalizeApiBaseUrl,
} from '@/app/journal-ai';
import { proxyBases, resolveAIConnection } from '@/app/ai-server-config';
import { imageProtocol, textProtocol } from '@/app/ai-connections';
const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
  return Response.json(
    {
      configured: Boolean(env.DIARY_API_KEY),
      imageConfigured: Boolean(
        env.DIARY_IMAGE_API_KEY ||
        (normalizeApiBaseUrl(env.DIARY_IMAGE_API_BASE_URL) ===
          normalizeApiBaseUrl(env.DIARY_API_BASE_URL) &&
          env.DIARY_API_KEY),
      ),
      apiBaseUrl: normalizeApiBaseUrl(env.DIARY_API_BASE_URL),
      imageApiBaseUrl: normalizeApiBaseUrl(env.DIARY_IMAGE_API_BASE_URL),
      protocol: textProtocol(env.DIARY_API_PROTOCOL),
      proxyBases: proxyBases(env),
      textModel: env.DIARY_TEXT_MODEL || 'gpt-5-mini',
      imageProtocol: imageProtocol(env.DIARY_IMAGE_API_PROTOCOL),
      imageModel: env.DIARY_IMAGE_MODEL || 'gpt-image-2',
    },
    { headers },
  );
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request))
      return Response.json(
        { error: '不支持跨站请求' },
        { status: 403, headers },
      );
    const body = (await readJson(request, 11500000)) as Record<string, unknown>;
    if (!body || typeof body !== 'object') throw new AIError('请求内容不正确');
    const { key, models } = resolveAIConnection(body, env);
    if (!(typeof body.key === 'string' && body.key.trim()) && key)
      await requireMember(request);
    return Response.json(
      await generateJournal(body, key, models, fetch, request.signal),
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AIError || e instanceof JournalError
            ? e.message
            : e instanceof Error && e.name === 'TimeoutError'
              ? '模型响应超时，片段已保留，请重试'
              : '生成中断或服务暂时不可用，内容已保留，请重试',
      },
      {
        status:
          e instanceof AIError || e instanceof JournalError ? e.status : 503,
        headers,
      },
    );
  }
}
