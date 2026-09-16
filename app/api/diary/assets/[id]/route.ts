import { env } from 'cloudflare:workers';
import { getD1 } from '@/db';
import { JournalError, journalErrorResponse, requireMember } from '@/app/journal-server';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireMember(request);
    const { id } = await params;
    const asset = await getD1()
      .prepare('SELECT mime FROM diary_assets WHERE id = ? AND space_id = ?')
      .bind(id, member.spaceId)
      .first<{ mime: string }>();
    if (!asset) throw new JournalError('图片不存在', 404);
    const object = await env.JOURNAL_IMAGES.get(`${member.spaceId}/${id}`);
    if (!object) throw new JournalError('图片暂时无法读取', 404);
    return new Response(object.body, {
      headers: {
        'Content-Type': asset.mime,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return journalErrorResponse(e);
  }
}
