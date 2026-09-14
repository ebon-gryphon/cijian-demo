import {
  BetaError,
  betaErrorResponse,
  cleanDisplayName,
  cleanInviteCode,
  createInviteCode,
  createToken,
  hashToken,
  readJson,
  requireMember,
  sameOrigin,
  sessionPayload,
  type BetaMember,
} from '@/app/beta-server';
import { getD1 } from '@/db';

const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    return Response.json(await sessionPayload(await requireMember(request)), {
      headers,
    });
  } catch (error) {
    return betaErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new BetaError('不支持跨站请求', 403);
    const body = (await readJson(request)) as Record<string, unknown>;
    const action = body?.action;
    const displayName = cleanDisplayName(body?.displayName);
    if (displayName.length < 1) throw new BetaError('请输入你的称呼');
    if (action !== 'create' && action !== 'join')
      throw new BetaError('请选择创建或加入双人日记');

    const db = getD1();
    const now = Date.now();
    const token = createToken();
    const tokenHash = await hashToken(token);
    let member: BetaMember;

    if (action === 'create') {
      const spaceId = crypto.randomUUID();
      const memberId = crypto.randomUUID();
      let inviteCode = '';
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = createInviteCode();
        const existing = await db
          .prepare('SELECT id FROM spaces WHERE invite_code = ?')
          .bind(candidate)
          .first();
        if (!existing) {
          inviteCode = candidate;
          break;
        }
      }
      if (!inviteCode) throw new BetaError('邀请码生成失败，请重试', 503);
      await db.batch([
        db
          .prepare(
            'INSERT INTO spaces (id, invite_code, created_at) VALUES (?, ?, ?)',
          )
          .bind(spaceId, inviteCode, now),
        db
          .prepare(
            `INSERT INTO members
             (id, space_id, display_name, role, token_hash, reception_enabled,
              manual_busy, last_seen_at, created_at)
             VALUES (?, ?, ?, 'host', ?, 1, 0, ?, ?)`,
          )
          .bind(memberId, spaceId, displayName, tokenHash, now, now),
      ]);
      member = {
        id: memberId,
        spaceId,
        displayName,
        role: 'host',
        receptionEnabled: true,
        manualBusy: false,
        lastSeenAt: now,
      };
    } else {
      const inviteCode = cleanInviteCode(body?.inviteCode);
      if (inviteCode.length !== 6) throw new BetaError('请输入 6 位邀请码');
      const space = await db
        .prepare('SELECT id FROM spaces WHERE invite_code = ?')
        .bind(inviteCode)
        .first<{ id: string }>();
      if (!space) throw new BetaError('没有找到这个双人日记', 404);
      const count = await db
        .prepare('SELECT COUNT(*) AS total FROM members WHERE space_id = ?')
        .bind(space.id)
        .first<{ total: number }>();
      if ((count?.total ?? 0) >= 2)
        throw new BetaError('这个双人日记已经有两个人了', 409);
      const memberId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO members
           (id, space_id, display_name, role, token_hash, reception_enabled,
            manual_busy, last_seen_at, created_at)
           VALUES (?, ?, ?, 'guest', ?, 1, 0, ?, ?)`,
        )
        .bind(memberId, space.id, displayName, tokenHash, now, now)
        .run();
      member = {
        id: memberId,
        spaceId: space.id,
        displayName,
        role: 'guest',
        receptionEnabled: true,
        manualBusy: false,
        lastSeenAt: now,
      };
    }

    return Response.json(
      { token, ...(await sessionPayload(member)) },
      {
        status: 201,
        headers: {
          ...headers,
          'Set-Cookie': `cijian_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
        },
      },
    );
  } catch (error) {
    return betaErrorResponse(error);
  }
}
