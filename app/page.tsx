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
  ArrowLeftRight,
  ChevronDown,
  LogIn,
  UserRound,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
  migrateReplyLinks,
  unansweredMessages,
  unansweredLabels,
  completeHandoff,
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
  const [now, setNow] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [reviewing, setReviewing] = useState<Memory | null>(null),
    [feedback, setFeedback] = useState('');
  const auto = reception[active];
  const busy: Record<Person, boolean> = {
    林屿: canReceive(presence.林屿, true, now),
    许知夏: canReceive(presence.许知夏, true, now),
  };
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
    setNotice('已接回对话');
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
    setInput('');
    setEditing(null);
    setReviewing(null);
    setReplyTo(null);
    setNotice('已切换到' + partner);
  }
  const [editing, setEditing] = useState<Memory | null>(null),
    [draft, setDraft] = useState(''),
    [title, setTitle] = useState(''),
    [subject, setSubject] = useState<Person | '我们'>(active),
    [filter, setFilter] = useState('all'),
    [settings, setSettings] = useState(false);
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
          setMessages(migrateReplyLinks(s.messages));
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
    if (view !== 'chat') return;
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
    setInput('');
    const incomingId = uid();
    const next: Message[] = [
      ...messages,
      {
        id: incomingId,
        from: active,
        text: clean,
        sources: [],
        recipient: partner,
        sentAt: Date.now(),
      },
    ];
    if (canReceive(presence[partner], reception[partner], Date.now()))
      next.push(answer(clean, active, partner, memories, incomingId));
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
  const pending = unansweredMessages(messages, active);
  const currentHandoff = pending.find((item) => item.message.id === replyTo);
  const nav = [
    { id: 'chat', name: '此刻的我们', icon: MessageCircle },
    { id: 'perspectives', name: '彼此的模样', icon: Layers },
    { id: 'memories', name: '共同记忆', icon: BookHeart },
    { id: 'handoff', name: '待你回应', icon: Inbox },
  ];
  function edit(m?: Memory) {
    setEditing(
      m || {
        id: 'new',
        title: '',
        text: '',
        owner: active,
        subject: active,
        shared: true,
        confirmed: false,
        tags: [],
      },
    );
    setDraft(m?.text || '');
    setTitle(m?.title || '');
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
        shared: true,
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
      subject !== active
        ? '已分享，等待对方确认后才参与回复'
        : '已保存到这台设备上的演示空间',
    );
  }
  // Old private memories remain in local storage but are never shown or promoted to shared.
  const visibleMemories = memories.filter((m) => m.shared);
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
      ...completeHandoff(all, replyTo, active),
      {
        id: uid(),
        from: active,
        text: humanReply.trim(),
        replyToId: replyTo,
        recipient: original.from as Person,
        sentAt: Date.now(),
        sources: [],
      },
    ]);
    changePresence('takeover');
    setReplyTo(null);
    setHumanReply('');
    setNotice('已由' + active + '本人回复');
  }
  function memoryCard(m: Memory) {
    return (
      <article className="memory-card" key={m.id}>
        <div className="row-between">
          <span className={'pill ' + (m.confirmed ? 'confirmed' : 'warm')}>
            {m.confirmed ? (
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
    handoff: '待你回应',
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
        </SidebarHeader>
        <SidebarContent className="our-sidebar-content">
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
        </SidebarContent>
        <SidebarFooter className="account-footer">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="account-trigger"
              aria-label="账号与设置"
            >
              <Avatar person={active} mini />
              <span>
                {active}
                <small>体验账号</small>
              </span>
              <ChevronDown size={15} />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="account-menu"
            >
              <DropdownMenuItem onClick={() => setLoginOpen(true)}>
                <LogIn size={16} /> 登录 / 账号
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSettings(true)}>
                <Settings2 size={16} /> 设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                      : '先回应，最需要你的话。'}
              </h1>
              <p>
                {view === 'chat'
                  ? '你可以先说，等有空的人回来接着听。'
                  : view === 'perspectives'
                    ? '我的感受、你的理解，都值得有自己的位置。'
                    : view === 'memories'
                      ? '每一段记忆，都保留讲述它的人。'
                      : 'AI 未能回答的部分，已经为你整理在这里。'}
              </p>
            </div>
            <button
              className="outline-button switch-person"
              onClick={switchPerson}
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
                    <div className="self-status-row">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="status-trigger"
                          aria-label="切换我的状态"
                        >
                          <span
                            className={
                              'status-dot ' + (busy[active] ? 'amber' : '')
                            }
                          />
                          {busy[active] ? '忙碌' : '在线'}
                          <ChevronDown size={13} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="status-menu">
                          <DropdownMenuItem onClick={takeOver}>
                            在线
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              changePresence('busy');
                              setNotice('已设为忙碌');
                            }}
                          >
                            忙碌
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span>{active === '林屿' ? '上海' : '杭州'}</span>
                      {busy[active] && (
                        <button
                          className="text-button take-back"
                          onClick={takeOver}
                        >
                          接回对话
                        </button>
                      )}
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
              <div className="chat-layout">
                <section className="chat-panel">
                  <div className="chat-title">
                    <span className="small-icon">
                      <MessageCircle size={19} />
                    </span>
                    <div className="chat-heading">
                      <h2>留给彼此的话</h2>
                      <p>
                        {busy[partner]
                          ? reception[partner]
                            ? partner + '的 AI 助手正在接待'
                            : '留言会留给' + partner
                          : presenceStatus(presence[partner], now) === 'grace'
                            ? '等' + partner + '回来接着聊'
                            : partner + '在这里'}
                      </p>
                    </div>
                    <div className="chat-assistant-controls">
                      <label htmlFor="auto">我的助手</label>
                      <Switch
                        id="auto"
                        checked={auto}
                        onCheckedChange={setAuto}
                      />
                      <button
                        className="chat-settings-button"
                        aria-label="接待设置"
                        title="接待设置"
                        onClick={() => setSettings(true)}
                      >
                        <Settings2 size={16} />
                      </button>
                    </div>
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
                        id={'message-' + m.id}
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
                    ['pending', '等待回应'],
                    ['disputed', '存在分歧'],
                    ['deferred', '稍后再说'],
                  ].map(([value, label]) => (
                    <TabsTrigger value={value} key={value}>
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {['all', 'shared', 'pending', 'disputed', 'deferred'].map(
                  (f) => (
                    <TabsContent value={f} key={f}>
                      <div className="memory-grid">
                        {visibleMemories
                          .filter(
                            (m) =>
                              f === 'all' ||
                              (f === 'shared' && m.shared) ||
                              (m.shared && f === memoryStatus(m)),
                          )
                          .map(memoryCard)}
                      </div>
                      {!visibleMemories.some(
                        (m) =>
                          f === 'all' ||
                          (f === 'shared' && m.shared) ||
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
                              : '写下愿意和对方分享的偏好，或一段共同回忆。'}
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
                  ),
                )}
              </Tabs>
              <div className="info-note memory-explain">
                <LockKeyhole size={17} />
                这里的记忆双方都能看见。关于对方或共同经历的新记录，需要另一方确认后，助手才会引用。
              </div>
            </>
          )}
          {view === 'handoff' && (
            <>
              <section className="handoff-summary">
                <div>
                  <h2>
                    {pending.length
                      ? pending.length + ' 条消息需要你补充'
                      : '暂时没有 AI 未答的问题'}
                  </h2>
                  <p>关系与感受优先展示，AI 已答清楚的内容不再列入。</p>
                </div>
                {busy[active] && (
                  <button className="outline-button" onClick={takeOver}>
                    接回对话
                  </button>
                )}
              </section>
              {pending.length > 0 ? (
                <div className="handoff-list">
                  {pending.map(({ message: m, parts }) => (
                    <article className="handoff-item" key={m.id}>
                      <Avatar person={m.from} mini />
                      <div>
                        <div className="row-between">
                          <strong>{m.from} · 等你回应</strong>
                          {m.sentAt && <small>{formatTime(m.sentAt)}</small>}
                        </div>
                        <div className="unanswered-parts">
                          {parts.map((part, index) => (
                            <div className="unanswered-part" key={index}>
                              <span
                                className={
                                  'pill ' +
                                  (part.priority < 2 ? 'warm' : 'neutral')
                                }
                              >
                                {unansweredLabels[part.reason]}
                              </span>
                              <p>{part.text}</p>
                            </div>
                          ))}
                        </div>
                        <details className="handoff-context">
                          <summary>展开原消息与 AI 回复</summary>
                          <p>{m.text}</p>
                          <small>
                            {assistantName(
                              messages.find(
                                (item) =>
                                  item.from === '此间' &&
                                  item.replyToId === m.id,
                              )!,
                            )}
                          </small>
                          <p>
                            {
                              messages.find(
                                (item) =>
                                  item.from === '此间' &&
                                  item.replyToId === m.id,
                              )?.text
                            }
                          </p>
                        </details>
                        <div className="handoff-actions">
                          <button
                            className="primary-button"
                            onClick={() => {
                              setReplyTo(m.id);
                              setHumanReply('');
                            }}
                          >
                            回应这些内容 <ArrowUpRight size={15} />
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              setMessages((all) =>
                                completeHandoff(all, m.id, active),
                              );
                              setNotice('已标记处理，不会发送新消息');
                            }}
                          >
                            已当面回应
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Check size={32} />
                  <h2>需要你回应的话，会整理在这里</h2>
                  <p>
                    AI 未能回答的信息与需要本人回应的感受，将按重要程度排列。
                  </p>
                </div>
              )}
              <button className="text-button" onClick={() => setView('chat')}>
                回到对话 <ChevronRight size={15} />
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
            由{active}讲述，保存后双方都能看见。
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
          <p className="info-note">
            {subject !== active
              ? '关于对方或共同经历的记忆，须由对方确认后，助手才会引用。'
              : '你分享的自我信息，可以作为助手回复的来源。'}
          </p>
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
            <span className="pill">需要你回应的部分</span>
            {currentHandoff?.parts.map((part, index) => (
              <p key={index}>{part.text}</p>
            ))}
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
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="our-dialog account-dialog">
          <UserRound size={26} />
          <DialogTitle>登录此间</DialogTitle>
          <DialogDescription>
            当前为体验版，正式账号登录尚未开放。可以选择一个演示身份继续体验。
          </DialogDescription>
          <div className="account-choices">
            {people.map((person) => (
              <button
                className="outline-button"
                key={person}
                onClick={() => {
                  if (person !== active) switchPerson();
                  setLoginOpen(false);
                }}
              >
                <Avatar person={person} mini />以{person}体验
                {person === active && <Check size={16} />}
              </button>
            ))}
          </div>
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
function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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
