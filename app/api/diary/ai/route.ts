import { env } from 'cloudflare:workers';
import { readJson, sameOrigin, requireMember } from '@/app/beta-server';
import { AIError, generateJournal } from '@/app/journal-ai';
const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
  return Response.json(
    {
      configured: Boolean(env.DIARY_API_KEY),
      textModel: env.DIARY_TEXT_MODEL || 'gpt-5-mini',
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
    const supplied =
      typeof body.key === 'string' ? body.key.trim().slice(0, 512) : '';
    if (!supplied && env.DIARY_API_KEY) await requireMember(request);
    const key = supplied || env.DIARY_API_KEY || '';
    const model = (v: unknown, fallback: string) =>
      typeof v === 'string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(v)
        ? v
        : fallback;
    const models = {
      text: supplied
        ? model(body.textModel, 'gpt-5-mini')
        : env.DIARY_TEXT_MODEL || 'gpt-5-mini',
      image: supplied
        ? model(body.imageModel, 'gpt-image-2')
        : env.DIARY_IMAGE_MODEL || 'gpt-image-2',
    };
    return Response.json(
      await generateJournal(body, key, models, fetch, request.signal),
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AIError
            ? e.message
            : '生成中断或服务暂时不可用，内容已保留，请重试',
      },
      { status: e instanceof AIError ? e.status : 503, headers },
    );
  }
}
