'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Eye, EyeOff, Heart, Quote } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { memoryStatus, type Memory, type Person } from './demo';

export function MemoryFragments({ memories, person, onOpen }: {
  memories: Memory[];
  person: Person;
  onOpen: (ids: string[]) => void;
}) {
  const [shown, setShown] = useState(false);
  const [ready, setReady] = useState(false);
  const [saveWarning, setSaveWarning] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const preferenceKey = 'between-us-memory-fragments-v1-' + person;
  const fragments = memories.filter(m => m.shared && memoryStatus(m) === 'confirmed');
  const current = Math.min(selected, Math.max(0, fragments.length - 1));

  useEffect(() => {
    try { setShown(localStorage.getItem(preferenceKey) !== 'hidden'); }
    catch { setShown(true); }
    setReady(true);
  }, [preferenceKey]);

  useEffect(() => {
    if (!api) return;
    const update = () => setSelected(api.selectedScrollSnap());
    update();
    api.on('select', update);
    api.on('reInit', update);
    return () => { api.off('select', update); api.off('reInit', update); };
  }, [api]);

  function toggle() {
    const next = !shown;
    setShown(next);
    setSelected(0);
    try {
      localStorage.setItem(preferenceKey, next ? 'shown' : 'hidden');
      setSaveWarning(false);
    } catch { setSaveWarning(true); }
  }

  return (
    <section className="remember-card memory-fragments" aria-label="记忆碎片">
      <div className="fragment-topline">
        <p className="eyebrow">{shown && fragments.length ? '记忆碎片' : '只属于我们'}</p>
        {ready && <button className="fragment-toggle" onClick={toggle}
          aria-label={shown ? '隐藏记忆，只显示标语' : '显示记忆碎片'}
          title={shown ? '隐藏记忆，只显示标语' : '显示记忆碎片'}>
          {shown ? <EyeOff size={14} /> : <Eye size={14} />}
          {shown ? '隐藏记忆' : '显示记忆'}
        </button>}
      </div>
      {shown && fragments.length > 0 ? (
        <Carousel className="fragment-carousel" opts={{ loop: fragments.length > 1 }} setApi={setApi}
          tabIndex={0} aria-label="左右滑动浏览记忆碎片">
          <CarouselContent>
            {fragments.map((memory, index) => (
              <CarouselItem key={memory.id} aria-label={`${index + 1} / ${fragments.length}`}
                aria-hidden={index !== current} inert={index !== current}>
                <Quote className="fragment-quote" size={24} />
                <h3>{memory.title}</h3>
                <p className="fragment-excerpt">{memory.text}</p>
                <p className="fragment-author">{memory.owner}写下 · {memory.subject === '我们' ? '共同回忆' : '关于' + memory.subject}</p>
                <button className="text-button" onClick={() => onOpen([memory.id])}>
                  打开这段记忆 <ArrowUpRight size={15} />
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
          {fragments.length > 1 && <div className="fragment-navigation">
            <button onClick={() => api?.scrollPrev()} aria-label="上一段记忆"><ChevronLeft size={18} /></button>
            <span aria-live="polite" aria-atomic="true">{String(current + 1).padStart(2, '0')} <span>/ {String(fragments.length).padStart(2, '0')}</span></span>
            <button onClick={() => api?.scrollNext()} aria-label="下一段记忆"><ChevronRight size={18} /></button>
          </div>}
        </Carousel>
      ) : (
        <div className="fragment-motto">
          <Heart size={25} />
          <h3>隔着距离，<br />也分享日常。</h3>
          <p>此间，有你，也有我。</p>
          {shown && ready && <small>有了已确认的共同记忆，就会出现在这里。</small>}
        </div>
      )}
      {saveWarning && <p className="fragment-save-warning" role="status">本次选择已生效，浏览器暂时无法保存。</p>}
    </section>
  );
}
