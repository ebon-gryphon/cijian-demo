'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight, Heart } from 'lucide-react';
import { createCoverWater } from './cover-water';

export function SpaceCover({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  const waterCanvas = useRef<HTMLCanvasElement>(null);
  const water = useRef<ReturnType<typeof createCoverWater> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useRef(false);
  const entering = useRef(false);
  const finished = useRef(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const [exiting, setExiting] = useState(false);
  const [heartTouched, setHeartTouched] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reduced.current = media.matches; };
    update();
    media.addEventListener('change', update);
    if (waterCanvas.current && root.current) water.current = createCoverWater(waterCanvas.current, root.current);
    return () => {
      media.removeEventListener('change', update);
      water.current?.dispose();
      water.current = null;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  function move(event: PointerEvent<HTMLElement>) {
    if (reduced.current || entering.current || !root.current || (event.pointerType !== 'mouse' && !event.isPrimary)) return;
    const rect = root.current.getBoundingClientRect();
    water.current?.move(event.clientX - rect.left, event.clientY - rect.top);
  }
  function resetPointer() {
    down.current = null;
    water.current?.leave();
  }
  function addRipple(x: number, y: number) {
    if (reduced.current || entering.current || !root.current) return;
    const rect = root.current.getBoundingClientRect();
    water.current?.tap(x - rect.left, y - rect.top);
  }
  function tap(event: PointerEvent<HTMLElement>) {
    const start = down.current;
    down.current = null;
    if (!start || event.button !== 0 || (event.target as Element).closest('button')) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12) addRipple(event.clientX, event.clientY);
  }
  function finishEntry() {
    if (!entering.current || finished.current) return;
    finished.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    onEnter();
  }
  function enter() {
    if (entering.current) return;
    entering.current = true;
    resetPointer();
    if (reduced.current) { finishEntry(); return; }
    setExiting(true);
    // Also completes if animationend is suppressed by the browser or custom styles.
    timer.current = setTimeout(finishEntry, 720);
  }

  return <main ref={root} className={'space-cover interactive-cover' + (exiting ? ' cover-exiting' : '')}
    onPointerMove={move} onPointerLeave={resetPointer} onPointerCancel={resetPointer}
    onPointerDown={event => { if (event.isPrimary) down.current = { x: event.clientX, y: event.clientY }; }}
    onPointerUp={event => { tap(event); if (event.pointerType !== 'mouse') resetPointer(); }}
    onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'cover-depart') finishEntry(); }}>
    <canvas ref={waterCanvas} className="cover-water" aria-hidden="true" />
    <header className="cover-topline"><span>BETWEEN US</span><span>我们的双人手记</span></header>
    <section className="cover-page" aria-labelledby="cover-title">
      <div className="cover-edition"><span /> JUST YOU & ME <span /></div>
      <p className="cover-prelude">把日常，写成我们。</p>
      <h1 id="cover-title">此间<span aria-hidden="true">。</span></h1>
      <p className="cover-subtitle">隔着距离，也分享日常。</p>
      <div className="cover-names"><span>林屿</span><button className={'cover-heart' + (heartTouched ? ' is-touched' : '')}
        disabled={exiting} aria-label="点亮两人之间的心" aria-pressed={heartTouched}
        onClick={event => {
          setHeartTouched(value => !value);
          const rect = event.currentTarget.getBoundingClientRect();
          addRipple(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }}><Heart size={20} aria-hidden="true" /></button><span>许知夏</span></div>
      <button className="cover-enter" onClick={enter} disabled={exiting} aria-busy={exiting}>
        {exiting ? '正在翻开我们的日常' : '进入我们的空间'} <ArrowUpRight size={19} />
      </button>
      <p className="cover-note" aria-live="polite">{heartTouched ? '两颗心，又靠近了一点。' : '有话慢慢说，有你认真听。'}</p>
      <p className="cover-play-hint">轻轻划过，让心意泛起涟漪</p>
    </section>
    <footer className="cover-footer"><span>只属于我们的空间</span><span>本机体验 · 示例人物</span></footer>
  </main>;
}
