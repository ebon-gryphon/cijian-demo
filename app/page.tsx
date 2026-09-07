'use client';
import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowUp,
  ArrowUpRight,
  Heart,
  MessageCircle,
  Layers,
  BookHeart,
  Inbox,
  Settings2,
  Sparkles,
  Clock3,
  Check,
  LockKeyhole,
  ChevronRight,
  Plus,
  Pencil,
  Quote,
  Leaf,
  ArrowLeftRight,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  people,
  initialMemories,
  initialMessages,
  uid,
  answer,
  memoryStatus,
  canReview,
  reviewMemory,
  reviseMemory,
  assistantName,
  type Person,
  type Memory,
  type Message,
} from './demo';
import {
  AWAY_DELAY,
  initialPresence,
  transitionPresence,
  presenceStatus,
  presenceLabel,
  canReceive,
  restorePresence,
  observePresence,
  type PresenceMap,
  type PresenceEvent,
} from './presence';

export default function Home() {
  const [view, setView] = useState('chat'),
    [active, setActive] = useState<Person>('许知夏');
  const partner: Person = active === '许知夏' ? '林屿' : '许知夏';
  const [memories, setMemories] = useState<Memory[]>(initialMemories),
    [messages, setMessages] = useState<Message[]>(initialMessages),
    [presence, setPresence] = useState<PresenceMap>(initialPresence);
  const [input, setInput] = useState(''),
    [reception, setReception] = useState<Record<Person, boolean>>({
      林屿: true,
      许知夏: true,
    }),
    [notice, setNotice] = useState(''),
    [loaded, setLoaded] = useState(false),
    [sourceIds, setSourceIds] = useState<string[] | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0),
    [returned, setReturned] = useState<Person | null>(null);
  const [reviewing, setReviewing] = useState<Memory | null>(null),
    [feedback, setFeedback] = useState('');
  const auto = reception[active];
  const busy: Record<Person, boolean> = {
    林屿: canReceive(presence.林屿, true, now),
    许知夏: canReceive(presence.许知夏, true, now),
  };
  const presenceRef = useRef(presence);
  presenceRef.current = presence;
  function setAuto(enabled: boolean) {
    setReception((s) => ({ ...s, [active]: enabled }));
  }
  function changePresence(event: PresenceEvent) {
    const time = Date.now();
    setPresence((s) => ({
      ...s,
      [active]: transitionPresence(s[active], event, time),
    }));
    setNow(time);
  }
  function takeOver() {
    changePresence('takeover');
    setReturned(null);
    setNotice('已接回对话，助手停止代回；留言仍等你逐条回应');
  }
  function switchPerson() {
    const time = Date.now();
    setPresence((s) => ({
      ...s,
      [active]: transitionPresence(s[active], 'leave', time),
      [partner]: transitionPresence(s[partner], 'return', time),
    }));
    setActive(partner);
    setNow(time);
    setReturned(partner);
    setInput('');
    setEditing(null);
    setReviewing(null);
    setReplyTo(null);
    setNotice('已切换到' + partner + '；原身份按离开页面计时');
  }
  const [editing, setEditing] = useState<Memory | null>(null),
    [draft, setDraft] = useState(''),
    [title, setTitle] = useState(''),
    [shared, setShared] = useState(false),
    [subject, setSubject] = useState<Person | '我们'>(active),
    [filter, setFilter] = useState('all'),
    [settings, setSettings] = useState(false),
    [memorial, setMemorial] = useState(false),
    [memoryQuestion, setMemoryQuestion] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null),
    [humanReply, setHumanReply] = useState(''),
    [keywords, setKeywords] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem('between-us-demo-v1');
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.memories) && Array.isArray(s.messages)) {
          setMemories(s.memories);
          setMessages(s.messages);
          setPresence(restorePresence(s.presence, s.busy));
          setReception({
            林屿: s.reception?.林屿 ?? s.auto ?? true,
            许知夏: s.reception?.许知夏 ?? s.auto ?? true,
          });
          if (people.includes(s.active)) setActive(s.active);
        }
      }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem(
          'between-us-demo-v1',
          JSON.stringify({ memories, messages, presence, reception, active }),
        );
      } catch {
        setNotice('浏览器未允许保存，当前体验仍可继续。');
      }
  }, [memories, messages, presence, reception, active, loaded]);
  useEffect(() => {
    if (!loaded) return;
    function leave() {
      changePresence('leave');
    }
    function back() {
      if (document.visibilityState === 'hidden') return;
      if (presenceRef.current[active].awaySince !== null) setReturned(active);
      changePresence('return');
    }
    return observePresence(document, window, leave, back);
  }, [active, loaded]);
  useEffect(() => {
    const time = Date.now();
    const deadlines = people
      .map((p) => presence[p])
      .filter(
        (p) =>
          !p.manualBusy &&
          p.awaySince !== null &&
          p.awaySince + AWAY_DELAY > time,
      )
      .map((p) => p.awaySince! + AWAY_DELAY);
    if (!deadlines.length) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(...deadlines) - time) + 5,
    );
    return () => clearTimeout(timer);
  }, [presence, now]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, view]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  function send(text = input) {
    const clean = text.trim();
    if (!clean) return;
    changePresence('takeover');
    setReturned(null);
    setInput('');
    const next: Message[] = [
      ...messages,
      { id: uid(), from: active, text: clean, sources: [], recipient: partner },
    ];
    if (canReceive(presence[partner], reception[partner], Date.now()))
      next.push(answer(clean, active, partner, memories));
    setMessages(next);
  }
  const toolState = useRef({
    active,
    partner,
    view,
    busy,
    reception,
    messages,
    send,
  });
  toolState.current = {
    active,
    partner,
    view,
    busy,
    reception,
    messages,
    send,
  };
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'read_relationship_demo',
        description:
          'Read the current demo identity, reception state and last 4 demo messages. This is a device-local fictional prototype.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => {
          const s = toolState.current;
          return {
            identity: s.active,
            partner: s.partner,
            view: s.view,
            partnerBusy: s.busy[s.partner],
            receptionEnabled: s.reception[s.partner],
            messages: s.messages.slice(-4),
          };
        },
      },
      {
        name: 'send_relationship_demo_message',
        description:
          'Send a message as the current fictional identity into this local demo. Produces a simulated reply only when the partner is busy and reception is enabled. Never sends to real people.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', minLength: 1, maxLength: 1000 },
          },
          required: ['text'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (input) => {
          const obj = input as { text?: unknown };
          if (
            !obj ||
            typeof obj.text !== 'string' ||
            !obj.text.trim() ||
            obj.text.length > 1000 ||
            Object.keys(obj).some((k) => k !== 'text')
          )
            throw new Error(
              'text must be a nonempty string of at most 1000 characters',
            );
          flushSync(() => {
            setView('chat');
            toolState.current.send(obj.text as string);
          });
          return { sent: true, messages: toolState.current.messages.slice(-2) };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  const pending = messages.filter(
    (m) => m.from !== '此间' && m.recipient === active && !m.handled,
  );
  const nav = [
    { id: 'chat', name: '此刻的我们', icon: MessageCircle },
    { id: 'perspectives', name: '彼此的模样', icon: Layers },
    { id: 'memories', name: '共同记忆', icon: BookHeart },
    { id: 'handoff', name: '回来接着聊', icon: Inbox },
  ];
  function edit(m?: Memory) {
    setEditing(
      m || {
        id: 'new',
        title: '',
        text: '',
        owner: active,
        subject: active,
        shared: false,
        confirmed: false,
        tags: [],
      },
    );
    setDraft(m?.text || '');
    setTitle(m?.title || '');
    setShared(m?.shared || false);
    setSubject(m?.subject || active);
    setKeywords(m?.tags.join('、') || '');
  }
  function save() {
    if (!editing || editing.owner !== active || !title.trim() || !draft.trim())
      return;
    const m = reviseMemory(
      { ...editing, id: editing.id === 'new' ? uid() : editing.id },
      {
        title: title.trim(),
        text: draft.trim(),
        subject,
        shared,
        tags: [
          ...new Set(
            keywords
              .split(/[，,。 、\s]+/)
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ],
      },
    );
    setMemories((prev) =>
      editing.id === 'new'
        ? [...prev, m]
        : prev.map((x) => (x.id === m.id ? m : x)),
    );
    setEditing(null);
    setNotice(
      shared && subject !== active
        ? '已分享，等待对方确认后才参与回复'
        : '已保存到这台设备上的演示空间',
    );
  }
  const visibleMemories = memories.filter(
    (m) => m.shared || m.owner === active,
  );
  function confirm(m: Memory) {
    if (!canReview(m, active)) return;
    setMemories((all) =>
      all.map((x) =>
        x.id === m.id ? reviewMemory(x, active, 'confirmed') : x,
      ),
    );
    setNotice('你已确认这份理解，接待助手可以引用了');
  }
  function respond(m: Memory, decision: 'disputed' | 'deferred', text = '') {
    setMemories((all) =>
      all.map((x) =>
        x.id === m.id ? reviewMemory(x, active, decision, text) : x,
      ),
    );
    setReviewing(null);
    setFeedback('');
    setNotice(
      decision === 'disputed'
        ? '已保留分歧和双方原话，助手不会引用这条理解'
        : '已放到稍后再说，不催促，也不供助手引用',
    );
  }
  function sendHuman() {
    if (!humanReply.trim() || !replyTo) return;
    const original = messages.find(
      (m) => m.id === replyTo && m.recipient === active,
    );
    if (!original || original.from === '此间') return;
    setMessages((all) => [
      ...all.map((m) => (m.id === replyTo ? { ...m, handled: true } : m)),
      {
        id: uid(),
        from: active,
        text: humanReply.trim(),
        recipient: original.from as Person,
        sources: [],
      },
    ]);
    changePresence('takeover');
    setReturned(null);
    setReplyTo(null);
    setHumanReply('');
    setNotice('已由' + active + '本人回复');
  }
  function memoryCard(m: Memory) {
    return (
      <article className="memory-card" key={m.id}>
        <div className="row-between">
          <span
            className={
              'pill ' +
              (!m.shared ? 'neutral' : m.confirmed ? 'confirmed' : 'warm')
            }
          >
            {!m.shared ? (
              <>
                <LockKeyhole size={12} />
                仅自己可见
              </>
            ) : m.confirmed ? (
              <>
                <Check size={12} />
                已确认
              </>
            ) : memoryStatus(m) === 'disputed' ? (
              '存在分歧 · 不参与回复'
            ) : memoryStatus(m) === 'deferred' ? (
              '稍后再说'
            ) : m.owner === active ? (
              '等待对方回应'
            ) : (
              '等你回应'
            )}
          </span>
          {m.owner === active && (
            <button
              className="icon-button"
              aria-label={'编辑' + m.title}
              onClick={() => edit(m)}
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
        <h3>{m.title}</h3>
        <p>{m.text}</p>
        <div className="memory-meta">
          <Avatar person={m.owner} mini />
          <span>
            {m.owner}讲述 · 关于{m.subject}
          </span>
        </div>
        {!!m.reviews?.length && (
          <details className="review-history">
            <summary>查看回应与原话（{m.reviews.length}）</summary>
            {m.reviews.map((r, i) => (
              <div className="review-entry" key={i}>
                <small>当时的理解</small>
                <p>“{r.originalText}”</p>
                <strong>
                  {r.reviewer} ·{' '}
                  {r.decision === 'disputed'
                    ? '不太符合'
                    : r.decision === 'deferred'
                      ? '稍后再说'
                      : '符合我的理解'}
                </strong>
                {r.text && <p>{r.text}</p>}
              </div>
            ))}
          </details>
        )}
        {!m.confirmed && canReview(m, active) && (
          <div className="review-actions">
            <button className="text-button" onClick={() => confirm(m)}>
              <Check size={14} />
              这符合我的理解
            </button>
            <button
              className="outline-button"
              onClick={() => {
                setReviewing(m);
                setFeedback('');
              }}
            >
              不太符合
            </button>
            <button
              className="text-button"
              disabled={memoryStatus(m) === 'deferred'}
              onClick={() => respond(m, 'deferred')}
            >
              稍后再说
            </button>
          </div>
        )}
      </article>
    );
  }
  const labels: Record<string, string> = {
    chat: '此刻的我们',
    perspectives: '彼此的模样',
    memories: '共同记忆',
    handoff: '回来接着聊',
  };
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '238px' } as React.CSSProperties}
    >
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <div className="brand">
            <span className="brandmark">
              <Heart size={23} />
            </span>
            <div>
              此间<span>BETWEEN US</span>
            </div>
          </div>
          <div className="space-label">
            林屿 & 许知夏 <LockKeyhole size={13} />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-caption">只属于我们的空间</p>
          <SidebarMenu>
            {nav.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  className="nav-item"
                  isActive={view === n.id}
                  onClick={() => setView(n.id)}
                >
                  <n.icon />
                  <span>{n.name}</span>
                  {n.id === 'handoff' && pending.length > 0 && (
                    <b className="count">{pending.length}</b>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="side-note">
            <span className="tiny-label">A LITTLE CLOSER</span>
            <p>
              有些话，
              <br />
              可以慢慢说。
            </p>
            <span>
              给彼此留一点空间，
              <br />
              也留一盏等着的灯。
            </span>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <button className="quiet-button" onClick={() => setMemorial(true)}>
            <Leaf size={17} /> 回忆纪念模式 <ArrowUpRight size={15} />
          </button>
          <button className="quiet-button" onClick={() => setSettings(true)}>
            <Settings2 size={17} /> 空间设置
          </button>
          <div className="viewer">
            <Avatar person={active} />
            <div>
              <strong>{active}</strong>
              <small>当前体验视角</small>
            </div>
            <button
              title="切换体验身份"
              aria-label="切换体验身份"
              onClick={() => {
                switchPerson();
              }}
            >
              <ArrowLeftRight size={17} />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-toggle" />
            <span>我们的空间</span>
            <ChevronRight size={14} />
            <strong>{labels[view]}</strong>
          </div>
          <div className="demo-badge">
            <span />
            交互 Demo
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">OUR LITTLE WORLD</p>
              <h1>
                {view === 'chat'
                  ? '隔着距离，也接得住日常。'
                  : view === 'perspectives'
                    ? '在彼此眼里，认识我们。'
                    : view === 'memories'
                      ? '把小事，慢慢记成我们。'
                      : '那些想说的话，都在这里。'}
              </h1>
              <p>
                {view === 'chat'
                  ? '你可以先说，等有空的人回来接着听。'
                  : view === 'perspectives'
                    ? '我的感受、你的理解，都值得有自己的位置。'
                    : view === 'memories'
                      ? '每一段记忆，都保留讲述它的人。'
                      : '接回对话，也接住对方的心情。'}
              </p>
            </div>
            <button
              className="outline-button switch-person"
              onClick={() => {
                switchPerson();
              }}
            >
              <ArrowLeftRight size={16} />
              切换为{partner}
            </button>
          </div>
          {view === 'chat' && (
            <>
              <section className="presence">
                <div className="person-status">
                  <Avatar person={active} large />
                  <div>
                    <strong>
                      {active} <small>你</small>
                    </strong>
                    <p>
                      <span
                        className={
                          'status-dot ' + (busy[active] ? 'amber' : '')
                        }
                      />
                      {presenceLabel(presence[active], now)} ·{' '}
                      {active === '林屿' ? '上海' : '杭州'}
                    </p>
                    <div className="presence-controls">
                      <button
                        className="outline-button"
                        onClick={() => {
                          changePresence('busy');
                          setNotice(
                            '已手动设为忙碌，返回页面也会保持；发送消息或接回后解除',
                          );
                        }}
                        disabled={presence[active].manualBusy}
                      >
                        设为忙碌
                      </button>
                      <button className="primary-button" onClick={takeOver}>
                        {busy[active] ? '我回来了，接回' : '在线 · 自动切换'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="distance">
                  <span />
                  <Heart size={15} />
                  <span />
                  <small>相隔 164 公里，分享同一刻</small>
                </div>
                <div className="person-status">
                  <Avatar person={partner} large />
                  <div>
                    <strong>{partner}</strong>
                    <p>
                      <span
                        className={
                          'status-dot ' + (busy[partner] ? 'amber' : '')
                        }
                      />
                      {presenceLabel(presence[partner], now)} ·{' '}
                      {partner === '林屿' ? '上海' : '杭州'}
                    </p>
                  </div>
                </div>
              </section>
              <div className="presence-explain">
                <Clock3 size={16} />
                <p>
                  自动模式：离开页面或切到其他窗口 2
                  分钟后，允许接待的助手才会回应新消息。返回立即暂停；手动忙碌会保留。
                  <small>
                    本机演示：切换体验身份也视为离开；关闭页面后不能继续接待，不会向对方显示离开时间。
                  </small>
                </p>
              </div>
              {returned === active && (
                <div className="return-banner" role="status">
                  <div>
                    <strong>
                      {presence[active].manualBusy
                        ? '你回来了，仍保持手动忙碌'
                        : '你回来了，助手已暂停代回'}
                    </strong>
                    <p>
                      有 {pending.length} 条待回应留言，查看不会自动标记已处理。
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() => setView('handoff')}
                  >
                    看看留言
                  </button>
                  {presence[active].manualBusy && (
                    <button className="primary-button" onClick={takeOver}>
                      接回对话
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setReturned(null)}
                  >
                    收起
                  </button>
                </div>
              )}
              <div className="chat-layout">
                <section className="chat-panel">
                  <div className="chat-title">
                    <span className="small-icon">
                      <MessageCircle size={19} />
                    </span>
                    <div>
                      <h2>留给彼此的话</h2>
                      <p>
                        {busy[partner]
                          ? reception[partner]
                            ? partner +
                              (presence[partner].manualBusy
                                ? '正在忙碌'
                                : '暂时不在此间') +
                              '，由其 AI 助手暂时接待，留言会留给本人'
                            : '助手接待已关闭，消息会等本人回来'
                          : presenceStatus(presence[partner], now) === 'grace'
                            ? '对方暂时离开，助手尚未接待，留言等本人回复'
                            : '本人在线 · 助手不代回'}
                      </p>
                    </div>
                    <span className="private-tag">
                      <LockKeyhole size={13} />
                      双人空间
                    </span>
                  </div>
                  <div
                    className="chat-messages"
                    role="log"
                    aria-label="对话记录"
                    aria-live="polite"
                  >
                    <div className="day-label">今天 · 演示对话</div>
                    {messages.map((m) => (
                      <div
                        className={
                          'message ' +
                          (m.from === active ? 'mine' : '') +
                          ' ' +
                          (m.from === '此间' ? 'assistant' : '')
                        }
                        key={m.id}
                      >
                        {m.from !== active && (
                          <Avatar
                            person={
                              m.from === '此间'
                                ? (m.assistantFor ?? m.recipient ?? '此间')
                                : m.from
                            }
                            assistant={m.from === '此间'}
                            mini
                          />
                        )}
                        <div className="message-body">
                          <div className="sender">{assistantName(m)}</div>
                          <div className="bubble">{m.text}</div>
                          {m.sources.length > 0 && (
                            <button
                              className="source-link"
                              onClick={() => setSourceIds(m.sources)}
                            >
                              <BookHeart size={12} />
                              来自 {m.sources.length} 条已确认记忆
                              <ChevronRight size={12} />
                            </button>
                          )}
                          {m.pending && (
                            <span className="pending-label">
                              <Clock3 size={12} />
                              已留给{m.recipient}本人回应
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={end} />
                  </div>
                  <div className="composer">
                    <div className="suggestions">
                      {['你几点忙完？', '今天有点委屈', '周末我们去哪？'].map(
                        (t) => (
                          <button onClick={() => send(t)} key={t}>
                            {t}
                          </button>
                        ),
                      )}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        send();
                      }}
                    >
                      <textarea
                        aria-label="留给对方的话"
                        placeholder={'想和' + partner + '说些什么…'}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            send();
                          }
                        }}
                        rows={2}
                        maxLength={1000}
                      />
                      <button
                        className="send-button"
                        aria-label="发送消息"
                        disabled={!input.trim()}
                      >
                        <ArrowUp size={21} />
                      </button>
                    </form>
                    <p>
                      <Sparkles size={12} />
                      情境模拟回复 · 内容仅保存在此浏览器
                    </p>
                  </div>
                </section>
                <aside className="context-column">
                  <section className="bridge-card">
                    <div className="row-between">
                      <span className="small-icon">
                        <Sparkles size={20} />
                      </span>
                      <span className="pill">
                        {auto ? '我的助手可接待' : '我的助手已关闭'}
                      </span>
                    </div>
                    <h2>让话有所安放</h2>
                    <p>
                      我的助手只在我手动忙碌或自动离开后接待。私人、存在分歧和未确认的理解都不会被引用。
                    </p>
                    <div className="toggle-row">
                      <label htmlFor="auto">允许我的助手接待</label>
                      <Switch
                        id="auto"
                        checked={auto}
                        onCheckedChange={setAuto}
                      />
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setSettings(true)}
                    >
                      看看接待约定
                      <ArrowUpRight size={15} />
                    </button>
                  </section>
                  <section className="remember-card">
                    <p className="eyebrow">A SHARED MEMORY</p>
                    <Quote size={22} />
                    <h3>
                      下雨天，
                      <br />
                      会想起那碗热汤面。
                    </h3>
                    <p>第一次杭州见面 · 共同回忆</p>
                    <button
                      className="text-button"
                      onClick={() => setSourceIds(['noodle'])}
                    >
                      打开这段记忆
                      <ArrowUpRight size={15} />
                    </button>
                  </section>
                  <div className="gentle-note">
                    <Heart size={15} />
                    <p>
                      重要的情感和承诺，
                      <br />
                      留给你们亲自表达。
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {view === 'perspectives' && (
            <>
              <div className="section-toolbar">
                <span>
                  <Layers size={17} />
                  四个视角，保留各自的声音
                </span>
                <button className="primary-button" onClick={() => edit()}>
                  <Plus size={17} />
                  添加我的认知
                </button>
              </div>
              <div className="perspective-grid">
                {[
                  {
                    owner: active,
                    subject: active,
                    name: '我眼中的自己',
                    sub: '你来定义你自己',
                    mark: '01',
                  },
                  {
                    owner: active,
                    subject: partner,
                    name: '我眼中的你',
                    sub: '你的理解，等待对方回应',
                    mark: '02',
                  },
                  {
                    owner: partner,
                    subject: active,
                    name: '你眼中的我',
                    sub: '听听另一种看见',
                    mark: '03',
                  },
                  {
                    owner: partner,
                    subject: partner,
                    name: '你眼中的自己',
                    sub: '对方愿意分享的自我',
                    mark: '04',
                  },
                ].map((q) => (
                  <section className="perspective" key={q.mark}>
                    <header>
                      <span className="quadrant-number">{q.mark}</span>
                      <div>
                        <h2>{q.name}</h2>
                        <p>{q.sub}</p>
                      </div>
                      <Avatar person={q.owner} />
                    </header>
                    {visibleMemories
                      .filter(
                        (m) => m.owner === q.owner && m.subject === q.subject,
                      )
                      .map(memoryCard)}
                    {!visibleMemories.some(
                      (m) => m.owner === q.owner && m.subject === q.subject,
                    ) && (
                      <p className="empty-small">
                        还没有分享这个视角。可以从一件小事开始。
                      </p>
                    )}
                  </section>
                ))}
              </div>
              <section className="insight">
                <span className="small-icon">
                  <Sparkles size={21} />
                </span>
                <div>
                  <p className="eyebrow">A DIFFERENT PERSPECTIVE</p>
                  <h2>同样的安静，可能有两种理解。</h2>
                  <p>
                    知夏说，难过时想先被听见；林屿曾以为，她更想独处。这是一组值得聊聊的示例，彼此的原话都保留着。
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setView('chat');
                      setInput(
                        '我发现我们对“安静”有不同理解，有空时一起聊聊好吗？',
                      );
                    }}
                  >
                    把这个话题带回对话
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </section>
            </>
          )}
          {view === 'memories' && (
            <>
              <div className="section-toolbar">
                <span>
                  <BookHeart size={17} />
                  {visibleMemories.length} 条可见记忆 · 由你们共同书写
                </span>
                <button className="primary-button" onClick={() => edit()}>
                  <Plus size={17} />
                  记住一件小事
                </button>
              </div>
              <Tabs
                value={filter}
                onValueChange={(v) => setFilter(String(v))}
                className="memory-tabs"
              >
                <TabsList className="filter-tabs">
                  {[
                    ['all', '全部记忆'],
                    ['shared', '双方共享'],
                    ['private', '只属于我'],
                    ['pending', '等待回应'],
                    ['disputed', '存在分歧'],
                    ['deferred', '稍后再说'],
                  ].map(([value, label]) => (
                    <TabsTrigger value={value} key={value}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {[
                  'all',
                  'shared',
                  'private',
                  'pending',
                  'disputed',
                  'deferred',
                ].map((f) => (
                  <TabsContent value={f} key={f}>
                    <div className="memory-grid">
                      {visibleMemories
                        .filter(
                          (m) =>
                            f === 'all' ||
                            (f === 'shared' && m.shared) ||
                            (f === 'private' && !m.shared) ||
                            (m.shared && f === memoryStatus(m)),
                        )
                        .map(memoryCard)}
                    </div>
                    {!visibleMemories.some(
                      (m) =>
                        f === 'all' ||
                        (f === 'shared' && m.shared) ||
                        (f === 'private' && !m.shared) ||
                        (m.shared && f === memoryStatus(m)),
                    ) && (
                      <div className="empty-state">
                        <BookHeart size={32} />
                        <h2>
                          {f === 'pending'
                            ? '没有等待确认的记忆'
                            : '这里还空着'}
                        </h2>
                        <p>
                          {f === 'pending'
                            ? '下一份新的理解，可以慢慢聊。'
                            : '写下一个偏好、一段回忆，或者暂时只想自己知道的事。'}
                        </p>
                        <button
                          className="outline-button"
                          onClick={() => edit()}
                        >
                          添加一条记忆
                        </button>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
              <div className="info-note memory-explain">
                <LockKeyhole size={17} />
                只属于自己的记忆不会被接待助手引用。关于对方或共同经历的新记录，需要另一方确认。
              </div>
            </>
          )}
          {view === 'handoff' && (
            <>
              <section className="handoff-banner">
                <div>
                  <p className="eyebrow">
                    WELCOME BACK, {active === '林屿' ? 'LIN' : 'XIA'}
                  </p>
                  <h2>
                    {pending.length
                      ? '你不在时，' +
                        partner +
                        '留了 ' +
                        pending.length +
                        ' 句话。'
                      : '此刻，没有漏接的话。'}
                  </h2>
                  <p>接待助手保留了原话。你可以从最想回应的那一句开始。</p>
                </div>
                <button className="primary-button" onClick={takeOver}>
                  <Check size={16} />
                  {busy[active] ? '我回来了，接回对话' : '本人已接回'}
                </button>
              </section>
              {pending.length > 0 ? (
                <div className="handoff-list">
                  {pending.map((m) => (
                    <article className="handoff-item" key={m.id}>
                      <Avatar person={m.from} />
                      <div>
                        <div className="row-between">
                          <strong>{m.from}说</strong>
                          <span className="pill warm">待本人回应</span>
                        </div>
                        <p>{m.text}</p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setReplyTo(m.id);
                            setHumanReply('');
                          }}
                        >
                          亲自回一句
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Inbox size={35} />
                  <h2>等你们下一段对话</h2>
                  <p>先切换为对方，留一句话，再回来体验消息交接。</p>
                  <button
                    className="outline-button"
                    onClick={() => {
                      switchPerson();
                      setView('chat');
                    }}
                  >
                    切换身份并去留言
                  </button>
                </div>
              )}
              <button className="text-button" onClick={() => setView('chat')}>
                查看完整对话
                <ChevronRight size={15} />
              </button>
            </>
          )}
        </div>
        <footer className="page-footer">
          <span>此间 · 让每一句话，都有来处。</span>
          <span>虚构人物 / 本机演示 / 不向真实联系人发消息</span>
        </footer>
      </main>
      <Dialog
        open={sourceIds !== null}
        onOpenChange={(o) => !o && setSourceIds(null)}
      >
        <DialogContent className="our-dialog">
          <DialogTitle>这句话，从哪里来</DialogTitle>
          <DialogDescription>
            以下展示记忆的当前版本。未确认的理解不会作为事实生成新回复。
          </DialogDescription>
          {memories
            .filter((m) => sourceIds?.includes(m.id) && m.shared)
            .map((m) => (
              <div className="source-card" key={m.id}>
                <span className="pill">
                  {m.owner}留下 ·{' '}
                  {memoryStatus(m) === 'confirmed'
                    ? '已确认'
                    : memoryStatus(m) === 'disputed'
                      ? '存在分歧，不再引用'
                      : memoryStatus(m) === 'deferred'
                        ? '稍后再说，不再引用'
                        : '已修改，等待确认'}
                </span>
                <h3>{m.title}</h3>
                <p>“{m.text}”</p>
              </div>
            ))}
          {!memories.some((m) => sourceIds?.includes(m.id) && m.shared) && (
            <p className="info-note">
              这条记忆已停止共享。之前已发出的对话保留，新的回复不再引用。
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="our-dialog">
          <DialogTitle>我们的接待约定</DialogTitle>
          <DialogDescription>
            当前设置属于{active}
            ，只影响当前浏览器里的演示空间。对方需切换身份后自行设置。
          </DialogDescription>
          <div className="toggle-row">
            <label htmlFor="setting-auto">离开或忙碌时允许我的助手接待</label>
            <Switch
              id="setting-auto"
              checked={auto}
              onCheckedChange={setAuto}
            />
          </div>
          <div className="info-note">
            离开页面 2
            分钟后才进入自动接待；返回页面立即暂停。手动忙碌不受返回影响，点击“接回”或本人发送消息后解除。助手一直保留身份标识，重要感情和承诺交给本人。
          </div>
          <p className="info-note">
            离开判断不代表真实忙碌。后台页面可能被浏览器暂停，关闭页面后不能继续接待；真实的跨设备服务需要服务端。
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={reviewing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setReviewing(null);
            setFeedback('');
          }
        }}
      >
        <DialogContent className="our-dialog">
          <DialogTitle>说说你的不同感受</DialogTitle>
          <DialogDescription>
            可以直接选择不符合，不需要解释。补充内容会让对方看到，双方原话都会保留，助手不会引用有分歧的理解。
          </DialogDescription>
          <div className="source-card">
            <span className="pill">{reviewing?.owner}的理解</span>
            <p>{reviewing?.text}</p>
          </div>
          <label>
            我的实际感受（选填）
            <textarea
              rows={4}
              value={feedback}
              maxLength={600}
              placeholder="我的实际感受是……"
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <button
            className="primary-button"
            onClick={() =>
              reviewing && respond(reviewing, 'disputed', feedback)
            }
          >
            确认不太符合
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="our-dialog">
          <DialogTitle>留下一点关于我们的事</DialogTitle>
          <DialogDescription>
            由{active}讲述，保存在这台设备上。
          </DialogDescription>
          <div>
            <span className="field-label">这件事关于谁</span>
            <Tabs
              value={subject}
              onValueChange={(v) => setSubject(v as Person | '我们')}
            >
              <TabsList className="subject-tabs">
                {[active, partner, '我们'].map((p) => (
                  <TabsTrigger key={p} value={p}>
                    {p === active
                      ? '我自己'
                      : p === partner
                        ? '我眼中的' + partner
                        : '我们共同的事'}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <label>
            标题
            <input
              value={title}
              maxLength={50}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            想记住的话
            <textarea
              value={draft}
              maxLength={600}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
            />
          </label>
          <label>
            聊到哪些词时想起它
            <input
              placeholder="例如：晚饭、面馆、吃什么"
              value={keywords}
              maxLength={100}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </label>
          <div className="toggle-row">
            <label htmlFor="shared-memory">允许对方和接待助手使用</label>
            <Switch
              id="shared-memory"
              checked={shared}
              onCheckedChange={setShared}
            />
          </div>
          {shared && subject !== active && (
            <p className="info-note">
              分享后会先请对方确认。确认前，接待助手不会把这份理解当作事实。
            </p>
          )}
          <button
            className="primary-button"
            disabled={!title.trim() || !draft.trim()}
            onClick={save}
          >
            保存记忆
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={replyTo !== null}
        onOpenChange={(o) => {
          if (!o) {
            setReplyTo(null);
            setHumanReply('');
          }
        }}
      >
        <DialogContent className="our-dialog">
          <DialogTitle>现在，换你来回应</DialogTitle>
          <DialogDescription>
            这条消息会以{active}本人的身份出现在演示对话中。
          </DialogDescription>
          <div className="source-card">
            <span className="pill">{partner}的原话</span>
            <p>{messages.find((m) => m.id === replyTo)?.text}</p>
          </div>
          <label>
            你想说的话
            <textarea
              value={humanReply}
              onChange={(e) => setHumanReply(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="我忙完啦，刚刚看到你的消息…"
            />
          </label>
          <button
            className="primary-button"
            disabled={!humanReply.trim()}
            onClick={sendHuman}
          >
            由我发送
            <ArrowUp size={17} />
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={memorial} onOpenChange={setMemorial}>
        <DialogContent className="our-dialog">
          <DialogTitle>把回忆，留在此间</DialogTitle>
          <DialogDescription>
            独立的纪念体验 ·
            以下为虚构的奶奶与爷爷的故事。回答来自讲述者的回忆，不代表逝者本人。
          </DialogDescription>
          <div className="source-card">
            <span className="pill">奶奶讲述的回忆</span>
            <p>
              “以前一下雨，他就会煮一碗番茄面。总说，趁热吃，吃完心里就暖了。”
            </p>
          </div>
          <button
            className="outline-button"
            onClick={() =>
              setMemoryQuestion(
                '在这段回忆里，爷爷用一碗热面表达关心。奶奶记得他说过：「趁热吃，吃完心里就暖了。」',
              )
            }
          >
            想起下雨天，他会说些什么？
          </button>
          {memoryQuestion && (
            <div className="info-note">
              {memoryQuestion}
              <small>来源：上方的虚构回忆 · 回忆助手整理</small>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {notice && (
        <div className="toast-message" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </SidebarProvider>
  );
}
function Avatar({
  person,
  large,
  mini,
  assistant,
}: {
  person: Person | '此间';
  large?: boolean;
  mini?: boolean;
  assistant?: boolean;
}) {
  return (
    <span
      className={
        'avatar ' +
        (person === '林屿' ? 'blue' : person === '此间' ? 'violet' : 'pink') +
        (large ? ' large' : '') +
        (mini ? ' mini' : '') +
        (assistant ? ' assistant-avatar' : '')
      }
    >
      {person === '此间' ? <Sparkles size={15} /> : person.slice(-1)}
      {assistant && (
        <span className="assistant-avatar-mark" aria-hidden="true">
          <Sparkles size={10} />
        </span>
      )}
    </span>
  );
}
