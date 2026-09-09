'use client';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  ArrowLeftRight,
  ChevronDown,
  LogIn,
  UserRound,
  Bot,
  Eye,
  EyeOff,
  Paperclip,
  FileText,
  Image as ImageIcon,
  X,
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
import { GuessGameCard } from './guess-game-card';
import { SpaceCover } from './space-cover';
import { MemoryFragments } from './memory-fragments';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  type MemoryAttachment,
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
import {
  DEFAULT_MODEL_SETTINGS,
  MODEL_PROVIDERS,
  modelDisplayName,
  modelSettingsIssue,
  normalizeModelSettings,
  restoreModelSettings,
  type ModelProvider,
  type ModelSettings,
} from './model-settings';
import {
  attachmentIssue,
  attachmentMetadata,
  deleteAttachmentBlob,
  formatFileSize,
  readAttachmentBlob,
  saveAttachmentBlob,
} from './attachments';
import {
  restoreStyles,
  learnMessage,
  correctStyle,
  rememberedStyle,
  styleSummary,
  type SpeakingStyles,
} from './speaking-style';
import {
  fallbackReply,
  requestReception,
  type ReceptionInput,
} from './reception-model';

type DraftAttachment = MemoryAttachment & { file?: File };

export default function Home() {
  const [entered, setEntered] = useState(false);
  const arrival = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (entered) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      arrival.current?.focus({ preventScroll: true });
    }
  }, [entered]);
  return entered
    ? <div className="space-arrival" ref={arrival} tabIndex={-1} aria-label="我们的空间"><OurSpace onExit={() => setEntered(false)} /></div>
    : <SpaceCover onEnter={() => setEntered(true)} />;
}

function OurSpace({ onExit }: { onExit: () => void }) {
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
  const chatLog = useRef<HTMLDivElement>(null);
  const chatPositioned = useRef(false);
  const chatIdentity = useRef<Person | null>(null);
  const [now, setNow] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [modelSettings, setModelSettings] = useState<
    Record<Person, ModelSettings>
  >(() => restoreModelSettings(null));
  const [modelDraft, setModelDraft] = useState<ModelSettings>({
    ...DEFAULT_MODEL_SETTINGS,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [styles, setStyles] = useState<SpeakingStyles>(() =>
    restoreStyles(null),
  );
  const [styleMemoryDraft, setStyleMemoryDraft] = useState('');
  const [editingStyleMemory, setEditingStyleMemory] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [settingsTab, setSettingsTab] = useState('reception');
  const [correction, setCorrection] = useState<Message | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [generating, setGenerating] = useState<Person | null>(null);
  const inFlight = useRef<{
    controller: AbortController;
    person: Person;
  } | null>(null);
  function cancelReception() {
    inFlight.current?.controller.abort();
    inFlight.current = null;
    setGenerating(null);
  }
  const [reviewing, setReviewing] = useState<Memory | null>(null),
    [feedback, setFeedback] = useState('');
  const auto = reception[active];
  const busy: Record<Person, boolean> = {
    林屿: canReceive(presence.林屿, true, now),
    许知夏: canReceive(presence.许知夏, true, now),
  };
  function setAuto(enabled: boolean) {
    if (!enabled && inFlight.current?.person === active) cancelReception();
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
    if (inFlight.current?.person === active) cancelReception();
    changePresence('takeover');
    setNotice('已接回对话');
  }
  function switchPerson() {
    cancelReception();
    setSettings(false);
    setCorrection(null);
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
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>(
      [],
    ),
    [savingMemory, setSavingMemory] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null),
    [humanReply, setHumanReply] = useState(''),
    [keywords, setKeywords] = useState('');
  function openSettings() {
    setSettingsTab('reception');
    prepareSettingsDrafts();
  }
  function prepareSettingsDrafts() {
    setModelDraft({ ...modelSettings[active] });
    setStyleMemoryDraft(rememberedStyle(styles[active]));
    setEditingStyleMemory(false);
    setShowApiKey(false);
    setSettings(true);
  }
  function finishOnboarding() {
    try {
      localStorage.setItem('between-us-onboarding-v1', 'seen');
    } catch {}
    setOnboardingOpen(false);
    setOnboardingStep(0);
  }
  function openOnboarding() {
    setSettings(false);
    setOnboardingStep(0);
    setOnboardingOpen(true);
  }
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
          const restoredModels = restoreModelSettings(s.modelSettings);
          try {
            const keys = JSON.parse(
              sessionStorage.getItem('between-us-model-keys') || '{}',
            );
            for (const person of people) {
              if (typeof keys[person] === 'string')
                restoredModels[person].apiKey = keys[person];
            }
          } catch {}
          setModelSettings(restoredModels);
          setStyles(restoreStyles(s.speakingStyles));
          if (people.includes(s.active)) setActive(s.active);
        }
      }
      if (localStorage.getItem('between-us-onboarding-v1') !== 'seen')
        setOnboardingOpen(true);
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem(
          'between-us-demo-v1',
          JSON.stringify({
            memories,
            messages,
            presence,
            reception,
            modelSettings: Object.fromEntries(
              people.map((p) => [p, { ...modelSettings[p], apiKey: '' }]),
            ),
            speakingStyles: styles,
            active,
          }),
        );
        sessionStorage.setItem(
          'between-us-model-keys',
          JSON.stringify(
            Object.fromEntries(people.map((p) => [p, modelSettings[p].apiKey])),
          ),
        );
      } catch {
        setNotice('浏览器未允许保存，当前体验仍可继续。');
      }
  }, [
    memories,
    messages,
    presence,
    reception,
    modelSettings,
    styles,
    active,
    loaded,
  ]);
  useEffect(
    () => () => {
      inFlight.current?.controller.abort();
    },
    [],
  );
  useEffect(() => {
    cancelReception();
  }, [memories]);
  useEffect(() => {
    const flight = inFlight.current;
    if (
      flight &&
      !canReceive(presence[flight.person], reception[flight.person], now)
    )
      cancelReception();
  }, [presence, reception, now]);
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
  useLayoutEffect(() => {
    if (view !== 'chat' || !loaded) {
      chatPositioned.current = false;
      return;
    }
    const log = chatLog.current;
    if (!log) return;
    if (!chatPositioned.current || chatIdentity.current !== active) {
      // Position restored history before paint, without scrolling the page.
      log.scrollTop = log.scrollHeight;
    } else {
      log.scrollTo({ top: log.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    chatPositioned.current = true;
    chatIdentity.current = active;
  }, [messages, view, loaded, active, generating]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  async function send(text = input) {
    const clean = text.trim();
    if (!clean || !loaded) return;
    if (inFlight.current?.person === partner) {
      setNotice('助手正在回复，稍等一下');
      return;
    }
    cancelReception();
    changePresence('takeover');
    setInput('');
    const incomingId = uid();
    const incoming: Message = {
      id: incomingId,
      from: active,
      text: clean,
      sources: [],
      recipient: partner,
      sentAt: Date.now(),
    };
    setMessages((all) => [...all, incoming]);
    setStyles((all) => learnMessage(all, incoming));
    if (!canReceive(presence[partner], reception[partner], Date.now())) return;
    const payload: ReceptionInput = {
      text: clean,
      active,
      partner,
      memories,
      messages: [...messages, incoming],
      style: styles[partner],
      replyToId: incomingId,
    };
    if (
      !modelSettings[partner].apiKey ||
      window.location.protocol === 'file:'
    ) {
      setMessages((all) => [...all, fallbackReply(payload)]);
      if (window.location.protocol === 'file:' && modelSettings[partner].apiKey)
        setNotice('联网模型请在网页版本中使用，离线页面使用基础接待');
      return;
    }
    const controller = new AbortController();
    inFlight.current = { controller, person: partner };
    setGenerating(partner);
    try {
      const reply = await requestReception(
        payload,
        modelSettings[partner],
        controller.signal,
      );
      if (!controller.signal.aborted) setMessages((all) => [...all, reply]);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessages((all) => [...all, fallbackReply(payload, true)]);
        setNotice(
          error instanceof Error
            ? error.message
            : '模型暂时无法回复，已使用基础接待',
        );
      }
    } finally {
      if (inFlight.current?.controller === controller) {
        inFlight.current = null;
        setGenerating(null);
      }
    }
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
          'Send a message as the current fictional identity into this local demo. When reception is enabled and the partner is busy, configured model APIs receive conversation context and style samples to generate a reply. Without a key, uses local rules. Never sends to real people.',
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
  function changeModelProvider(provider: ModelProvider) {
    setModelDraft((current) => ({
      ...current,
      provider,
      apiKey: '',
      model: MODEL_PROVIDERS[provider].defaultModel,
      baseUrl: '',
    }));
  }
  function saveModelSettings() {
    const next = normalizeModelSettings(modelDraft);
    const issue = modelSettingsIssue(next);
    if (issue) {
      setNotice(issue);
      return;
    }
    cancelReception();
    setModelSettings((current) => ({ ...current, [active]: next }));
    setModelDraft(next);
    setNotice(`已为${active}保存 ${modelDisplayName(next)}`);
  }
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
    setDraftAttachments((m?.attachments ?? []).map((item) => ({ ...item })));
  }
  function addAttachments(files: FileList | null) {
    if (!files?.length) return;
    const next = [...draftAttachments];
    let issue = '';
    for (const file of Array.from(files)) {
      const problem = attachmentIssue(file, next.length);
      if (problem) {
        issue ||= problem;
        continue;
      }
      next.push({ ...attachmentMetadata(file, uid()), file });
    }
    setDraftAttachments(next);
    if (issue) setNotice(issue);
  }
  async function save() {
    if (!editing || editing.owner !== active || !title.trim() || !draft.trim())
      return;
    setSavingMemory(true);
    const newAttachments = draftAttachments.filter((item) => item.file);
    try {
      await Promise.all(
        newAttachments.map((item) => saveAttachmentBlob(item.id, item.file!)),
      );
    } catch {
      await Promise.allSettled(
        newAttachments.map((item) => deleteAttachmentBlob(item.id)),
      );
      setSavingMemory(false);
      setNotice('附件保存失败，请检查浏览器存储空间');
      return;
    }
    const attachments = draftAttachments.map(
      ({ file: _file, ...item }) => item,
    );
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
        attachments,
      },
    );
    setMemories((prev) =>
      editing.id === 'new'
        ? [...prev, m]
        : prev.map((x) => (x.id === m.id ? m : x)),
    );
    const kept = new Set(attachments.map((item) => item.id));
    await Promise.allSettled(
      (editing.attachments ?? [])
        .filter((item) => !kept.has(item.id))
        .map((item) => deleteAttachmentBlob(item.id)),
    );
    setSavingMemory(false);
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
    cancelReception();
    const ownReply: Message = {
      id: uid(),
      from: active,
      text: humanReply.trim(),
      replyToId: replyTo,
      recipient: original.from as Person,
      sentAt: Date.now(),
      sources: [],
    };
    setStyles((all) => learnMessage(all, ownReply));
    setMessages((all) => [...completeHandoff(all, replyTo, active), ownReply]);
    changePresence('takeover');
    setReplyTo(null);
    setHumanReply('');
    setNotice('已由' + active + '本人回复');
  }
  function memoryCard(m: Memory) {
    return (
      <article className="memory-card" key={m.id}>
        <h3>{m.title}</h3>
        <p>{m.text}</p>
        {!!m.attachments?.length && (
          <div className="memory-attachments">
            {m.attachments.map((attachment) => (
              <AttachmentView attachment={attachment} key={attachment.id} />
            ))}
          </div>
        )}
        <div className="memory-meta">
          <Avatar person={m.owner} mini />
          <span>
            {m.owner}讲述 · 关于{m.subject}
          </span>
        </div>
        <div className="row-between memory-status-row">
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
      style={{ '--sidebar-width': '208px' } as React.CSSProperties}
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
              <DropdownMenuItem onClick={openSettings}>
                <Settings2 size={16} /> 设置
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openOnboarding}>
                <BookHeart size={16} /> 使用引导
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExit}>
                <Heart size={16} /> 返回封面
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <nav className="mobile-bottom-nav" aria-label="页面导航">
        {nav.map(n => <button key={n.id} aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}><n.icon size={20} /><span>{n.name}</span>{n.id === 'handoff' && pending.length > 0 && <i aria-label={pending.length + '条待回应'} />}</button>)}
      </nav>
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
        <div className={"content view-" + view}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{view === 'chat' ? 'JUST YOU & ME' : view === 'memories' ? 'OUR SHARED PAGES' : view === 'perspectives' ? 'THROUGH YOUR EYES' : 'WHEN YOU RETURN'}</p>
              <h1>
                {view === 'chat'
                  ? '今天，也想和你说说话。'
                  : view === 'perspectives'
                    ? '你眼里的我，我眼里的你。'
                    : view === 'memories'
                      ? '我们一起，记得的小事。'
                      : '这几句话，等你亲自回应。'}
              </h1>
              <p>
                {view === 'chat'
                  ? '有空时聊聊，忙碌时也可以留句话。'
                  : view === 'perspectives'
                    ? '我的感受、你的理解，都值得有自己的位置。'
                    : view === 'memories'
                      ? '每一段记忆，都保留讲述它的人。'
                      : '小助手没能回答的部分，留在这里等你。'}
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
                  <small>上海 · 杭州 / 示例中的两座城</small>
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
                      <h2>{partner}<span className="conversation-label"> / 留给彼此的话</span></h2>
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
                        aria-label="助手设置"
                        title="助手设置"
                        onClick={openSettings}
                      >
                        <Settings2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div
                    className="chat-messages"
                    ref={chatLog}
                    data-ready={loaded}
                    aria-busy={!loaded}
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
                          {m.from === '此间' && (
                            <div className="reply-tools">
                              <span>
                                {m.replyMode === 'model'
                                  ? 'AI 接待'
                                  : m.replyMode === 'fallback'
                                    ? '模型连接失败 · 基础接待'
                                    : '基础接待'}
                              </span>
                              {(m.assistantFor ?? m.recipient) === active && (
                                <button
                                  onClick={() => {
                                    setCorrection(m);
                                    setCorrectionText('');
                                  }}
                                >
                                  这句不像我
                                </button>
                              )}
                            </div>
                          )}
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
                    {generating && (
                      <p className="reply-loading" role="status">
                        {generating}的 AI 助手正在整理回复…
                      </p>
                    )}
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
                        disabled={
                          !input.trim() || !loaded || generating === partner
                        }
                      >
                        <ArrowUp size={21} />
                      </button>
                    </form>
                    <p>
                      <Sparkles size={12} />
                      {modelSettings[partner].apiKey
                        ? 'AI 接待始终标识身份 · 重要决定留给本人'
                        : '尚未配置对方的模型 · 当前使用基础接待'}
                    </p>
                  </div>
                </section>
                <aside className="context-column">
                  <MemoryFragments
                    key={active}
                    memories={visibleMemories}
                    person={active}
                    onOpen={setSourceIds}
                  />
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
              <GuessGameCard
                person={active}
                onSwitch={switchPerson}
                onChat={(text) => { setView('chat'); setInput(text); }}
                onRemember={(title, text) => edit({
                  id: 'new', title, text, owner: active, subject: '我们',
                  shared: true, confirmed: false, tags: ['猜你会怎么选'],
                })}
              />
              <div className="perspective-archive-heading"><p className="eyebrow">OUR GROWING PORTRAIT</p><h2>慢慢认识的我们</h2><p>你说的自己，我眼里的你，都留在这里。</p></div>
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
                      ? pending.length + ' 条留言，等你接着聊'
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
        open={onboardingOpen}
        onOpenChange={(open) => {
          if (!open) finishOnboarding();
        }}
      >
        <DialogContent className="our-dialog onboarding-dialog">
          <div className="onboarding-progress" aria-label="使用引导进度">
            {[0, 1, 2].map((step) => (
              <span
                key={step}
                className={step === onboardingStep ? 'active' : ''}
              />
            ))}
          </div>
          {onboardingStep === 0 ? (
            <div className="onboarding-content">
              <span className="onboarding-icon">
                <Bot size={26} />
              </span>
              <DialogTitle>忙的时候，先帮你接住日常</DialogTitle>
              <DialogDescription>
                你离开或标记忙碌后，AI
                助手可以回应普通日常。涉及感情态度、决定和承诺的话，会留给你本人。
              </DialogDescription>
            </div>
          ) : onboardingStep === 1 ? (
            <div className="onboarding-content">
              <span className="onboarding-icon">
                <BookHeart size={26} />
              </span>
              <DialogTitle>重要的事，只从确认过的记忆里来</DialogTitle>
              <DialogDescription>
                共同记忆经双方确认后才能被助手引用。带有记忆来源的回复可以随时查看，有分歧的内容不再使用。
              </DialogDescription>
            </div>
          ) : (
            <div className="onboarding-content">
              <span className="onboarding-icon">
                <Sparkles size={26} />
              </span>
              <DialogTitle>助手会自己慢慢学会</DialogTitle>
              <DialogDescription>
                你不需要先填风格设置。AI
                会根据你亲自说过的话学习表达；如果它理解错了，你随时可以修改或删除这些口吻记忆。
              </DialogDescription>
            </div>
          )}
          <div className="onboarding-actions">
            <button className="text-button" onClick={finishOnboarding}>
              跳过
            </button>
            <div>
              {onboardingStep > 0 && (
                <button
                  className="outline-button"
                  onClick={() => setOnboardingStep((step) => step - 1)}
                >
                  上一步
                </button>
              )}
              {onboardingStep < 2 ? (
                <button
                  className="primary-button"
                  onClick={() => setOnboardingStep((step) => step + 1)}
                >
                  继续
                </button>
              ) : (
                <button className="primary-button" onClick={finishOnboarding}>
                  开始体验
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
        <DialogContent className="our-dialog settings-dialog">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            当前设置属于{active}
            ，只影响当前浏览器里的演示空间。对方需切换身份后自行设置。
          </DialogDescription>
          <Tabs
            value={settingsTab}
            onValueChange={setSettingsTab}
            className="settings-tabs"
          >
            <TabsList className="settings-tab-list">
              <TabsTrigger value="reception">接待设置</TabsTrigger>
              <TabsTrigger value="model">模型设置</TabsTrigger>
              <TabsTrigger value="style">口吻记忆</TabsTrigger>
            </TabsList>
            <TabsContent value="reception" className="settings-panel">
              <div className="toggle-row">
                <label htmlFor="setting-auto">
                  离开或忙碌时允许我的助手接待
                </label>
                <Switch
                  id="setting-auto"
                  checked={auto}
                  onCheckedChange={setAuto}
                />
              </div>
              <div className="info-note">
                离开页面 2
                分钟后才进入自动接待；返回页面立即暂停。手动忙碌不受返回影响，点击“接回”或本人发送消息后解除。重要感情和承诺仍交给本人。
              </div>
              <p className="info-note">
                离开判断不代表真实忙碌。关闭页面后不能继续接待；真实的跨设备服务需要服务端。
              </p>
            </TabsContent>
            <TabsContent value="model" className="settings-panel">
              <div className="model-setting-heading">
                <span className="small-icon">
                  <Bot size={18} />
                </span>
                <div>
                  <strong>模型与 API</strong>
                  <p>在这里完成密钥配置和模型切换。</p>
                </div>
              </div>
              <div className="model-fields">
                <div className="model-field">
                  <span className="field-label">API 服务</span>
                  <Select
                    value={modelDraft.provider}
                    onValueChange={(value) =>
                      changeModelProvider(value as ModelProvider)
                    }
                  >
                    <SelectTrigger aria-label="API 服务">
                      <SelectValue>
                        {MODEL_PROVIDERS[modelDraft.provider].label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {(Object.keys(MODEL_PROVIDERS) as ModelProvider[]).map(
                        (provider) => (
                          <SelectItem value={provider} key={provider}>
                            {MODEL_PROVIDERS[provider].label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="model-field">
                  <label htmlFor="model-api-key">API Key</label>
                  <div className="api-key-field">
                    <Input
                      id="model-api-key"
                      type={showApiKey ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      value={modelDraft.apiKey}
                      placeholder="sk-……"
                      onChange={(event) =>
                        setModelDraft((current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="api-key-visibility"
                      aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                      onClick={() => setShowApiKey((visible) => !visible)}
                    >
                      {showApiKey ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <div className="model-field">
                  <span className="field-label">使用模型</span>
                  {modelDraft.provider === 'custom' ? (
                    <Input
                      aria-label="模型 ID"
                      value={modelDraft.model}
                      placeholder="输入模型 ID"
                      onChange={(event) =>
                        setModelDraft((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <Select
                      value={modelDraft.model}
                      onValueChange={(value) =>
                        setModelDraft((current) => ({
                          ...current,
                          model: value as string,
                        }))
                      }
                    >
                      <SelectTrigger aria-label="使用模型">
                        <SelectValue>
                          {modelDisplayName(modelDraft)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start">
                        {MODEL_PROVIDERS[modelDraft.provider].models.map(
                          (model) => (
                            <SelectItem value={model.value} key={model.value}>
                              {model.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {modelDraft.provider === 'custom' && (
                  <div className="model-field">
                    <label htmlFor="model-api-url">API 地址</label>
                    <Input
                      id="model-api-url"
                      type="url"
                      value={modelDraft.baseUrl}
                      placeholder="https://api.example.com/v1"
                      onChange={(event) =>
                        setModelDraft((current) => ({
                          ...current,
                          baseUrl: event.target.value,
                        }))
                      }
                    />
                  </div>
                )}
              </div>
              <div className="model-save-row">
                <span>当前：{modelDisplayName(modelSettings[active])}</span>
                {modelSettings[active].apiKey && (
                  <button
                    className="text-button"
                    onClick={() => {
                      cancelReception();
                      setModelSettings((all) => ({
                        ...all,
                        [active]: { ...all[active], apiKey: '' },
                      }));
                      setModelDraft((current) => ({ ...current, apiKey: '' }));
                      setNotice('已清除本次会话的密钥，恢复基础接待');
                    }}
                  >
                    停用模型
                  </button>
                )}
                <button
                  type="button"
                  className="primary-button"
                  onClick={saveModelSettings}
                >
                  保存模型设置
                </button>
              </div>
              <p className="info-note model-security-note">
                保存后，接待会将近期对话、已确认记忆和口吻样本发送给所选模型服务。API
                Key 仅保留在当前标签页会话中。演示身份切换不构成账号隔离。
              </p>
              {modelDraft.provider === 'custom' && (
                <p className="info-note">
                  自定义服务需兼容 Chat Completions 和 JSON
                  输出，并由部署者允许该 HTTPS 地址。
                </p>
              )}
            </TabsContent>
            <TabsContent value="style" className="settings-panel style-panel">
              <div className="toggle-row">
                <label htmlFor="style-enabled">让助手自动学习我的表达</label>
                <Switch
                  id="style-enabled"
                  checked={styles[active].enabled}
                  onCheckedChange={(enabled) => {
                    cancelReception();
                    setStyles((all) => ({
                      ...all,
                      [active]: { ...all[active], enabled },
                    }));
                  }}
                />
              </div>
              <p className="info-note">
                不用先填风格选项。助手只学习你亲自发出的新消息和口吻修正，不学习对方或
                AI 的回复。
              </p>
              <div className="communication-section">
                <div className="communication-heading">
                  <div>
                    <strong>AI 目前这样理解你</strong>
                    <p>它会随你的新表达继续调整。</p>
                  </div>
                  <span>
                    {styles[active].memoryEdited
                      ? '你修改过'
                      : styles[active].samples.length
                        ? 'AI 自动归纳'
                        : '学习中'}
                  </span>
                </div>
                {editingStyleMemory ? (
                  <div className="memory-editor">
                    <textarea
                      id="style-memory"
                      aria-label="修改 AI 对你的口吻记忆"
                      rows={4}
                      maxLength={500}
                      value={styleMemoryDraft}
                      onChange={(event) =>
                        setStyleMemoryDraft(event.target.value)
                      }
                    />
                    <div className="memory-editor-actions">
                      <button
                        className="text-button"
                        onClick={() => {
                          setStyleMemoryDraft(rememberedStyle(styles[active]));
                          setEditingStyleMemory(false);
                        }}
                      >
                        取消
                      </button>
                      {styles[active].memoryEdited && (
                        <button
                          className="outline-button"
                          onClick={() => {
                            cancelReception();
                            setStyles((all) => ({
                              ...all,
                              [active]: {
                                ...all[active],
                                memorySummary: '',
                                memoryEdited: false,
                              },
                            }));
                            setStyleMemoryDraft(styleSummary(styles[active]));
                            setEditingStyleMemory(false);
                            setNotice('已恢复 AI 自动归纳');
                          }}
                        >
                          恢复自动归纳
                        </button>
                      )}
                      <button
                        className="primary-button"
                        onClick={() => {
                          const memorySummary = styleMemoryDraft.trim();
                          cancelReception();
                          setStyles((all) => ({
                            ...all,
                            [active]: {
                              ...all[active],
                              memorySummary,
                              memoryEdited: Boolean(memorySummary),
                            },
                          }));
                          setEditingStyleMemory(false);
                          setNotice(
                            memorySummary
                              ? '已按你的修改更新口吻记忆'
                              : '已恢复 AI 自动归纳',
                          );
                        }}
                      >
                        保存修改
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="style-memory-copy">
                      {rememberedStyle(styles[active])}
                    </p>
                    {(styles[active].samples.length > 0 ||
                      styles[active].memorySummary) && (
                      <button
                        className="memory-edit-button"
                        onClick={() => {
                          setStyleMemoryDraft(rememberedStyle(styles[active]));
                          setEditingStyleMemory(true);
                        }}
                      >
                        <Pencil size={15} /> 这里理解得不对，我来修改
                      </button>
                    )}
                  </>
                )}
              </div>
              <p className="memory-source-note">
                如果某句 AI 回复不像你，也可以在该消息下点“这句不像我”来教它。
              </p>
              {styles[active].samples.length > 0 && (
                <details className="style-samples">
                  <summary>查看 AI 学习过的表达</summary>
                  {[...styles[active].samples].reverse().map((sample) => (
                    <div className="style-sample" key={sample.id}>
                      <div>
                        <span>
                          {sample.source === 'correction'
                            ? '你修改的表达'
                            : '本人消息'}
                        </span>
                        <p>{sample.text}</p>
                      </div>
                      <button
                        aria-label={'删除口吻样本：' + sample.text.slice(0, 16)}
                        onClick={() => {
                          cancelReception();
                          setStyles((all) => ({
                            ...all,
                            [active]: {
                              ...all[active],
                              samples: all[active].samples.filter(
                                (s) => s.id !== sample.id,
                              ),
                            },
                          }));
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </details>
              )}
              <div className="style-memory-footer">
                <span>
                  {styles[active].samples.length} 条学习样本 · 仅保存在此浏览器
                </span>
                {(styles[active].samples.length > 0 ||
                  styles[active].memorySummary) && (
                  <button
                    className="text-button"
                    onClick={() => {
                      cancelReception();
                      setStyles((all) => ({
                        ...all,
                        [active]: {
                          ...all[active],
                          memorySummary: '',
                          memoryEdited: false,
                          samples: [],
                        },
                      }));
                      setStyleMemoryDraft('');
                      setEditingStyleMemory(false);
                      setNotice('已清除口吻记忆与学习样本，不会重新扫描旧消息');
                    }}
                  >
                    清除学习记录
                  </button>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <Dialog
        open={correction !== null}
        onOpenChange={(open) => {
          if (!open) setCorrection(null);
        }}
      >
        <DialogContent className="our-dialog style-panel">
          <DialogTitle>换成你会说的话</DialogTitle>
          <DialogDescription>
            你的修改会优先用于之后的口吻学习，不会修改或重新发送已经发出的消息。
          </DialogDescription>
          <blockquote className="style-original">{correction?.text}</blockquote>
          <label htmlFor="style-correction">你会怎么表达？</label>
          <textarea
            id="style-correction"
            rows={4}
            maxLength={500}
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            placeholder="写下你自己的表达方式…"
          />
          <button
            className="primary-button"
            disabled={!correctionText.trim()}
            onClick={() => {
              if (
                !correction ||
                (correction.assistantFor ?? correction.recipient) !== active
              )
                return;
              cancelReception();
              setStyles((all) => ({
                ...all,
                [active]: correctStyle(
                  all[active],
                  correction.id,
                  correctionText,
                ),
              }));
              setCorrection(null);
              setNotice(
                styles[active].enabled
                  ? '已记住你的表达，下次接待会参考'
                  : '已保存表达，开启口吻学习后会使用',
              );
            }}
          >
            记住这个表达
          </button>
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
          <div className="attachment-editor">
            <span className="field-label">照片或文件</span>
            <label className="attachment-picker" htmlFor="memory-attachments">
              <Paperclip size={17} />
              <span>
                添加附件
                <small>最多 6 个，单个不超过 100 MB</small>
              </span>
              <input
                id="memory-attachments"
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip,.rar,.7z"
                onChange={(event) => {
                  addAttachments(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            {!!draftAttachments.length && (
              <div className="draft-attachments">
                {draftAttachments.map((attachment) => (
                  <AttachmentView
                    attachment={attachment}
                    file={attachment.file}
                    key={attachment.id}
                    onRemove={() =>
                      setDraftAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
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
            disabled={!title.trim() || !draft.trim() || savingMemory}
            onClick={save}
          >
            {savingMemory ? '正在保存…' : '保存记忆'}
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
            <button
              className="primary-button online-entry-link"
              onClick={() => {
                if (window.location.protocol === 'file:') {
                  setNotice('联机测试需要打开网页版本');
                  setLoginOpen(false);
                  return;
                }
                window.location.assign('/online');
              }}
            >
              <LogIn size={16} /> 两台设备联机测试
            </button>
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
function AttachmentView({
  attachment,
  file,
  onRemove,
}: {
  attachment: MemoryAttachment;
  file?: File;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState('');
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    async function load() {
      try {
        const blob = file ?? (await readAttachmentBlob(attachment.id));
        if (!blob) {
          if (active) setMissing(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setUrl(objectUrl);
          setMissing(false);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (active) setMissing(true);
      }
    }
    load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, file]);
  const icon =
    attachment.kind === 'image' ? (
      <ImageIcon size={18} />
    ) : (
      <FileText size={18} />
    );
  return (
    <div className={'memory-attachment ' + attachment.kind}>
      {attachment.kind === 'image' && url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`打开${attachment.name}`}
        >
          <img src={url} alt={attachment.name} />
        </a>
      ) : (
        <a
          className={missing ? 'attachment-file missing' : 'attachment-file'}
          href={url || undefined}
          download={url ? attachment.name : undefined}
          aria-disabled={!url}
        >
          {icon}
        </a>
      )}
      <div className="attachment-details">
        <strong title={attachment.name}>{attachment.name}</strong>
        <small>
          {attachment.kind === 'video'
            ? '已停止支持视频上传'
            : missing
              ? '文件仅在原设备可用'
              : formatFileSize(attachment.size)}
        </small>
      </div>
      {onRemove && (
        <button
          type="button"
          className="attachment-remove"
          aria-label={`移除${attachment.name}`}
          onClick={onRemove}
        >
          <X size={15} />
        </button>
      )}
    </div>
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
