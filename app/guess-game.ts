import type { Person } from './demo';

export const guessQuestions = [
  { id: 'evening', tag: '日常的小偏好', text: '忙了一整天，今晚你最想怎么过？', options: ['一起散步', '吃点好的', '各自放空', '抱着看剧'] },
  { id: 'surprise', tag: '被惦记的瞬间', text: '突然收到哪一种小惊喜，你会最开心？', options: ['一段认真写的话', '喜欢吃的东西', '一次悄悄安排的见面', '一张随手拍的日常'] },
  { id: 'weekend', tag: '下次见面', text: '空出一个周末，你最想一起去哪里？', options: ['有风的海边', '安静的山里', '热闹的小城', '就在家里'] },
  { id: 'comfort', tag: '靠近一点点', text: '今天有点累，你更希望对方怎么陪你？', options: ['先听我慢慢说', '给我一个拥抱', '一起做点开心的事', '让我安静一小会儿'] },
  { id: 'rain', tag: '两个人的天气', text: '约会遇上下雨，你会更想做什么？', options: ['找家小店喝热饮', '回家一起做饭', '撑伞继续逛逛', '找部电影看'] },
  { id: 'souvenir', tag: '把小事留下', text: '一起旅行回来，你最想留下什么？', options: ['一张合照', '一件当地小物', '一本随手写的日记', '一道一起学会的菜'] },
  { id: 'morning', tag: '慢一点的生活', text: '难得不用早起，你理想的早晨是什么样？', options: ['睡到自然醒', '一起去吃早饭', '窝着聊聊天', '出门晒晒太阳'] },
  { id: 'distance', tag: '隔着距离的日常', text: '暂时见不到面时，哪件小事最让你觉得亲近？', options: ['睡前聊几分钟', '互发生活照片', '同时看一部电影', '收到一句想你了'] },
] as const;
export type GuessAnswer = { self: number; guess: number };
export type GuessRound = Partial<Record<Person, GuessAnswer>>;
export type GuessState = { questionId: string; rounds: Record<string, GuessRound> };
export const initialGuessState = (): GuessState => ({ questionId: guessQuestions[0].id, rounds: {} });
export function isRevealed(round: GuessRound) { return !!round.林屿 && !!round.许知夏; }
function validAnswer(value: unknown): value is GuessAnswer {
  if (!value || typeof value !== 'object') return false;
  const a = value as GuessAnswer;
  return Number.isInteger(a.self) && a.self >= 0 && a.self < 4 && Number.isInteger(a.guess) && a.guess >= 0 && a.guess < 4;
}
export function restoreGuessState(raw: unknown): GuessState {
  const result = initialGuessState();
  if (!raw || typeof raw !== 'object') return result;
  const source = raw as Partial<GuessState>;
  if (guessQuestions.some(q => q.id === source.questionId)) result.questionId = source.questionId!;
  if (source.rounds && typeof source.rounds === 'object') {
    for (const q of guessQuestions) {
      const round = source.rounds[q.id];
      if (!round || typeof round !== 'object') continue;
      const clean: GuessRound = {};
      for (const person of ['林屿', '许知夏'] as const) {
        if (validAnswer(round[person])) clean[person] = { self: round[person]!.self, guess: round[person]!.guess };
      }
      if (Object.keys(clean).length) result.rounds[q.id] = clean;
    }
  }
  return result;
}
export function submitGuess(state: GuessState, person: Person, answer: GuessAnswer): GuessState {
  const round = state.rounds[state.questionId] ?? {};
  if (!validAnswer(answer) || isRevealed(round)) return state;
  return { ...state, rounds: { ...state.rounds, [state.questionId]: { ...round, [person]: { ...answer } } } };
}
// UI receives the partner's values only after both submissions.
export function guessView(round: GuessRound, person: Person) {
  const partner = person === '林屿' ? '许知夏' : '林屿';
  return { own: round[person], partnerSubmitted: !!round[partner], revealed: isRevealed(round), partner: isRevealed(round) ? round[partner] : undefined };
}
export function nextGuess(state: GuessState): GuessState {
  const round = state.rounds[state.questionId] ?? {};
  if (Object.keys(round).length && !isRevealed(round)) return state;
  const start = guessQuestions.findIndex(q => q.id === state.questionId);
  for (let offset = 1; offset < guessQuestions.length; offset++) {
    const q = guessQuestions[(start + offset) % guessQuestions.length];
    if (!isRevealed(state.rounds[q.id] ?? {})) return { ...state, questionId: q.id };
  }
  return state;
}
