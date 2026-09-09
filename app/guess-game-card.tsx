'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Heart, LockKeyhole, Shuffle, Sparkles } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { guessQuestions, guessView, initialGuessState, isRevealed, nextGuess, restoreGuessState, submitGuess, type GuessState } from './guess-game';
import type { Person } from './demo';

const storageKey = 'between-us-guess-game-v1';
type Props = { person: Person; onSwitch: () => void; onChat: (text: string) => void; onRemember: (title: string, text: string) => void };
export function GuessGameCard(props: Props) {
  const [state, setState] = useState<GuessState>(initialGuessState);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState('');
  useEffect(() => {
    try { setState(restoreGuessState(JSON.parse(localStorage.getItem(storageKey) || 'null'))); }
    catch { /* A fresh game remains playable if storage is unavailable. */ }
    setReady(true);
  }, []);
  function update(next: GuessState) {
    setState(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setWarning(''); }
    catch { setWarning('本次答案已保留在页面中，浏览器暂时无法保存，离开或刷新后可能丢失。'); }
  }
  const completed = guessQuestions.filter(q => isRevealed(state.rounds[q.id] ?? {}));
  return <section className="guess-game" aria-label="猜你会怎么选">
    <header className="guess-game-heading">
      <div><p className="eyebrow">A LITTLE MORE ABOUT YOU</p><h2><Sparkles size={22} />猜你会怎么选</h2></div>
      <span className="guess-kicker">两个人 · 一个小发现</span>
    </header>
    {ready ? <GuessRoundCard key={state.questionId + props.person} {...props} state={state} update={update} /> : <p role="status">正在翻开你们的答案…</p>}
    {warning && <p className="guess-storage-warning" role="status">{warning}</p>}
    {completed.length > 0 && <details className="guess-history"><summary>我们揭晓过的答案 · {completed.length}</summary><div>
      {completed.map(q => <button key={q.id} onClick={() => update({ ...state, questionId: q.id })}>{q.text}<ArrowUpRight size={15} /></button>)}
      {guessQuestions.filter(q => { const r = state.rounds[q.id]; return r && !isRevealed(r); }).map(q => <button key={q.id} onClick={() => update({ ...state, questionId: q.id })}>继续待揭晓的问题 · {q.text}</button>)}
    </div></details>}
  </section>;
}
function GuessRoundCard({ state, update, person, onSwitch, onChat, onRemember }: Props & { state: GuessState; update: (state: GuessState) => void }) {
  const question = guessQuestions.find(q => q.id === state.questionId)!;
  const round = state.rounds[question.id] ?? {};
  const view = guessView(round, person);
  const partner = person === '林屿' ? '许知夏' : '林屿';
  const [self, setSelf] = useState<number | null>(view.own?.self ?? null);
  const [guess, setGuess] = useState<number | null>(view.own?.guess ?? null);
  const [editing, setEditing] = useState(!view.own);
  const finishedAll = guessQuestions.every(q => isRevealed(state.rounds[q.id] ?? {}));
  const canChange = Object.keys(round).length === 0 || view.revealed;
  const resultText = view.revealed ? `关于“${question.text}”\n${person}选了“${question.options[view.own!.self]}”，猜${partner}会选“${question.options[view.own!.guess]}”。\n${partner}选了“${question.options[view.partner!.self]}”，猜${person}会选“${question.options[view.partner!.guess]}”。` : '';
  return <>
    <div className="guess-question-heading"><span>{question.tag}</span><span>{String(guessQuestions.findIndex(q => q.id === question.id) + 1).padStart(2, '0')} / {String(guessQuestions.length).padStart(2, '0')}</span></div>
    <h3 className="guess-question">{question.text}</h3>
    {view.revealed ? <div className="guess-reveal" role="region" aria-label="双方答案已揭晓">
      <p className="guess-reveal-note"><Heart size={17} />又发现了你的一面</p>
      <div className="guess-result-grid">
        {[{ name: person, other: partner, answer: view.own!, actual: view.partner!.self }, { name: partner, other: person, answer: view.partner!, actual: view.own!.self }].map(item => <article key={item.name}>
          <p>{item.name}的答案</p><h4>{question.options[item.answer.self]}</h4>
          <p>猜{item.other}会选<br /><strong>{question.options[item.answer.guess]}</strong></p>
          <span className="guess-result-note">{item.answer.guess === item.actual ? '这一点，猜中了' : '和 TA 的答案有点不同，聊聊为什么吧'}</span>
        </article>)}
      </div>
      <div className="guess-actions"><button className="primary-button" onClick={() => onChat(resultText + '\n我想听听你为什么这样选，有空聊聊吗？')}>聊聊为什么 <ArrowUpRight size={16} /></button><button className="outline-button" onClick={() => onRemember('猜你会怎么选 · ' + question.tag, resultText)}>记住这一点</button></div>
      <p className="guess-footnote">这是这一次的答案。记入共同记忆前，你们还可以补充和确认。</p>
    </div> : view.own && !editing ? <div className="guess-waiting">
      <span className="guess-waiting-icon"><LockKeyhole size={24} /></span><h4>你的答案收好了，等{partner}来揭晓。</h4>
      <p>双方都提交后，才能看到彼此的选择。</p>
      <div className="guess-own-answer"><span>我选了<strong>{question.options[view.own.self]}</strong></span><span>我猜 TA 选<strong>{question.options[view.own.guess]}</strong></span></div>
      <div className="guess-actions"><button className="primary-button" onClick={onSwitch}>切换为{partner}作答</button><button className="outline-button" onClick={() => setEditing(true)}>修改我的答案</button></div>
    </div> : <form onSubmit={event => { event.preventDefault(); if (self === null || guess === null) return; update(submitGuess(state, person, { self, guess })); setEditing(false); }}>
      <p className="guess-intro">{view.partnerSubmitted ? `${partner}已经作答。选好你的答案，一起揭晓。` : '先选自己的答案，再猜猜对方。双方提交后一起揭晓。'}</p>
      <div className="guess-choice-grid">
        {[{ id: 'self', title: '我会怎么选', sub: person + '的答案', value: self, change: setSelf }, { id: 'partner', title: '猜你会怎么选', sub: '我猜' + partner + '的答案', value: guess, change: setGuess }].map(group => <fieldset key={group.id}>
          <legend>{group.title}<small>{group.sub}</small></legend>
          <RadioGroup value={group.value === null ? '' : String(group.value)} onValueChange={value => group.change(Number(value))} aria-label={group.title}>
            {question.options.map((option, index) => <label className={'guess-option' + (group.value === index ? ' selected' : '')} key={option}>
              <RadioGroupItem value={String(index)} aria-label={option} /><span>{option}</span><span className="guess-option-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
            </label>)}
          </RadioGroup>
        </fieldset>)}
      </div>
      <div className="guess-actions"><button className="primary-button" type="submit" disabled={self === null || guess === null}><Check size={16} />{view.partnerSubmitted ? '提交并揭晓' : view.own ? '保存修改' : '收好我的答案'}</button><span className="guess-footnote">{self === null || guess === null ? '两边各选一个答案' : '猜得不同，也值得聊聊'}</span></div>
    </form>}
    <footer className="guess-game-footer"><span>本机双人演示 · 切换身份作答</span>{canChange && !finishedAll && <button className="text-button" onClick={() => update(nextGuess(state))}><Shuffle size={15} />{view.revealed ? '再玩一题' : '换个问题'}</button>}{finishedAll && <span>这 8 个小发现，已收进下方记录。</span>}</footer>
  </>;
}
