'use client';
/* Native images support authenticated assets and the standalone offline file. */
/* eslint-disable next/no-img-element */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BookHeart,
  BookOpen,
  Feather,
  Sparkles,
  ImagePlus,
  Settings2,
  Users,
  ArrowUpRight,
  Plus,
  Check,
  RefreshCw,
  Upload,
  Download,
  X,
  Link2,
  History,
  LoaderCircle,
  Cloud,
  HardDrive,
  WandSparkles,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  newEntry,
  examples,
  type Entry,
  type Person,
  type Picture,
} from './journal-model';
import {
  localRead,
  localWrite,
  readPicture,
  exportEntries,
} from './journal-storage';
import './journal.css';
import { isRetiredExample, withoutRetiredExamples } from './retired-examples';
import {
  AI_PRESETS,
  IMAGE_PRESETS,
  type ImageProtocol,
  BUILTIN_PROXY_BASES,
  type TextProtocol,
} from './ai-connections';
import {
  AIError,
  generateJournal,
  DEFAULT_API_BASE_URL,
  normalizeApiBaseUrl,
} from './journal-ai';
type Session = {
  member: { id: string; spaceId: string; displayName: string; role: Person };
  partner: { displayName: string; role: Person } | null;
  space: { inviteCode: string };
};
type Modal = 'settings' | 'space' | 'image' | 'history' | 'replace' | null;
type ImageDraft = {
  step: 1 | 2 | 3;
  style: string;
  scene: string;
  characters: string;
  size: string;
  prompt: string;
  source?: Picture;
  result: string;
};
const imageDefault = (): ImageDraft => ({
  step: 1,
  style: '胶片摄影',
  scene: '',
  characters: '不特写面部，以背影或手部呈现两个人',
  size: '1536x1024',
  prompt: '',
  result: '',
});
function Busy({ children }: { children: ReactNode }) {
  return (
    <span className="busy">
      <LoaderCircle className="spin" size={16} />
      {children}
    </span>
  );
}
async function request(path: string, body?: unknown, signal?: AbortSignal) {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:')
    throw new Error('跨设备同步需使用在线版本，本地文件可生成并保存日记');
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });
  let data: Session & {
    entries: Entry[];
    entry: Entry;
    src: string;
    error?: string;
    configured: boolean;
    imageConfigured: boolean;
    imageApiBaseUrl: string;
    protocol: TextProtocol;
    proxyBases: string[];
    apiBaseUrl: string;
    textModel: string;
    imageModel: string;
    imageProtocol: ImageProtocol;
    imageUrl?: string;
    title: string;
    story: string;
    prompt: string;
    image: string;
  };
  try {
    data = await response.json();
  } catch {
    throw new Error('服务暂时不可用，请稍后再试');
  }
  if (!response.ok) throw new Error(data.error || '操作未完成，请重试');
  return data;
}

export default function Home() {
  const [tab, setTab] = useState('write');
  const [draft, setDraft] = useState<Entry | null>(null);
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [active, setActive] = useState<Person>('host');
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [busy, setBusy] = useState('');
  const [storyError, setStoryError] = useState('');
  const storyRef = useRef<HTMLElement>(null);
  const storyTextRef = useRef<HTMLTextAreaElement>(null);
  const [draftStatus, setDraftStatus] = useState('');
  const [key, setKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [proxyApiBases, setProxyApiBases] =
    useState<string[]>(BUILTIN_PROXY_BASES);
  const [protocol, setProtocol] = useState<TextProtocol>('openai');
  const [imageProtocol, setImageProtocol] = useState<ImageProtocol>('openai');
  const [imageDirectConnection, setImageDirectConnection] = useState(false);
  const [imageApiBaseUrl, setImageApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [imageKey, setImageKey] = useState('');
  const [imageConfigured, setImageConfigured] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [directConnection, setDirectConnection] = useState(false);
  const [textModel, setTextModel] = useState('gpt-5-mini');
  const [imageModel, setImageModel] = useState('gpt-image-2');
  const [configured, setConfigured] = useState(false);
  const [imageDraft, setImageDraft] = useState<ImageDraft>(imageDefault);
  const [history, setHistory] = useState<{ title: string; story: string }[]>(
    [],
  );
  const [query, setQuery] = useState('');
  const [showExamples, setShowExamples] = useState(false);
  const [spaceAction, setSpaceAction] = useState('create');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [pendingEntry, setPendingEntry] = useState<Entry | null>(null);
  const [conflict, setConflict] = useState<Entry | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [dirty, setDirty] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const settingsEdited = useRef(false);
  const offline =
    typeof window !== 'undefined' && window.location.protocol === 'file:';
  const paired = !!session && !localMode;
  const role = paired ? session.member.role : active;
  const names: Record<Person, string> = paired
    ? {
        host:
          session.member.role === 'host'
            ? session.member.displayName
            : session.partner?.displayName || '对方',
        guest:
          session.member.role === 'guest'
            ? session.member.displayName
            : session.partner?.displayName || '对方',
      }
    : { host: '我', guest: '你' };
  const stored = localMode ? localEntries : entries;
  const allMemories = [...stored, ...(!localMode ? localEntries : [])].filter(
    (e, i, a) => a.findIndex((x) => x.id === e.id) === i,
  );
  const hasDraft =
    !!draft &&
    (!!draft.title ||
      !!draft.story ||
      !!draft.notes.host ||
      !!draft.notes.guest ||
      draft.pictures.length > 0);
  async function refresh() {
    const [s, e] = await Promise.all([
      request('/api/diary/session'),
      request('/api/diary/entries'),
    ]);
    setSession(s);
    setEntries(e.entries);
    return e.entries as Entry[];
  }
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const previous = (await localRead<Entry[]>('entries')) || [];
        const saved = await withoutRetiredExamples(previous);
        if (saved.length !== previous.length)
          await localWrite('entries', saved);
        const oldDraft = await localRead<Entry>('draft');
        const prior =
          oldDraft && !(await isRetiredExample(oldDraft))
            ? oldDraft
            : undefined;
        if (oldDraft && !prior) await localWrite('draft', newEntry());
        const mode = await localRead<boolean>('localMode');
        if (!mounted.current) return;
        setLocalEntries(saved);
        setDraft(prior || newEntry());
        setLocalMode(offline || !!mode);
        if (prior) {
          setDirty(true);
          setDraftStatus('已恢复本机草稿');
        }
      } catch {
        if (mounted.current) {
          setDraft(newEntry());
          setError('本机草稿存储不可用，请勿关闭尚未保存的页面');
        }
      } finally {
        if (mounted.current) setReady(true);
      }
      if (!offline) {
        try {
          const s = await request('/api/diary/session');
          if (mounted.current) {
            setSession(s);
            const e = await request('/api/diary/entries');
            setEntries(e.entries);
          }
        } catch {
          /* No existing room is a normal first visit. */
        }
        try {
          const c = await request('/api/diary/ai');
          if (mounted.current) {
            setConfigured(c.configured);
            setProxyApiBases(c.proxyBases || BUILTIN_PROXY_BASES);
            setImageConfigured(!!c.imageConfigured);
            if (!settingsEdited.current) {
              setProtocol(c.protocol || 'openai');
              setImageApiBaseUrl(c.imageApiBaseUrl || DEFAULT_API_BASE_URL);
              setImageProtocol(c.imageProtocol || 'openai');
              setApiBaseUrl(c.apiBaseUrl || DEFAULT_API_BASE_URL);
              setTextModel(c.textModel);
              setImageModel(c.imageModel);
            }
          }
        } catch {
          /* Manual model connection remains available. */
        }
      }
    })();
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, [offline]);
  useEffect(() => {
    if (!ready || !draft) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localWrite('draft', draft)
        .then(() => {
          if (mounted.current) setDraftStatus('草稿已保存在本机');
        })
        .catch((e) => setError(e.message));
    }, 450);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, ready]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        // eslint-disable-next-line typescript/no-deprecated -- Required for older browser unload protection.
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  function patch(update: Partial<Entry>) {
    setDirty(true);
    setDraft((d) => (d ? { ...d, ...update } : d));
    setConflict(null);
  }
  function openModal(m: Modal) {
    setDialogError('');
    setModal(m);
  }
  async function run(label: string, fn: () => Promise<void>, dialog = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    if (dialog) setDialogError('');
    else {
      setError('');
      setNotice('');
    }
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '操作失败，请重试';
      if (dialog) setDialogError(msg);
      else {
        setError(msg);
        if (label === 'story') setStoryError(msg);
      }
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }
  async function ai(body: Record<string, unknown>) {
    const imageAction = body.action === 'image' || body.action === 'edit';
    const selectedBaseUrl = normalizeApiBaseUrl(
      imageAction ? imageApiBaseUrl : apiBaseUrl,
    );
    const suppliedKey = imageAction
      ? imageKey.trim() ||
        (selectedBaseUrl === normalizeApiBaseUrl(apiBaseUrl) &&
        protocol === imageProtocol
          ? key.trim()
          : '')
      : key.trim();
    if (
      !suppliedKey &&
      (offline || !(imageAction ? imageConfigured : configured))
    ) {
      throw new Error('请先点击右上角 AI 设置，连接模型服务后再生成');
    }
    abortRef.current = new AbortController();
    const timeout = AbortSignal.timeout(
      body.action === 'image' || body.action === 'edit' ? 185000 : 65000,
    );
    const signal = AbortSignal.any([abortRef.current.signal, timeout]);
    try {
      if (
        offline ||
        (suppliedKey &&
          (imageAction ? imageDirectConnection : directConnection))
      ) {
        return await generateJournal(
          body,
          suppliedKey,
          {
            text: textModel.trim(),
            image: imageModel.trim(),
            baseUrl: selectedBaseUrl,
            protocol: imageAction ? 'openai' : protocol,
            imageProtocol: imageAction ? imageProtocol : undefined,
          },
          fetch,
          signal,
        );
      }
      return await request(
        '/api/diary/ai',
        {
          ...body,
          key: suppliedKey,
          textModel: textModel.trim(),
          imageModel: imageModel.trim(),
          apiBaseUrl: selectedBaseUrl,
          protocol: imageAction ? 'openai' : protocol,
          imageProtocol: imageAction ? imageProtocol : undefined,
        },
        signal,
      );
    } catch (e) {
      if (e instanceof AIError) throw e;
      if (e instanceof Error && e.name === 'TimeoutError')
        throw new Error('模型响应超时，片段已保留，请重试');
      if (e instanceof Error && e.name === 'AbortError')
        throw new Error('生成已取消，片段已保留');
      if (e instanceof TypeError)
        throw new Error(
          '无法连接模型服务，请检查网络及服务是否允许浏览器访问。片段已保留，可重试',
        );
      throw e;
    }
  }

  function loadEntry(entry: Entry) {
    const copy = structuredClone(entry);
    if (copy.sample) {
      copy.id = crypto.randomUUID();
      copy.revision = 0;
      delete copy.sample;
      copy.local = localMode;
      if (paired) {
        const other = role === 'host' ? 'guest' : 'host';
        copy.notes[role] = copy.notes.host + '\n' + copy.notes.guest;
        copy.notes[other] = '';
      }
    }
    setDraft(copy);
    setHistory([]);
    setConflict(null);
    setTab('write');
    setDirty(true);
    setModal(null);
    setNotice(
      entry.sample
        ? '已载入示例，可以修改后保存为你的日记'
        : '已打开日记，可补充自己的片段或编辑故事',
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function chooseEntry(entry: Entry) {
    if (hasDraft && dirty) {
      setPendingEntry(entry);
      openModal('replace');
    } else loadEntry(entry);
  }
  function startNew() {
    const blank = newEntry();
    if (hasDraft && dirty) {
      setPendingEntry(blank);
      openModal('replace');
    } else {
      setDraft(blank);
      setHistory([]);
      setTab('write');
      setConflict(null);
    }
  }
  function generateStory() {
    if (!draft || busyRef.current) return;
    setStoryError('');
    storyRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    void run('story', async () => {
      const result = await ai({
        action: 'story',
        notes: draft.notes,
        mode: draft.mode,
        references: allMemories
          .filter((e) => draft.references.includes(e.id))
          .map((e) => ({ title: e.title, story: e.story })),
      });
      if (!result.title || !result.story)
        throw new Error('故事没有完整返回，请重试');
      if (draft.story)
        setHistory((h) =>
          [{ title: draft.title, story: draft.story }, ...h].slice(0, 6),
        );
      patch({ title: result.title, story: result.story });
      requestAnimationFrame(() => {
        storyRef.current?.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        });
      });
      setNotice('故事已写好，可以直接修改标题和正文，再决定是否配图');
    });
  }
  async function addFile(file?: File) {
    if (!file || !draft) return;
    await run('upload', async () => {
      if (draft.pictures.length >= 6)
        throw new Error('每篇日记最多放 6 张图片');
      const src = await readPicture(file);
      patch({
        pictures: [
          ...draft.pictures,
          { id: crypto.randomUUID(), src, kind: 'uploaded', prompt: '' },
        ],
      });
      setNotice('照片已放入草稿，可以直接保留，也可以继续改图');
    });
  }
  function openImage(source?: Picture) {
    if (!draft) return;
    setImageDraft({
      ...imageDefault(),
      source,
      scene: source ? '保留人物和构图，调整为所选风格' : draft.title,
    });
    openModal('image');
  }
  async function save() {
    if (!draft || !draft.story.trim() || !draft.title.trim()) return;
    if (!localMode && !session) {
      openModal('space');
      setDialogError('先连接双人日记，再把这一页保存到共同记忆。草稿已保留。');
      return;
    }
    await run('save', async () => {
      if (localMode) {
        const next = {
          ...draft,
          local: true,
          sample: false,
          updatedAt: Date.now(),
          revision: draft.revision + 1,
        };
        const list = [next, ...localEntries.filter((e) => e.id !== next.id)];
        await localWrite('entries', list);
        await localWrite('draft', next);
        setLocalEntries(list);
        setDraft(next);
        setNotice('已保存到本机共同记忆');
      } else {
        const pictures: Picture[] = [];
        const uploads = new Map<string, string>();
        for (const p of draft.pictures) {
          const next = { ...p };
          for (const field of ['src', 'original'] as const) {
            const value = next[field];
            if (value?.startsWith('data:')) {
              let src = uploads.get(value);
              if (!src) {
                src = (await request('/api/diary/assets', { data: value })).src;
                uploads.set(value, src!);
              }
              next[field] = src!;
            }
          }
          pictures.push(next);
        }
        patch({ pictures });
        let toSave = { ...draft, pictures };
        if (draft.local) {
          toSave = { ...toSave, revision: 0 };
          const other = role === 'host' ? 'guest' : 'host';
          toSave.notes = {
            ...toSave.notes,
            [role]: [toSave.notes.host, toSave.notes.guest]
              .filter(Boolean)
              .join('\n'),
            [other]: '',
          };
        }
        try {
          const { entry } = await request('/api/diary/entries', toSave);
          setEntries((es) => [entry, ...es.filter((e) => e.id !== entry.id)]);
          setDraft(entry);
          await localWrite('draft', entry);
          setNotice('已保存到共同记忆，对方打开日记就能看到');
        } catch (e) {
          if (e instanceof Error && /更新|合并/.test(e.message)) {
            const list = await refresh();
            const latest = list.find((x) => x.id === draft.id);
            if (latest) setConflict(latest);
          }
          throw e;
        }
      }
      setDirty(false);
    });
  }
  async function exportAll() {
    await run('export', async () => {
      const list = allMemories.length ? allMemories : draft ? [draft] : [];
      const copy = structuredClone(list);
      for (const e of copy)
        for (const p of e.pictures)
          for (const field of ['src', 'original'] as const) {
            if (p[field]?.startsWith('/api/')) {
              const r = await fetch(p[field]!);
              if (!r.ok) throw new Error('图片未能下载，导出尚未完成');
              p[field] = await readPicture(
                new File([await r.blob()], 'image.jpg', {
                  type: r.headers.get('Content-Type') || 'image/jpeg',
                }),
              );
            }
          }
      exportEntries(copy);
      setNotice('共同记忆已导出，包含故事和上传的图片');
    });
  }
  async function makePrompt(manual = false) {
    void run(
      'prompt',
      async () => {
        if (
          !imageDraft.style.trim() ||
          !imageDraft.scene.trim() ||
          !imageDraft.characters.trim()
        )
          throw new Error('请先补充风格、画面内容和人物要求');
        if (manual) {
          setImageDraft((i) => ({
            ...i,
            step: 2,
            prompt: [
              i.scene,
              `风格：${i.style}`,
              `人物要求：${i.characters}`,
            ].join('。'),
          }));
          return;
        }
        const result = await ai({
          action: 'prompt',
          story: draft?.story,
          edit: !!imageDraft.source,
          style: imageDraft.style,
          scene: imageDraft.scene,
          characters: imageDraft.characters,
          size: imageDraft.size,
        });
        const prompt = result.prompt;
        if (!prompt) throw new Error('提示词没有完整返回，请重试');
        setImageDraft((i) => ({ ...i, step: 2, prompt }));
      },
      true,
    );
  }
  async function makeImage() {
    void run(
      'image',
      async () => {
        let input: string | undefined = imageDraft.source?.src;
        if (input && !input.startsWith('data:')) {
          const r = await fetch(input);
          if (!r.ok) throw new Error('原图读取失败，请重新上传');
          input = await readPicture(
            new File([await r.blob()], 'source.jpg', {
              type: r.headers.get('Content-Type') || 'image/jpeg',
            }),
          );
        }
        const result = await ai({
          action: input ? 'edit' : 'image',
          prompt: imageDraft.prompt,
          size: imageDraft.size,
          image: input,
          confirmed: true,
        });
        let image = result.image;
        if (!image && result.imageUrl) {
          try {
            const response = await fetch(result.imageUrl, {
              credentials: 'omit',
              referrerPolicy: 'no-referrer',
              redirect: 'error',
              signal: AbortSignal.any([
                abortRef.current!.signal,
                AbortSignal.timeout(30000),
              ]),
            });
            if (!response.ok || !response.body) throw new Error('download');
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let length = 0;
            try {
              while (true) {
                const part = await reader.read();
                if (part.done) break;
                length += part.value.length;
                if (length > 8 * 1024 * 1024) throw new Error('size');
                chunks.push(part.value);
              }
            } finally {
              await reader.cancel();
            }
            const bytes = new Uint8Array(length);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.length;
            }
            image = await readPicture(
              new File([bytes], 'generated', {
                type: response.headers.get('Content-Type') || 'image/png',
              }),
            );
          } catch {
            if (abortRef.current?.signal.aborted)
              throw new Error('生成已取消，片段已保留');
            throw new Error(
              '图片已生成，但图片链接无法读取、过大或不允许跨域访问。请让服务返回 Base64 图片，或下载后手动上传',
            );
          }
        }
        if (!image) throw new Error('图片没有完整返回，请重试');
        setImageDraft((i) => ({ ...i, step: 3, result: image }));
      },
      true,
    );
  }
  function acceptImage() {
    if (!draft || !imageDraft.result) return;
    const picture: Picture = {
      id: crypto.randomUUID(),
      src: imageDraft.result,
      kind: 'generated',
      prompt: imageDraft.prompt,
      ...(imageDraft.source
        ? {
            original: imageDraft.source.original || imageDraft.source.src,
            originalKind:
              imageDraft.source.originalKind || imageDraft.source.kind,
          }
        : {}),
    };
    const pictures = imageDraft.source
      ? draft.pictures.map((p) =>
          p.id === imageDraft.source!.id ? picture : p,
        )
      : [...draft.pictures, picture];
    patch({ pictures });
    setModal(null);
    setNotice('图片已放入草稿，保存日记后就会进入共同记忆');
  }
  async function connect() {
    await run(
      'connect',
      async () => {
        const s = await request('/api/diary/session', {
          action: spaceAction,
          displayName,
          inviteCode,
        });
        setSession(s);
        if (draft && draft.revision === 0) {
          const other = s.member.role === 'host' ? 'guest' : 'host';
          if (draft.notes[other])
            patch({
              notes: {
                ...draft.notes,
                [s.member.role]: [draft.notes.host, draft.notes.guest]
                  .filter(Boolean)
                  .join('\n'),
                [other]: '',
              },
            });
        }
        setLocalMode(false);
        await localWrite('localMode', false);
        const result = await request('/api/diary/entries');
        setEntries(result.entries);
        setDialogError('');
        setNotice('双人日记已连接，草稿可以保存到共同记忆');
      },
      true,
    );
  }
  async function enableLocalMode() {
    await run(
      'local',
      async () => {
        await localWrite('localMode', true);
        setLocalMode(true);
        setModal(null);
        setNotice('已切换为本机体验，日记保存在当前浏览器，不会同步给对方');
      },
      true,
    );
  }
  async function leaveLocal() {
    await run(
      'connect',
      async () => {
        await localWrite('localMode', false);
        setLocalMode(false);
        if (session) await refresh();
        setModal(null);
        setNotice('已切换到双人日记');
      },
      true,
    );
  }
  const shown = (showExamples ? examples : allMemories)
    .filter((e) => (e.title + e.story + e.date).includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(String(v))}
      className="journal"
    >
      <header className="journal-header">
        <button className="wordmark" onClick={() => setTab('write')}>
          <BookHeart />
          此间<small>BETWEEN US</small>
        </button>
        <TabsList className="journal-nav">
          <TabsTrigger value="write">
            <Feather />
            写日记
          </TabsTrigger>
          <TabsTrigger value="memories">
            <BookOpen />
            共同记忆
          </TabsTrigger>
        </TabsList>
        <div className="header-actions">
          <button className="people-button" onClick={() => openModal('space')}>
            <span className="pair-mark">
              <i>{names.host.slice(-1)}</i>
              <i>{names.guest.slice(-1)}</i>
            </span>
            {localMode
              ? '本机双人体验'
              : session
                ? `${session.member.displayName}的双人日记`
                : '连接两个人'}
          </button>
          <button
            className="icon-button"
            aria-label="AI 设置"
            title="AI 设置"
            onClick={() => openModal('settings')}
          >
            <Settings2 />
          </button>
        </div>
      </header>
      <main className="journal-main">
        {(error || notice) && (
          <div
            className={`inline-notice ${error ? 'error' : ''}`}
            role={error ? 'alert' : 'status'}
          >
            <span>{error || notice}</span>
            <button
              aria-label="关闭提示"
              onClick={() => {
                setError('');
                setNotice('');
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {conflict && (
          <div className="inline-notice error">
            <div>
              <p>
                对方已更新「{conflict.title}
                」。你的故事仍在编辑区，请比较后合并。
              </p>
              <details>
                <summary>查看对方最新故事</summary>
                <p style={{ whiteSpace: 'pre-wrap' }}>{conflict.story}</p>
              </details>
              <div className="conflict-actions">
                <button
                  className="button-secondary"
                  onClick={() => {
                    patch({
                      revision: conflict.revision,
                      notes: {
                        ...draft!.notes,
                        [role === 'host' ? 'guest' : 'host']:
                          conflict.notes[role === 'host' ? 'guest' : 'host'],
                      },
                    });
                    setNotice(
                      '已同步对方片段，保留了你的故事；检查合并后再次保存',
                    );
                  }}
                >
                  保留我的故事，合并对方片段
                </button>
                <button
                  className="text-button"
                  onClick={() => chooseEntry(conflict)}
                >
                  载入对方版本
                </button>
              </div>
            </div>
          </div>
        )}
        <TabsContent value="write">
          <div className="top-heading">
            <div>
              <p className="eyeline">OUR DAYS, IN OUR WORDS</p>
              <h1>今天，我们记住什么？</h1>
              <p>几句片段，一篇属于两个人的故事。</p>
            </div>
            <button
              className="text-button"
              onClick={() => startNew()}
              disabled={!!busy || !ready}
            >
              <Plus />
              新的一页
            </button>
          </div>
          {!draft ? (
            <div className="archive-empty">正在翻开日记…</div>
          ) : (
            <>
              <div className="work-grid">
                <section className="input-page">
                  <div className="page-caption">
                    <span className="step-label">
                      <b>01</b> 留下今天的片段
                    </span>
                    <input
                      className="date-input"
                      aria-label="日记日期"
                      type="date"
                      value={draft.date}
                      onChange={(e) => patch({ date: e.target.value })}
                      disabled={!!busy}
                    />
                  </div>
                  {(['host', 'guest'] as Person[]).map((p) => (
                    <div className="fragment" key={p}>
                      <label htmlFor={`note-${p}`}>
                        <span className={`person-dot ${p}`}>
                          {names[p].slice(-1)}
                        </span>
                        {paired
                          ? `${names[p]}的视角`
                          : p === 'host'
                            ? '我记得的'
                            : '你记得的'}
                        <small>
                          {p === role ? '正在写这一面' : '可以稍后补充'}
                        </small>
                      </label>
                      <textarea
                        id={`note-${p}`}
                        rows={3}
                        maxLength={2000}
                        value={draft.notes[p]}
                        disabled={!!busy || p !== role}
                        onChange={(e) =>
                          patch({
                            notes: { ...draft.notes, [p]: e.target.value },
                          })
                        }
                        placeholder={
                          p === role
                            ? '比如，第一次一起看海，牵手踩浪花，拍下了我们的影子。'
                            : paired
                              ? '等对方来补充，也可以先写成故事。'
                              : '切换到另一人的视角，补上这一天。'
                        }
                      />
                      {p === role && !draft.notes[p] && (
                        <div className="fragment-example">
                          {['一起去旅行', '被记得的小惊喜', '我们的纪念日'].map(
                            (s) => (
                              <button
                                className="chip"
                                key={s}
                                disabled={!!busy}
                                onClick={() =>
                                  patch({
                                    notes: { ...draft.notes, [p]: s + '，' },
                                  })
                                }
                              >
                                {s}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                      {p === 'guest' && !paired && (
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() =>
                            setActive((a) => (a === 'host' ? 'guest' : 'host'))
                          }
                        >
                          <Users />
                          切换到{active === 'host' ? '你' : '我'}的视角
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="mode-row">
                    <button
                      className="mode-choice"
                      aria-pressed={draft.mode === 'faithful'}
                      disabled={!!busy}
                      onClick={() => patch({ mode: 'faithful' })}
                    >
                      <strong>
                        <Feather size={16} />
                        忠实记录
                      </strong>
                      <small>整理经历，保留真实细节</small>
                    </button>
                    <button
                      className="mode-choice"
                      aria-pressed={draft.mode === 'creative'}
                      disabled={!!busy}
                      onClick={() => patch({ mode: 'creative' })}
                    >
                      <strong>
                        <Sparkles size={16} />
                        自由创作
                      </strong>
                      <small>加一点想象，写成小故事</small>
                    </button>
                  </div>
                  <details className="reference-select">
                    <summary>
                      <Link2 size={15} />
                      引用共同记忆{' '}
                      <span>（已选 {draft.references.length}）</span>
                    </summary>
                    <div className="reference-options">
                      {allMemories.filter((e) => e.id !== draft.id).length ? (
                        allMemories
                          .filter((e) => e.id !== draft.id)
                          .map((e) => (
                            <label key={e.id}>
                              <input
                                type="checkbox"
                                disabled={
                                  !!busy ||
                                  (!draft.references.includes(e.id) &&
                                    draft.references.length >= 10)
                                }
                                checked={draft.references.includes(e.id)}
                                onChange={(ev) =>
                                  patch({
                                    references: ev.target.checked
                                      ? [...draft.references, e.id]
                                      : draft.references.filter(
                                          (id) => id !== e.id,
                                        ),
                                  })
                                }
                              />
                              {e.title}
                            </label>
                          ))
                      ) : (
                        <p>保存第一篇日记后，就能在这里选择引用。</p>
                      )}
                    </div>
                  </details>
                  <button
                    className="button-primary wide"
                    disabled={
                      !!busy ||
                      (!draft.notes.host.trim() && !draft.notes.guest.trim())
                    }
                    onClick={() => generateStory()}
                  >
                    {busy === 'story' ? (
                      <Busy>正在写我们的故事…</Busy>
                    ) : (
                      <>
                        <Sparkles />
                        {draft.story ? '重新生成故事' : '写成我们的故事'}
                      </>
                    )}
                  </button>
                  <p className="help-note">
                    结果显示在「我们的故事」中，可直接编辑
                  </p>
                </section>
                <section
                  className="story-page"
                  ref={storyRef}
                  aria-label="故事输出与编辑"
                >
                  <div className="page-caption">
                    <span className="step-label">
                      <b>02</b> 我们的故事
                    </span>
                    <span className="badge">
                      {draft.mode === 'creative' ? '含想象创作' : '忠实记录'}
                    </span>
                  </div>
                  <div
                    className={`generation-feedback ${storyError ? 'error' : ''}`}
                  >
                    {busy === 'story' ? (
                      <output aria-live="polite">
                        <Busy>正在整理你的片段，生成后会显示在下方…</Busy>
                        <p>通常需要一些时间。如果等待过久，可以取消后重试。</p>
                        <button
                          className="text-button"
                          onClick={() => abortRef.current?.abort()}
                        >
                          取消生成
                        </button>
                      </output>
                    ) : storyError ? (
                      <>
                        <p>{storyError}</p>
                        <button
                          className="text-button"
                          onClick={() => openModal('settings')}
                        >
                          检查 AI 设置
                        </button>
                      </>
                    ) : !draft.story ? (
                      <>
                        <p>
                          生成的故事会显示在这里。写好片段后点击「写成我们的故事」，也可直接输入正文。
                        </p>
                        <button
                          className="text-button"
                          onClick={() => storyTextRef.current?.focus()}
                        >
                          我想自己写
                        </button>
                      </>
                    ) : (
                      <p>故事已显示在下方，可以直接修改标题和正文。</p>
                    )}
                  </div>
                  <input
                    className="story-title"
                    aria-label="故事标题"
                    value={draft.title}
                    placeholder="给今天起个名字"
                    maxLength={100}
                    disabled={!!busy}
                    onChange={(e) => patch({ title: e.target.value })}
                  />
                  <textarea
                    ref={storyTextRef}
                    className="story-text"
                    aria-label="故事正文"
                    value={draft.story}
                    placeholder="这一页由你开始。写下今天的故事，也可以让 AI 帮你整理左边的片段。"
                    maxLength={15000}
                    disabled={!!busy}
                    onChange={(e) => patch({ story: e.target.value })}
                  />
                  <div className="story-meta">
                    <span>可直接编辑</span>
                    <span>
                      {draft.story.length} 字{' '}
                      {history.length > 0 && (
                        <button
                          className="text-button"
                          onClick={() => openModal('history')}
                          disabled={!!busy}
                        >
                          <History size={13} />
                          上一版
                        </button>
                      )}
                    </span>
                  </div>
                  {draft.pictures.length > 0 && (
                    <div className="image-strip">
                      {draft.pictures.map((p) => (
                        <article className="picture-card" key={p.id}>
                          <img
                            src={p.src}
                            alt={
                              p.kind === 'generated' ? '故事配图' : '日记照片'
                            }
                          />
                          <button
                            className="remove-picture"
                            aria-label="从日记移除图片"
                            disabled={!!busy}
                            onClick={() =>
                              patch({
                                pictures: draft.pictures.filter(
                                  (x) => x.id !== p.id,
                                ),
                              })
                            }
                          >
                            <X size={13} />
                          </button>
                          <footer>
                            <span>
                              {p.kind === 'generated' ? 'AI 配图' : '我的照片'}
                            </span>
                            <button
                              className="text-button"
                              onClick={() => openImage(p)}
                              disabled={!!busy}
                            >
                              <WandSparkles size={13} />
                              改图
                            </button>
                            {p.original && (
                              <button
                                className="text-button"
                                disabled={!!busy}
                                onClick={() =>
                                  patch({
                                    pictures: draft.pictures.map((x) =>
                                      x.id === p.id
                                        ? {
                                            ...x,
                                            src: p.original!,
                                            original: undefined,
                                            kind: p.originalKind || 'uploaded',
                                            originalKind: undefined,
                                            prompt: '',
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              >
                                恢复原图
                              </button>
                            )}
                          </footer>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className="story-toolbar">
                    <div className="story-tools">
                      <button
                        className="text-button"
                        disabled={
                          !!busy ||
                          !draft.story.trim() ||
                          draft.pictures.length >= 6
                        }
                        onClick={() => openImage()}
                      >
                        <ImagePlus />
                        为故事配图
                      </button>
                      <button
                        className="text-button"
                        disabled={!!busy || draft.pictures.length >= 6}
                        onClick={() => uploadRef.current?.click()}
                      >
                        <Upload />
                        放一张照片
                      </button>
                    </div>
                    <button
                      className="button-primary"
                      disabled={
                        !!busy || !draft.title.trim() || !draft.story.trim()
                      }
                      onClick={() => void save()}
                    >
                      {busy === 'save' ? (
                        <Busy>正在保存</Busy>
                      ) : (
                        <>
                          <BookHeart />
                          存入共同记忆
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    ref={uploadRef}
                    className="sr-file"
                    aria-label="上传日记照片"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      void addFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="help-note paste-target"
                    aria-label="粘贴照片区域"
                    onPaste={(e) => {
                      const file = Array.from(e.clipboardData.files)[0];
                      if (file) {
                        e.preventDefault();
                        void addFile(file);
                      }
                    }}
                  >
                    也可以点击这里，粘贴剪贴板里的照片
                  </button>
                </section>
              </div>
              <div className="below-book">
                <p>
                  {localMode ? <HardDrive size={14} /> : <Cloud size={14} />}{' '}
                  {localMode
                    ? '本机体验 · 两人可切换视角，尚未跨设备同步'
                    : session
                      ? '双人日记 · 保存后同步给彼此'
                      : '草稿先留在本机，连接两个人后保存到共同记忆'}
                </p>
                <span className="draft-status" aria-live="polite">
                  {draftStatus}
                </span>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="memories">
          <div className="top-heading">
            <div>
              <p className="eyeline">THE DAYS WE KEEP</p>
              <h1>把我们的日子，收在这里。</h1>
              <p>一起写过的故事，都有迹可循。</p>
            </div>
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() => startNew()}
            >
              <Plus />
              写一篇日记
            </button>
          </div>
          <div className="memory-controls">
            <input
              aria-label="搜索共同记忆"
              placeholder="搜索故事、关键词或日期"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="counts">
              {shown.length} 篇{showExamples ? '示例' : '记忆'}
            </span>
            <div className="story-tools">
              <button
                className="text-button"
                onClick={() => setShowExamples((s) => !s)}
              >
                {showExamples ? '回到我们的记忆' : '看看示例'}
              </button>
              {session && !localMode && (
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() =>
                    void run('refresh', async () => {
                      await refresh();
                      setNotice('共同记忆已刷新');
                    })
                  }
                >
                  <RefreshCw />
                  刷新
                </button>
              )}
              <button
                className="text-button"
                disabled={!!busy || !allMemories.length}
                onClick={() => void exportAll()}
              >
                <Download />
                导出
              </button>
            </div>
          </div>
          {shown.length ? (
            <div className="memory-grid">
              {shown.map((e) => (
                <button
                  className="memory-card"
                  key={e.id}
                  onClick={() => chooseEntry(e)}
                  disabled={!!busy}
                >
                  {e.pictures[0] ? (
                    <img src={e.pictures[0].src} alt={e.title} loading="lazy" />
                  ) : (
                    <div className="memory-text-cover">
                      <BookOpen size={43} strokeWidth={1} />
                    </div>
                  )}
                  <div className="memory-content">
                    <div className="memory-date">
                      <span>{e.date.replaceAll('-', ' . ')}</span>
                      <span>
                        {e.sample
                          ? '示例故事'
                          : e.local
                            ? '本机记忆'
                            : e.mode === 'creative'
                              ? '自由创作'
                              : '忠实记录'}
                      </span>
                    </div>
                    <h2>{e.title}</h2>
                    <p>{e.story}</p>
                    <div className="memory-foot">
                      <span>
                        {e.notes.host && e.notes.guest
                          ? '两个人的片段'
                          : '等另一段记忆'}
                        {e.pictures[0]?.kind === 'generated'
                          ? ' · AI 配图'
                          : ''}
                      </span>
                      <ArrowUpRight size={16} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="archive-empty">
              <h2>
                {query ? '还没找到这一段回忆' : '第一篇故事，等你们来写。'}
              </h2>
              <p>
                {query
                  ? '换个关键词，或者清空搜索看看。'
                  : '一个片段就可以开始，另一人随后补充。'}
              </p>
              <button
                className="button-secondary"
                onClick={() => (query ? setQuery('') : setShowExamples(true))}
              >
                {query ? '清空搜索' : '先翻翻示例日记'}
              </button>
            </div>
          )}
        </TabsContent>
      </main>
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setModal(null);
        }}
      >
        <DialogContent className="journal-dialog" showCloseButton={!busy}>
          {modal === 'settings' && (
            <>
              <DialogTitle>连接你的 AI</DialogTitle>
              <DialogDescription className="dialog-intro">
                支持 OpenAI 兼容、Anthropic 和 Gemini
                文本接口。填写服务商对应的地址、Key 和完整模型 ID。
                密钥只留在当前页面内存，刷新后需重新填写。
              </DialogDescription>
              <div
                className="dialog-fields"
                onChangeCapture={() => {
                  settingsEdited.current = true;
                  setConnectionStatus('');
                }}
              >
                <label className="field">
                  服务预设
                  <select
                    aria-label="服务预设"
                    defaultValue="custom"
                    disabled={!!busy}
                    onChange={(e) => {
                      const preset = AI_PRESETS.find(
                        (p) => p.id === e.target.value,
                      );
                      if (!preset) return;
                      setApiBaseUrl(preset.baseUrl);
                      setProtocol(preset.protocol);
                      setTextModel(preset.model);
                      setKey('');
                      setDirectConnection(false);
                      setConnectionStatus('');
                    }}
                  >
                    <option value="custom">自定义 / 当前配置</option>
                    {AI_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  接口协议
                  <select
                    aria-label="接口协议"
                    value={protocol}
                    disabled={!!busy}
                    onChange={(e) =>
                      setProtocol(e.target.value as TextProtocol)
                    }
                  >
                    <option value="openai">
                      OpenAI 兼容（Chat Completions）
                    </option>
                    <option value="anthropic">Anthropic（Messages）</option>
                    <option value="gemini">Gemini（Generate Content）</option>
                  </select>
                </label>
                <label className="field">
                  API 地址（Base URL）
                  <input
                    type="url"
                    value={apiBaseUrl}
                    autoComplete="off"
                    disabled={!!busy}
                    placeholder="https://服务商域名/v1"
                    onChange={(e) => {
                      setApiBaseUrl(e.target.value);
                      setKey('');
                    }}
                  />
                </label>
                <p className="help-note">
                  使用服务商提供的接口地址，不是官网首页。更换平台后也要填写该平台支持的模型
                  ID。
                </p>
                {configured && (
                  <div className="status-card">
                    已配置站点 AI
                    服务。连接双人日记后可使用，也可填写自己的密钥。
                  </div>
                )}
                <label className="field">
                  API Key
                  <input
                    type="password"
                    disabled={!!busy}
                    autoComplete="off"
                    value={key}
                    placeholder="填写你的 API Key"
                    onChange={(e) => setKey(e.target.value)}
                  />
                </label>
                <div className="two-fields">
                  <label className="field">
                    写作模型
                    <input
                      disabled={!!busy}
                      placeholder="填写服务商的模型 ID"
                      value={textModel}
                      onChange={(e) => setTextModel(e.target.value)}
                      maxLength={120}
                    />
                  </label>
                </div>
                <details>
                  <summary>配图服务（可选，单独配置）</summary>
                  <p className="help-note">
                    支持 OpenAI Images 兼容、Gemini 原生图片和豆包 Seedream
                    接口。需填写支持生图的模型；改图还需该模型支持参考图输入。
                  </p>
                  <label className="field">
                    图片服务预设
                    <select
                      aria-label="图片服务预设"
                      defaultValue="custom"
                      disabled={!!busy}
                      onChange={(e) => {
                        const preset = IMAGE_PRESETS.find(
                          (p) => p.id === e.target.value,
                        );
                        if (!preset) return;
                        setImageApiBaseUrl(preset.baseUrl);
                        setImageProtocol(preset.protocol);
                        setImageModel(preset.model);
                        setImageKey('');
                        setImageDirectConnection(false);
                      }}
                    >
                      <option value="custom">自定义 / 当前配置</option>
                      {IMAGE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    图片接口协议
                    <select
                      aria-label="图片接口协议"
                      value={imageProtocol}
                      disabled={!!busy}
                      onChange={(e) => {
                        setImageProtocol(e.target.value as ImageProtocol);
                        setImageKey('');
                      }}
                    >
                      <option value="openai">
                        OpenAI Images 兼容（可接其他平台）
                      </option>
                      <option value="gemini">Gemini 原生图片</option>
                      <option value="seedream">豆包 Seedream</option>
                    </select>
                  </label>
                  <label className="field">
                    图片连接方式
                    <select
                      aria-label="图片连接方式"
                      value={imageDirectConnection ? 'direct' : 'proxy'}
                      disabled={!!busy || offline}
                      onChange={(e) =>
                        setImageDirectConnection(e.target.value === 'direct')
                      }
                    >
                      <option value="proxy">站点转发（内置服务）</option>
                      <option value="direct">
                        浏览器直连（服务需允许跨域）
                      </option>
                    </select>
                  </label>
                  <p className="help-note">
                    自定义服务可选择浏览器直连；站点转发需要预先配置服务地址。离线文件始终使用直连。
                  </p>
                  <label className="field">
                    图片 API 地址
                    <input
                      type="url"
                      value={imageApiBaseUrl}
                      disabled={!!busy}
                      onChange={(e) => {
                        setImageApiBaseUrl(e.target.value);
                        setImageKey('');
                      }}
                    />
                  </label>
                  <label className="field">
                    图片 API Key
                    <input
                      type="password"
                      value={imageKey}
                      autoComplete="off"
                      disabled={!!busy}
                      placeholder="同地址、同协议时可留空复用写作 Key"
                      onChange={(e) => setImageKey(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    图片模型
                    <input
                      placeholder="填写服务商的图片模型 ID 或接入点 ID"
                      value={imageModel}
                      disabled={!!busy}
                      maxLength={120}
                      onChange={(e) => setImageModel(e.target.value)}
                    />
                  </label>
                </details>
                <p className="help-note">
                  生成时将向所填服务发送当前片段、选中的记忆或原图。用量计入该服务账户；下方测试连接仅验证写作服务，不代表图片服务已验证。配图将在确认提示词后调用所选图片服务。
                </p>
                {!offline && (
                  <label className="field">
                    连接方式
                    <select
                      aria-label="连接方式"
                      value={directConnection ? 'direct' : 'server'}
                      disabled={!!busy}
                      onChange={(e) =>
                        setDirectConnection(e.target.value === 'direct')
                      }
                    >
                      <option value="server">通过站点连接（推荐）</option>
                      <option value="direct">
                        浏览器直连（服务需允许跨域）
                      </option>
                    </select>
                  </label>
                )}
                {!offline &&
                  !proxyApiBases.includes(apiBaseUrl.replace(/\/+$/, '')) && (
                    <p className="help-note">
                      自定义服务如尚未配置站点转发，可选择浏览器直连。若服务不允许跨域，需要由部署者添加该服务地址。
                    </p>
                  )}
                {connectionStatus && (
                  <output className="status-card">{connectionStatus}</output>
                )}
                {offline && (
                  <div className="status-card">
                    本地版联网后可直接调用模型。只填写自己的片段即可生成，
                    日记保存在本机；跨设备同步需使用在线版本。
                  </div>
                )}
              </div>
              <div className="dialog-actions">
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => {
                    setKey('');
                    setImageKey('');
                  }}
                >
                  清除密钥
                </button>
                <button
                  className="button-secondary"
                  disabled={!!busy}
                  onClick={() => {
                    setConnectionStatus('');
                    void run(
                      'test',
                      async () => {
                        await ai({ action: 'test' });
                        setConnectionStatus('连接成功，当前写作模型可返回文本');
                      },
                      true,
                    );
                  }}
                >
                  {busy === 'test' ? <Busy>正在测试…</Busy> : '测试连接'}
                </button>
                <button
                  className="button-primary"
                  disabled={!!busy}
                  onClick={() => {
                    try {
                      setApiBaseUrl(normalizeApiBaseUrl(apiBaseUrl));
                    } catch (e) {
                      setDialogError(
                        e instanceof Error ? e.message : 'API 地址不正确',
                      );
                      return;
                    }
                    if (!textModel.trim()) {
                      setDialogError('请填写写作模型名称');
                      return;
                    }
                    setModal(null);
                    setNotice(
                      key ? '模型设置已应用，生成时将验证连接' : '设置已应用',
                    );
                  }}
                >
                  应用设置
                </button>
              </div>
            </>
          )}
          {modal === 'space' && (
            <>
              <DialogTitle>
                {session ? '我们的双人日记' : '连接两个人的一本日记'}
              </DialogTitle>
              <DialogDescription className="dialog-intro">
                一个人先创建，另一个人用邀请码加入。每人补充自己的片段，故事与图片共同编辑。
              </DialogDescription>
              {session ? (
                <div className="dialog-fields">
                  <div className="status-card">
                    <p>
                      {session.member.displayName} ＆{' '}
                      {session.partner?.displayName || '等待另一人加入'}
                    </p>
                    <p>这本日记的邀请码</p>
                    <div className="invite-code">
                      {session.space.inviteCode}
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(
                          'copy',
                          async () => {
                            await navigator.clipboard.writeText(
                              session.space.inviteCode,
                            );
                            setNotice('邀请码已复制');
                          },
                          true,
                        )
                      }
                    >
                      复制邀请码
                    </button>
                    <p>对方还需有此网站的访问权限。</p>
                  </div>
                  {localMode ? (
                    <button
                      className="button-primary"
                      onClick={() => void leaveLocal()}
                      disabled={!!busy}
                    >
                      回到云端双人日记
                    </button>
                  ) : (
                    <button
                      className="button-primary"
                      onClick={() => setModal(null)}
                    >
                      继续写日记
                    </button>
                  )}
                </div>
              ) : (
                <div className="dialog-fields">
                  <div className="style-choices">
                    <button
                      aria-pressed={spaceAction === 'create'}
                      onClick={() => setSpaceAction('create')}
                      disabled={!!busy}
                    >
                      创建一本
                    </button>
                    <button
                      aria-pressed={spaceAction === 'join'}
                      onClick={() => setSpaceAction('join')}
                      disabled={!!busy}
                    >
                      加入对方
                    </button>
                  </div>
                  <label className="field">
                    你的称呼
                    <input
                      maxLength={20}
                      value={displayName}
                      placeholder="让对方怎么称呼你"
                      onChange={(e) => setDisplayName(e.target.value)}
                      disabled={!!busy}
                    />
                  </label>
                  {spaceAction === 'join' && (
                    <label className="field">
                      对方的邀请码
                      <input
                        value={inviteCode}
                        maxLength={6}
                        placeholder="6 位邀请码"
                        onChange={(e) =>
                          setInviteCode(e.target.value.toUpperCase())
                        }
                        disabled={!!busy}
                      />
                    </label>
                  )}
                  <button
                    className="button-primary"
                    disabled={
                      !!busy ||
                      offline ||
                      !displayName.trim() ||
                      (spaceAction === 'join' && inviteCode.length !== 6)
                    }
                    onClick={() => void connect()}
                  >
                    {busy === 'connect' ? (
                      <Busy>正在连接</Busy>
                    ) : spaceAction === 'create' ? (
                      '创建双人日记'
                    ) : (
                      '加入双人日记'
                    )}
                  </button>
                </div>
              )}
              <hr className="hint-divider" />
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => void enableLocalMode()}
              >
                <HardDrive />
                仅在本机体验
              </button>
              <p className="help-note">
                本机体验支持切换双方视角，记录不会同步到其他设备。
              </p>
            </>
          )}
          {modal === 'image' && (
            <>
              <DialogTitle>
                {imageDraft.source
                  ? '给照片一点新模样'
                  : '给这一页，配一幅画。'}
              </DialogTitle>
              <DialogDescription className="dialog-intro">
                先说清你想要的画面，再生成。
                {imageDraft.source
                  ? '原图会保留，可以随时恢复。'
                  : '喜欢的图片再放进日记。'}
              </DialogDescription>
              <div className="image-steps">
                <span className={imageDraft.step === 1 ? 'active' : ''}>
                  01 确认画面
                </span>
                <span>／</span>
                <span className={imageDraft.step === 2 ? 'active' : ''}>
                  02 编辑提示词
                </span>
                <span>／</span>
                <span className={imageDraft.step === 3 ? 'active' : ''}>
                  03 选择图片
                </span>
              </div>
              {imageDraft.source && (
                <div className="source-thumb">
                  <img src={imageDraft.source.src} alt="待修改的原图" />
                  <div>
                    以这张照片为基础<p>可以改风格、局部内容或添加静态特效</p>
                  </div>
                </div>
              )}
              <fieldset className="dialog-fieldset" disabled={!!busy}>
                {imageDraft.step === 1 && (
                  <>
                    <div className="dialog-fields">
                      <div className="field">
                        <span>你想要哪种风格？</span>
                        <div className="style-choices">
                          {['胶片摄影', '水彩手绘', '日系漫画', '复古拼贴'].map(
                            (s) => (
                              <button
                                key={s}
                                aria-pressed={imageDraft.style === s}
                                onClick={() =>
                                  setImageDraft((i) => ({ ...i, style: s }))
                                }
                              >
                                {s}
                              </button>
                            ),
                          )}
                        </div>
                        <input
                          aria-label="自定义图片风格"
                          placeholder="也可以自己描述风格"
                          value={imageDraft.style}
                          onChange={(e) =>
                            setImageDraft((i) => ({
                              ...i,
                              style: e.target.value,
                            }))
                          }
                          maxLength={300}
                        />
                      </div>
                      <label className="field">
                        {imageDraft.source
                          ? '你想怎么修改？'
                          : '最想画下哪一幕？'}
                        <textarea
                          value={imageDraft.scene}
                          onChange={(e) =>
                            setImageDraft((i) => ({
                              ...i,
                              scene: e.target.value,
                            }))
                          }
                          maxLength={1000}
                          placeholder="比如，第一次看海时，我们牵着手走向小浪花"
                        />
                      </label>
                      {imageDraft.source && (
                        <div className="style-choices">
                          {[
                            '加入轻微胶片颗粒与暖光',
                            '背景增加柔和光斑，保留人物',
                            '改成水彩画，保留人物动作',
                          ].map((s) => (
                            <button
                              key={s}
                              onClick={() =>
                                setImageDraft((i) => ({ ...i, scene: s }))
                              }
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      <label className="field">
                        人物有哪些需要保留的细节？
                        <textarea
                          value={imageDraft.characters}
                          onChange={(e) =>
                            setImageDraft((i) => ({
                              ...i,
                              characters: e.target.value,
                            }))
                          }
                          maxLength={1000}
                          placeholder="发型、衣服、动作，或不展示正脸"
                        />
                      </label>
                      <label className="field">
                        画面比例
                        <select
                          value={imageDraft.size}
                          onChange={(e) =>
                            setImageDraft((i) => ({
                              ...i,
                              size: e.target.value,
                            }))
                          }
                        >
                          <option value="1536x1024">横幅 · 3:2</option>
                          <option value="1024x1024">方形 · 1:1</option>
                          <option value="1024x1536">竖幅 · 2:3</option>
                        </select>
                      </label>
                    </div>
                    <div className="dialog-actions">
                      <button
                        className="text-button"
                        onClick={() => void makePrompt(true)}
                      >
                        我自己写提示词
                      </button>
                      <button
                        className="button-primary"
                        onClick={() => void makePrompt()}
                      >
                        {busy === 'prompt' ? (
                          <Busy>正在整理画面</Busy>
                        ) : (
                          <>
                            <Sparkles />
                            生成配图提示词
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
                {imageDraft.step === 2 && (
                  <>
                    <label className="field">
                      这一段将用于{imageDraft.source ? '修改照片' : '生成图片'}
                      <textarea
                        aria-label="图片提示词"
                        style={{ minHeight: 200 }}
                        value={imageDraft.prompt}
                        maxLength={6000}
                        onChange={(e) =>
                          setImageDraft((i) => ({
                            ...i,
                            prompt: e.target.value,
                          }))
                        }
                      />
                      <small>
                        {imageDraft.style} ·{' '}
                        {imageDraft.size === '1536x1024'
                          ? '横幅 3:2'
                          : imageDraft.size === '1024x1024'
                            ? '方形 1:1'
                            : '竖幅 2:3'}{' '}
                        · 可自由修改提示词
                      </small>
                    </label>
                    <div className="dialog-actions">
                      <button
                        className="text-button"
                        onClick={() =>
                          setImageDraft((i) => ({ ...i, step: 1 }))
                        }
                      >
                        返回澄清
                      </button>
                      <button
                        className="button-primary"
                        disabled={!imageDraft.prompt.trim()}
                        onClick={() => void makeImage()}
                      >
                        {busy === 'image' ? (
                          <Busy>画面正在生成…</Busy>
                        ) : (
                          <>
                            <WandSparkles />
                            确认并{imageDraft.source ? '改图' : '生图'}
                          </>
                        )}
                      </button>
                    </div>
                    <p className="help-note">
                      图片可能需要一两分钟。生成后先预览，再决定是否使用。
                    </p>
                  </>
                )}
                {imageDraft.step === 3 && (
                  <>
                    <img
                      className="result-image"
                      src={imageDraft.result}
                      alt="本次 AI 生成的图片"
                    />
                    <div className="dialog-actions">
                      <button
                        className="text-button"
                        onClick={() =>
                          setImageDraft((i) => ({ ...i, step: 2 }))
                        }
                      >
                        调整提示词再生成
                      </button>
                      <a
                        className="file-download"
                        href={imageDraft.result}
                        download="此间-故事配图.jpg"
                      >
                        下载图片
                      </a>
                      <button className="button-primary" onClick={acceptImage}>
                        <Check />
                        用这张，放进日记
                      </button>
                    </div>
                  </>
                )}
              </fieldset>
              {busy === 'image' && (
                <button
                  className="text-button"
                  onClick={() => abortRef.current?.abort()}
                >
                  停止等待
                </button>
              )}
            </>
          )}
          {modal === 'history' && (
            <>
              <DialogTitle>刚才的故事版本</DialogTitle>
              <DialogDescription>
                恢复旧版本前，会把当前版本也留在这里。版本记录保留到离开当前日记。
              </DialogDescription>
              <div className="history-list">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const current = {
                        title: draft!.title,
                        story: draft!.story,
                      };
                      patch(h);
                      setHistory((all) =>
                        [current, ...all.filter((_, j) => j !== i)].slice(0, 6),
                      );
                      setModal(null);
                    }}
                  >
                    恢复「{h.title}」<p>{h.story.slice(0, 80)}…</p>
                  </button>
                ))}
              </div>
            </>
          )}
          {modal === 'replace' && (
            <>
              <DialogTitle>先收好正在写的这一页</DialogTitle>
              <DialogDescription>
                打开另一篇会替换当前编辑区。可以先导出草稿留底，或返回保存到共同记忆。
              </DialogDescription>
              <div className="dialog-actions">
                <button
                  className="text-button"
                  onClick={() => draft && exportEntries([draft])}
                >
                  导出当前草稿
                </button>
                <button
                  className="button-secondary"
                  onClick={() => setModal(null)}
                >
                  返回继续写
                </button>
                <button
                  className="button-primary"
                  onClick={() => pendingEntry && loadEntry(pendingEntry)}
                >
                  替换并打开
                </button>
              </div>
            </>
          )}
          {dialogError && (
            <div className="dialog-error" role="alert">
              {dialogError}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
