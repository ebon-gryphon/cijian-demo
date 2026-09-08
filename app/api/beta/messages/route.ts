import { createReceptionReply } from '@/app/beta-reception';
import {
  BetaError,
  betaErrorResponse,
  cleanMessage,
  cleanNonce,
  readJson,
  requireMember,
  sameOrigin,
  type BetaMember,
} from '@/app/beta-server';
import { getD1 } from '@/db';

const headers = { 'Cache-Control': 'no-store' };

type MessageRow = {
  id: string;
  text: string;
  authorType: 'human' | 'assistant';
  senderMemberId: string | null;
  senderName: string | null;
  assistantForMemberId: string | null;
  replyToId: string | null;
  pending: number;
  handled: number;
  replyMode: 'model' | 'local' | 'fallback' | null;
  sourcesJson: string;
  unresolvedJson: string;
  createdAt: number;
};

function publicMessage(row: MessageRow) {
  let sources: string[] = [];
  let unresolved: unknown[] = [];
  try {
    const parsed = JSON.parse(row.sourcesJson);
    if (Array.isArray(parsed))
      sources = parsed.filter((item) => typeof item === 'string');
  } catch {}
  try {
    const parsed = JSON.parse(row.unresolvedJson);
    if (Array.isArray(parsed)) unresolved = parsed;
  } catch {}
  return {
    id: row.id,
    text: row.text,
    authorType: row.authorType,
    senderMemberId: row.senderMemberId,
    senderName: row.senderName,
    assistantForMemberId: row.assistantForMemberId,
    replyToId: row.replyToId,
    pending: Boolean(row.pending),
    handled: Boolean(row.handled),
    replyMode: row.replyMode,
    sources,
    unresolved,
    createdAt: row.createdAt,
  };
}

const messageSelect = `
  SELECT messages.id, messages.text, messages.author_type AS authorType,
         messages.sender_member_id AS senderMemberId,
         members.display_name AS senderName,
         messages.assistant_for_member_id AS assistantForMemberId,
         messages.reply_to_id AS replyToId, messages.pending, messages.handled,
         messages.reply_mode AS replyMode, messages.sources_json AS sourcesJson,
         messages.unresolved_json AS unresolvedJson,
         messages.created_at AS createdAt
  FROM messages
  LEFT JOIN members ON members.id = messages.sender_member_id`;

export async function GET(request: Request) {
  try {
    const member = await requireMember(request);
    const result = await getD1()
      .prepare(
        `${messageSelect}
         WHERE messages.space_id = ?
         ORDER BY messages.created_at ASC, messages.id ASC
         LIMIT 200`,
      )
      .bind(member.spaceId)
      .all<MessageRow>();
    return Response.json(
      { messages: result.results.map(publicMessage) },
      { headers },
    );
  } catch (error) {
    return betaErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new BetaError('不支持跨站请求', 403);
    const member = await requireMember(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    const text = cleanMessage(body?.text);
    const clientNonce = cleanNonce(body?.clientNonce);
    if (!text) throw new BetaError('消息不能为空');
    if (!clientNonce) throw new BetaError('消息标识无效');
    const db = getD1();
    const existing = await db
      .prepare(
        `${messageSelect}
         WHERE messages.space_id = ? AND messages.client_nonce = ?`,
      )
      .bind(member.spaceId, clientNonce)
      .first<MessageRow>();
    if (existing)
      return Response.json({ message: publicMessage(existing) }, { headers });

    const incomingId = crypto.randomUUID();
    const createdAt = Date.now();
    await db
      .prepare(
        `INSERT INTO messages
         (id, space_id, sender_member_id, author_type, text, client_nonce, created_at)
         VALUES (?, ?, ?, 'human', ?, ?, ?)`,
      )
      .bind(incomingId, member.spaceId, member.id, text, clientNonce, createdAt)
      .run();
    const publicIncoming = publicMessage({
      id: incomingId,
      text,
      authorType: 'human',
      senderMemberId: member.id,
      senderName: member.displayName,
      assistantForMemberId: null,
      replyToId: null,
      pending: 0,
      handled: 0,
      replyMode: null,
      sourcesJson: '[]',
      unresolvedJson: '[]',
      createdAt,
    });

    const partnerRow = await db
      .prepare(
        `SELECT id, space_id AS spaceId, display_name AS displayName, role,
                reception_enabled AS receptionEnabled,
                manual_busy AS manualBusy, last_seen_at AS lastSeenAt
         FROM members WHERE space_id = ? AND id != ? LIMIT 1`,
      )
      .bind(member.spaceId, member.id)
      .first<BetaMember>();
    let assistantMessage = null;
    if (partnerRow) {
      const partner = {
        ...partnerRow,
        receptionEnabled: Boolean(partnerRow.receptionEnabled),
        manualBusy: Boolean(partnerRow.manualBusy),
      };
      const reply = await createReceptionReply(
        member,
        partner,
        incomingId,
        text,
      );
      if (reply) {
        const assistantId = crypto.randomUUID();
        const assistantCreatedAt = Date.now();
        await db
          .prepare(
            `INSERT OR IGNORE INTO messages
             (id, space_id, author_type, assistant_for_member_id, text,
              sources_json, unresolved_json, reply_to_id, pending, handled,
              reply_mode, client_nonce, created_at)
             VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          )
          .bind(
            assistantId,
            member.spaceId,
            partner.id,
            reply.text,
            JSON.stringify(reply.sources),
            JSON.stringify(reply.unresolved ?? []),
            incomingId,
            Number(Boolean(reply.pending)),
            reply.replyMode ?? 'local',
            `assistant_${incomingId}`,
            assistantCreatedAt,
          )
          .run();
        assistantMessage = publicMessage({
          id: assistantId,
          text: reply.text,
          authorType: 'assistant',
          senderMemberId: null,
          senderName: null,
          assistantForMemberId: partner.id,
          replyToId: incomingId,
          pending: Number(Boolean(reply.pending)),
          handled: 0,
          replyMode: reply.replyMode ?? 'local',
          sourcesJson: JSON.stringify(reply.sources),
          unresolvedJson: JSON.stringify(reply.unresolved ?? []),
          createdAt: assistantCreatedAt,
        });
      }
    }
    return Response.json(
      { message: publicIncoming, assistantMessage },
      { status: 201, headers },
    );
  } catch (error) {
    return betaErrorResponse(error);
  }
}
