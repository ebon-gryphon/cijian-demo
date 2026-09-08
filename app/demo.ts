export type Person = '林屿' | '许知夏';
export type Memory = {
  id: string;
  title: string;
  text: string;
  owner: Person;
  subject: Person | '我们';
  shared: boolean;
  confirmed: boolean;
  review?: 'pending' | 'confirmed' | 'disputed' | 'deferred';
  reviews?: {
    reviewer: Person;
    decision: 'confirmed' | 'disputed' | 'deferred';
    text: string;
    originalText: string;
  }[];
  tags: string[];
  attachments?: MemoryAttachment[];
};
export type MemoryAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: 'image' | 'video' | 'file';
};
export type Message = {
  id: string;
  from: Person | '此间';
  text: string;
  sources: string[];
  recipient?: Person;
  handled?: boolean;
  pending?: boolean;
  assistantFor?: Person;
  sentAt?: number;
  replyToId?: string;
  unresolved?: UnansweredPart[];
  replyMode?: 'model' | 'local' | 'fallback';
};
export type UnansweredPart = {
  text: string;
  reason: 'relationship' | 'emotion' | 'unknown';
  priority: number;
};
export const unansweredLabels = {
  relationship: '关系与决定 · 需要你亲自回应',
  emotion: '情绪与感受 · 请优先关心',
  unknown: '信息不足 · 需要你补充',
};

const relationshipPattern = /分手|结婚|爱不爱|承诺|保证|吵架|为什么不理|原谅/;
const emotionPattern = /难过|委屈|不开心|累|烦/;

export function unansweredPart(text: string): UnansweredPart {
  if (relationshipPattern.test(text))
    return { text, reason: 'relationship', priority: 0 };
  if (emotionPattern.test(text))
    return { text, reason: 'emotion', priority: 1 };
  return { text, reason: 'unknown', priority: 2 };
}

// Legacy replies were appended immediately after the incoming message.
// Link only that adjacent pair; never infer a handoff from an unassisted message.
export function migrateReplyLinks(messages: Message[]): Message[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    if (
      message.from !== '此间' ||
      message.replyToId ||
      !previous ||
      previous.from === '此间' ||
      previous.recipient !== message.recipient
    )
      return message;
    return {
      ...message,
      replyToId: previous.id,
      pending: previous.handled ? false : message.pending,
      unresolved: message.pending ? [unansweredPart(previous.text)] : [],
    };
  });
}

export function unansweredMessages(messages: Message[], person: Person) {
  return messages
    .flatMap((message, index) => {
      if (
        message.from === '此间' ||
        message.recipient !== person ||
        message.handled
      )
        return [];
      const reply = messages.find(
        (m) => m.from === '此间' && m.replyToId === message.id && m.pending,
      );
      if (!reply) return [];
      const parts = reply.unresolved?.length
        ? reply.unresolved
        : [unansweredPart(message.text)];
      return [
        {
          message,
          parts: [...parts].sort((a, b) => a.priority - b.priority),
          priority: Math.min(...parts.map((part) => part.priority)),
          index,
        },
      ];
    })
    .sort((a, b) => a.priority - b.priority || a.index - b.index);
}

export function completeHandoff(
  messages: Message[],
  messageId: string,
  person: Person,
): Message[] {
  const original = messages.find(
    (m) => m.id === messageId && m.from !== '此间' && m.recipient === person,
  );
  if (!original) return messages;
  return messages.map((m) =>
    m.id === messageId
      ? { ...m, handled: true }
      : m.from === '此间' && m.replyToId === messageId
        ? { ...m, pending: false, handled: true }
        : m,
  );
}
export function memoryStatus(m: Memory) {
  return m.review ?? (m.confirmed ? 'confirmed' : 'pending');
}
export function canReview(m: Memory, person: Person) {
  return (
    m.shared &&
    m.owner !== person &&
    (m.subject === person || m.subject === '我们')
  );
}
export function reviewMemory(
  m: Memory,
  person: Person,
  decision: 'confirmed' | 'disputed' | 'deferred',
  text = '',
): Memory {
  if (!canReview(m, person)) return m;
  return {
    ...m,
    confirmed: decision === 'confirmed',
    review: decision,
    reviews: [
      ...(m.reviews ?? []),
      { reviewer: person, decision, text: text.trim(), originalText: m.text },
    ],
  };
}
export function reviseMemory(
  m: Memory,
  updates: Pick<
    Memory,
    'title' | 'text' | 'subject' | 'shared' | 'tags' | 'attachments'
  >,
): Memory {
  const confirmed = updates.subject === m.owner;
  return {
    ...m,
    ...updates,
    confirmed,
    review: confirmed ? 'confirmed' : 'pending',
  };
}
export function assistantName(m: Message) {
  return m.from === '此间'
    ? `${m.assistantFor ?? m.recipient ?? '此间'}（助手）`
    : m.from;
}
export const people: Person[] = ['林屿', '许知夏'];
export const initialMemories: Memory[] = [
  {
    id: 'time',
    title: '今天的忙碌时间',
    text: '今天开会到 18:30，结束后会看消息。',
    owner: '林屿',
    subject: '林屿',
    shared: true,
    confirmed: true,
    tags: ['忙', '几点', '什么时候', '开会', '下班'],
  },
  {
    id: 'care',
    title: '难过的时候，先听我说',
    text: '我难过的时候，希望先被听见。等我讲完，再一起想办法。',
    owner: '许知夏',
    subject: '许知夏',
    shared: true,
    confirmed: true,
    tags: ['难过', '委屈', '累', '烦', '不开心'],
  },
  {
    id: 'quiet',
    title: '安静不代表不在乎',
    text: '压力大的时候我会话少一点，缓一缓就好了。',
    owner: '林屿',
    subject: '林屿',
    shared: true,
    confirmed: true,
    tags: ['安静', '不说话', '沉默'],
  },
  {
    id: 'guess',
    title: '我以为你想一个人待着',
    text: '你难过的时候不太说话，我以为你想独处，所以经常先不打扰。',
    owner: '林屿',
    subject: '许知夏',
    shared: true,
    confirmed: false,
    tags: ['难过', '独处', '打扰'],
  },
  {
    id: 'weekend',
    title: '下一次见面',
    text: '我们约好这周六在杭州见面，一起去西湖散步。具体车次还没定。',
    owner: '许知夏',
    subject: '我们',
    shared: true,
    confirmed: true,
    tags: ['周末', '周六', '见面', '杭州', '西湖'],
  },
  {
    id: 'noodle',
    title: '下雨天的那碗面',
    text: '第一次去杭州的时候下了雨，我们在街角吃了热汤面。后来一到雨天，就会想起那顿晚饭。',
    owner: '林屿',
    subject: '我们',
    shared: true,
    confirmed: true,
    tags: ['雨', '面', '第一次', '回忆'],
  },
  {
    id: 'view',
    title: '你总会记住小事情',
    text: '我眼里的林屿很细心，会记住我随口说过的小事情。',
    owner: '许知夏',
    subject: '林屿',
    shared: true,
    confirmed: false,
    tags: ['细心', '记住'],
  },
];
export const initialMessages: Message[] = [
  {
    id: 'hello',
    from: '林屿',
    text: '下午有个会，我先忙一会儿。今天有什么小事，也可以先留在这里。',
    sources: [],
  },
  {
    id: 'hello2',
    from: '许知夏',
    text: '好呀，刚刚路过我们上次说的那家面馆。',
    sources: [],
  },
];
export const uid = () => Math.random().toString(36).slice(2);
function answerPart(
  text: string,
  active: Person,
  partner: Person,
  memories: Memory[],
): Message {
  const eligible = memories.filter(
    (m) => m.shared && m.confirmed && memoryStatus(m) === 'confirmed',
  );
  let reply =
    '这件事我还没有足够的信息。我会把你的原话留给' +
    partner +
    '，等本人回来接着聊。';
  let sources: string[] = [];
  let pending = true;
  const matches = eligible.filter(
    (m) => m.tags.some((t) => text.includes(t)) || text.includes(m.title),
  );
  const personal = matches.find(
    (m) => m.owner === partner && m.subject === partner,
  );
  const common = matches.find((m) => m.subject === '我们');
  if (relationshipPattern.test(text)) {
    reply =
      '这句话需要' +
      partner +
      '亲自回应。我会把它放在交接里，不替本人作决定或表达感情。';
  } else if (emotionPattern.test(text)) {
    const care = eligible.find(
      (m) => m.owner === active && m.subject === active && m.id === 'care',
    );
    reply =
      '听起来今天不太容易。你可以先把想说的留在这里，我会原样转给' +
      partner +
      '。' +
      (care ? '你说过「' + care.text + '」这份偏好也会一起提醒本人。' : '');
    sources = care ? [care.id] : [];
  } else if (
    (personal || common) &&
    !(
      /车次|几点出发|哪趟/.test(text) &&
      /还没定|尚未确定|不知道/.test((personal || common)!.text)
    )
  ) {
    const m = (personal || common)!;
    reply =
      (m.subject === '我们'
        ? '你们一起确认过这件事：「'
        : partner + '之前留下的信息是：「') +
      m.text +
      '」';
    sources = [m.id];
    pending = false;
  }
  return {
    id: uid(),
    from: '此间',
    assistantFor: partner,
    text: reply,
    sources,
    pending,
    recipient: partner,
  };
}

export function answer(
  text: string,
  active: Person,
  partner: Person,
  memories: Memory[],
  replyToId?: string,
): Message {
  // Keep literal fragments, not invented summaries. Separate questions can be
  // answered independently while sensitive clauses always remain for the human.
  const fragments = text
    .match(/[^。？！!?；;，,\n]+[。？！!?；;，,]?/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [text];
  const results = fragments.map((fragment) =>
    answerPart(fragment, active, partner, memories),
  );
  const unresolved = fragments.flatMap((fragment, i) =>
    results[i].pending ? [unansweredPart(fragment)] : [],
  );
  return {
    id: uid(),
    from: '此间',
    assistantFor: partner,
    recipient: partner,
    replyToId,
    sentAt: Date.now(),
    sources: [...new Set(results.flatMap((result) => result.sources))],
    text: [...new Set(results.map((result) => result.text))].join('\n\n'),
    pending: unresolved.length > 0,
    unresolved,
  };
}
