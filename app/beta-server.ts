import { getD1 } from '@/db';

export type BetaMember = {
  id: string;
  spaceId: string;
  displayName: string;
  role: 'host' | 'guest';
  receptionEnabled: boolean;
  manualBusy: boolean;
  lastSeenAt: number;
};

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function cleanDisplayName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 20);
}

export function cleanInviteCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function cleanMessage(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 1000);
}

export function cleanNonce(value: unknown) {
  if (typeof value !== 'string') return '';
  const nonce = value.trim();
  return /^[a-zA-Z0-9_-]{8,80}$/.test(nonce) ? nonce : '';
}

export function createInviteCode(
  random = crypto.getRandomValues(new Uint8Array(6)),
) {
  return Array.from(
    random,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join('');
}

export function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function readJson(request: Request, limit = 12_000) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new BetaError('请使用 JSON 请求', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new BetaError('请求为空');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new BetaError('请求内容过大', 413);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new BetaError('请求内容格式不正确');
  }
}

export class BetaError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function betaErrorResponse(error: unknown) {
  const status = error instanceof BetaError ? error.status : 500;
  if (!(error instanceof BetaError))
    console.error(
      'Diary storage error',
      error instanceof Error ? error.message : 'unknown',
    );
  const message =
    error instanceof BetaError ? error.message : '服务暂时不可用，请稍后重试';
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function requireMember(request: Request): Promise<BetaMember> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : (request.headers
        .get('cookie')
        ?.match(/(?:^|; )cijian_session=([a-f0-9]{64})(?:;|$)/)?.[1] ?? '');
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new BetaError('请重新进入双人日记', 401);
  const tokenHash = await hashToken(token);
  const member = await getD1()
    .prepare(
      `SELECT id, space_id AS spaceId, display_name AS displayName, role,
              reception_enabled AS receptionEnabled, manual_busy AS manualBusy,
              last_seen_at AS lastSeenAt
       FROM members WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first<BetaMember>();
  if (!member) throw new BetaError('日记身份已经失效，请重新进入', 401);
  await getD1()
    .prepare('UPDATE members SET last_seen_at = ? WHERE id = ?')
    .bind(Date.now(), member.id)
    .run();
  return {
    ...member,
    receptionEnabled: Boolean(member.receptionEnabled),
    manualBusy: Boolean(member.manualBusy),
  };
}

export async function sessionPayload(member: BetaMember) {
  const db = getD1();
  const space = await db
    .prepare('SELECT id, invite_code AS inviteCode FROM spaces WHERE id = ?')
    .bind(member.spaceId)
    .first<{ id: string; inviteCode: string }>();
  const partner = await db
    .prepare(
      `SELECT id, display_name AS displayName, role,
              reception_enabled AS receptionEnabled, manual_busy AS manualBusy,
              last_seen_at AS lastSeenAt
       FROM members WHERE space_id = ? AND id != ? LIMIT 1`,
    )
    .bind(member.spaceId, member.id)
    .first<Omit<BetaMember, 'spaceId'>>();
  if (!space) throw new BetaError('双人日记不存在', 404);
  return {
    member,
    space,
    partner: partner
      ? {
          ...partner,
          receptionEnabled: Boolean(partner.receptionEnabled),
          manualBusy: Boolean(partner.manualBusy),
        }
      : null,
  };
}
