import { getD1 } from '@/db';
import {
  JournalError,
  journalErrorResponse,
  requireMember,
  readJson,
  sameOrigin,
} from '@/app/journal-server';
import { validateEntry, type Entry } from '@/app/journal-model';
import { withoutRetiredExamples } from '@/app/retired-examples';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    const m = await requireMember(request);
    const rows = await getD1()
      .prepare(
        'SELECT content, revision, updated_at FROM diaries WHERE space_id = ? ORDER BY updated_at DESC',
      )
      .bind(m.spaceId)
      .all<{ content: string; revision: number; updated_at: number }>();
    return Response.json(
      {
        entries: await withoutRetiredExamples(
          rows.results.map((r) => ({
            ...JSON.parse(r.content),
            revision: r.revision,
            updatedAt: r.updated_at,
          })),
        ),
      },
      { headers },
    );
  } catch (e) {
    return journalErrorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new JournalError('不支持跨站请求', 403);
    const m = await requireMember(request);
    let entry: Entry;
    try {
      entry = validateEntry(await readJson(request, 80000));
    } catch (e) {
      if (e instanceof JournalError) throw e;
      throw new JournalError(e instanceof Error ? e.message : '日记格式不正确');
    }
    const db = getD1();
    for (const p of entry.pictures)
      for (const src of [p.src, p.original].filter(Boolean) as string[]) {
        if (src.startsWith('/api/diary/assets/')) {
          const found = await db
            .prepare(
              'SELECT id FROM diary_assets WHERE id = ? AND space_id = ?',
            )
            .bind(src.split('/').pop(), m.spaceId)
            .first();
          if (!found) throw new JournalError('图片不属于这本日记', 403);
        }
      }
    const existing = await db
      .prepare(
        'SELECT content, revision FROM diaries WHERE id = ? AND space_id = ?',
      )
      .bind(entry.id, m.spaceId)
      .first<{ content: string; revision: number }>();
    if (existing) {
      const old = JSON.parse(existing.content) as Entry;
      const other = m.role === 'host' ? 'guest' : 'host';
      if (old.notes[other] !== entry.notes[other])
        throw new JournalError(
          '对方的片段已更新或不能由你修改，请重新打开日记后合并',
          409,
        );
    } else if (entry.notes[m.role === 'host' ? 'guest' : 'host'].trim())
      throw new JournalError('新日记请先只填写自己的片段，对方加入后可以补写');
    const next = { ...entry, revision: entry.revision + 1 };
    const result = existing
      ? await db
          .prepare(
            'UPDATE diaries SET content = ?, revision = ?, updated_at = ? WHERE id = ? AND space_id = ? AND revision = ?',
          )
          .bind(
            JSON.stringify(next),
            next.revision,
            next.updatedAt,
            next.id,
            m.spaceId,
            entry.revision,
          )
          .run()
      : await db
          .prepare(
            'INSERT INTO diaries (id,space_id,content,revision,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(space_id,id) DO NOTHING',
          )
          .bind(
            next.id,
            m.spaceId,
            JSON.stringify({ ...next, revision: 1 }),
            next.updatedAt,
          )
          .run();
    if (
      (existing && entry.revision !== existing.revision) ||
      result.meta.changes !== 1
    )
      throw new JournalError(
        '对方刚刚更新了这一页。你的草稿已保留，请刷新记忆并合并后再保存',
        409,
      );
    return Response.json(
      { entry: { ...next, revision: existing ? next.revision : 1 } },
      { headers },
    );
  } catch (e) {
    return journalErrorResponse(e);
  }
}
