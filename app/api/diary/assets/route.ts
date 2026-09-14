import { env } from 'cloudflare:workers';
import { getD1 } from '@/db';
import {
  BetaError,
  betaErrorResponse,
  requireMember,
  sameOrigin,
  readJson,
} from '@/app/beta-server';
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new BetaError('不支持跨站请求', 403);
    const member = await requireMember(request);
    const b = (await readJson(request, 11500000)) as { data?: string };
    const match =
      typeof b.data === 'string'
        ? b.data.match(
            /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/,
          )
        : null;
    if (!match) throw new BetaError('图片格式不正确');
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 8 * 1024 * 1024)
      throw new BetaError('图片不能超过 8 MB');
    const valid =
      match[1] === 'image/png'
        ? bytes[0] === 137 &&
          bytes[1] === 80 &&
          bytes[2] === 78 &&
          bytes[3] === 71
        : match[1] === 'image/jpeg'
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
            String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!valid) throw new BetaError('文件内容与图片格式不一致');
    if (!env.JOURNAL_IMAGES)
      throw new BetaError('图片存储暂时不可用，请保留草稿稍后重试', 503);
    const id = crypto.randomUUID();
    const key = `${member.spaceId}/${id}`;
    await env.JOURNAL_IMAGES.put(key, bytes, {
      httpMetadata: { contentType: match[1] },
    });
    try {
      await getD1()
        .prepare(
          'INSERT INTO diary_assets (id,space_id,mime,created_at) VALUES (?,?,?,?)',
        )
        .bind(id, member.spaceId, match[1], Date.now())
        .run();
    } catch (e) {
      await env.JOURNAL_IMAGES.delete(key);
      throw e;
    }
    return Response.json(
      { src: `/api/diary/assets/${id}` },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return betaErrorResponse(e);
  }
}
