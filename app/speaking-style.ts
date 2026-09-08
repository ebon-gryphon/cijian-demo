import type { Message, Person } from './demo';

export type StyleSample = {
  id: string;
  text: string;
  source: 'message' | 'correction';
};
export type SpeakingStyle = {
  enabled: boolean;
  instructions: string;
  samples: StyleSample[];
};
export type SpeakingStyles = Record<Person, SpeakingStyle>;
export function emptyStyle(): SpeakingStyle {
  return { enabled: true, instructions: '', samples: [] };
}
export function normalizeStyle(value: unknown): SpeakingStyle {
  if (!value || typeof value !== 'object') return emptyStyle();
  const v = value as Partial<SpeakingStyle>;
  return {
    enabled: v.enabled !== false,
    instructions:
      typeof v.instructions === 'string' ? v.instructions.slice(0, 800) : '',
    samples: Array.isArray(v.samples)
      ? v.samples
          .filter(
            (s) =>
              s &&
              typeof s.id === 'string' &&
              typeof s.text === 'string' &&
              ['message', 'correction'].includes(s.source),
          )
          .slice(-40)
          .map((s) => ({
            id: s.id.slice(0, 100),
            text: s.text.slice(0, 500),
            source: s.source,
          }))
      : [],
  };
}
export function restoreStyles(value: unknown): SpeakingStyles {
  const v =
    value && typeof value === 'object'
      ? (value as Partial<SpeakingStyles>)
      : {};
  return { 林屿: normalizeStyle(v.林屿), 许知夏: normalizeStyle(v.许知夏) };
}
export function learnMessage(
  styles: SpeakingStyles,
  message: Message,
): SpeakingStyles {
  if (message.from === '此间' || !message.text.trim()) return styles;
  const current = styles[message.from];
  if (!current.enabled || current.samples.some((s) => s.id === message.id))
    return styles;
  return {
    ...styles,
    [message.from]: {
      ...current,
      samples: [
        ...current.samples,
        {
          id: message.id,
          text: message.text.trim().slice(0, 500),
          source: 'message' as const,
        },
      ].slice(-40),
    },
  };
}
export function correctStyle(
  style: SpeakingStyle,
  replyId: string,
  text: string,
): SpeakingStyle {
  if (!text.trim()) return style;
  return {
    ...style,
    samples: [
      ...style.samples.filter((s) => s.id !== replyId),
      {
        id: replyId,
        text: text.trim().slice(0, 500),
        source: 'correction' as const,
      },
    ].slice(-40),
  };
}
export function styleSummary(style: SpeakingStyle) {
  if (!style.samples.length)
    return '还没有学习样本。你接下来亲自发出的消息，会逐渐成为口吻参考。';
  const texts = style.samples.map((s) => s.text);
  const average = texts.reduce((n, t) => n + [...t].length, 0) / texts.length;
  const endings = ['呀', '啦', '呢', '哇', '嘛', '哦', '哈哈', '嘿嘿'].filter(
    (word) => texts.filter((t) => t.includes(word)).length >= 2,
  );
  const emoji = texts.filter((t) =>
    /\p{Extended_Pictographic}/u.test(t),
  ).length;
  return (
    [
      average < 25
        ? '常用简短表达'
        : average < 60
          ? '习惯用几句话说清楚'
          : '表达比较细致',
      emoji > texts.length / 3 ? '经常使用表情' : '较少使用表情',
      endings.length
        ? `重复出现的语气词：${endings.join('、')}`
        : '语气和称呼会参考你的原话',
    ].join('；') + '。'
  );
}
export function styleContext(style: SpeakingStyle) {
  if (!style.enabled)
    return {
      instructions: '使用自然、简洁的中性口吻，不模仿本人。',
      examples: [] as string[],
    };
  // Corrections have priority; recent genuine messages supply the remaining examples.
  const ordered = [
    ...style.samples.filter((s) => s.source === 'correction').slice(-4),
    ...style.samples.filter((s) => s.source === 'message').slice(-8),
  ];
  return {
    instructions: style.instructions,
    summary: styleSummary(style),
    preferredExamples: style.samples
      .filter((s) => s.source === 'correction')
      .slice(-4)
      .map((s) => s.text),
    examples: ordered.map((s) => s.text),
  };
}
