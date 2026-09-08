import { env } from 'cloudflare:workers';
import { getD1 } from '@/db';
import type { BetaMember } from './beta-server';
import type { Message, Person } from './demo';
import { generateReception } from './model-service';
import {
  fallbackReply,
  parseModelReply,
  type ReceptionInput,
} from './reception-model';
import { emptyStyle } from './speaking-style';

type ContextRow = {
  id: string;
  text: string;
  authorType: 'human' | 'assistant';
  senderMemberId: string | null;
  senderRole: 'host' | 'guest' | null;
  assistantForMemberId: string | null;
  createdAt: number;
};

function rolePerson(role: 'host' | 'guest'): Person {
  return role === 'host' ? '林屿' : '许知夏';
}

export async function createReceptionReply(
  sender: BetaMember,
  partner: BetaMember,
  incomingId: string,
  text: string,
) {
  if (!partner.receptionEnabled || !partner.manualBusy) return null;
  const context = await getD1()
    .prepare(
      `SELECT messages.id, messages.text, messages.author_type AS authorType,
              messages.sender_member_id AS senderMemberId,
              members.role AS senderRole,
              messages.assistant_for_member_id AS assistantForMemberId,
              messages.created_at AS createdAt
       FROM messages
       LEFT JOIN members ON members.id = messages.sender_member_id
       WHERE messages.space_id = ?
       ORDER BY messages.created_at DESC
       LIMIT 12`,
    )
    .bind(sender.spaceId)
    .all<ContextRow>();
  const rows = [...context.results].reverse();
  const active = rolePerson(sender.role);
  const assistantFor = rolePerson(partner.role);
  const recentMessages: Message[] = rows.map((row) => ({
    id: row.id,
    from:
      row.authorType === 'assistant'
        ? '此间'
        : rolePerson(row.senderRole ?? sender.role),
    text: row.text,
    sources: [],
    assistantFor:
      row.authorType === 'assistant'
        ? row.assistantForMemberId === partner.id
          ? assistantFor
          : active
        : undefined,
    sentAt: row.createdAt,
  }));
  const style = emptyStyle();
  style.samples = rows
    .filter(
      (row) => row.authorType === 'human' && row.senderMemberId === partner.id,
    )
    .slice(-8)
    .map((row) => ({
      id: row.id,
      text: row.text.slice(0, 500),
      source: 'message',
    }));
  const input: ReceptionInput = {
    text,
    active,
    partner: assistantFor,
    memories: [],
    messages: recentMessages,
    style,
    replyToId: incomingId,
  };

  const provider = env.BETA_MODEL_PROVIDER === 'openai' ? 'openai' : 'deepseek';
  const apiKey = env.BETA_MODEL_API_KEY?.trim() ?? '';
  if (!apiKey) return fallbackReply(input);
  const model =
    env.BETA_MODEL_MODEL?.trim() ||
    (provider === 'openai' ? 'gpt-5-mini' : 'deepseek-chat');
  try {
    const raw = await generateReception({
      input,
      settings: { provider, apiKey, model, baseUrl: '' },
    });
    return parseModelReply(raw, input);
  } catch {
    return fallbackReply(input, true);
  }
}
