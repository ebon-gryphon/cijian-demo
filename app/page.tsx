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
  PenLine,
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
  migrateLegacy,
  migrateSharedMemories,
  type Entry,
  type Person,
  type Picture,
} from './journal-model';
import {
  localRead,
  localWrite,
  readPicture,
  exportEntries,
  restoreLegacyPictures,
} from './journal-storage';
import './journal.css';
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
    throw new Error('离线文件支持本机记录；AI 与双人同步请使用在线预览');
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
    textModel: string;
    imageModel: string;
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
  const [draftStatus, setDraftStatus] = useState('');
  const [key, setKey] = useState('');
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
      request('/api/beta/session'),
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
        const saved = (await localRead<Entry[]>('entries')) || [];
        const prior = await localRead<Entry>('draft');
        const mode = await localRead<boolean>('localMode');
        let migrated: Entry[] = [];
        if (!(await localRead<boolean>('legacyMigrated'))) {
          let migrationSucceeded = true;
          try {
            migrated = migrateLegacy(
              localStorage.getItem('cijian-two-person-diary-v1'),
            );
            migrated.push(
              ...migrateSharedMemories(
                localStorage.getItem('between-us-demo-v1'),
              ),
            );
            migrated = await restoreLegacyPictures(
              migrated,
              localStorage.getItem('between-us-demo-v1'),
            );
          } catch {
            migrationSucceeded = false;
            migrated = [];
            setError('旧日记暂时无法读取，原始数据仍保留在本机');
          }
          await localWrite('entries', [
            ...saved,
            ...migrated.filter((e) => !saved.some((x) => x.id === e.id)),
          ]);
          if (migrationSucceeded) await localWrite('legacyMigrated', true);
        }
        if (!mounted.current) return;
        setLocalEntries([
          ...saved,
          ...migrated.filter((e) => !saved.some((x) => x.id === e.id)),
        ]);
        setDraft(prior || newEntry());
        setLocalMode(offline || !!mode);
        if (prior) {
          setDirty(true);
          setDraftStatus('已恢复本机草稿');
        }
        if (migrated.length)
          setNotice(
            `已保留 ${migrated.length} 篇旧日记，可在共同记忆中查看并转存`,
          );
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
          const s = await request('/api/beta/session');
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
            setTextModel(c.textModel);
            setImageModel(c.imageModel);
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
      else setError(msg);
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }
  async function ai(body: Record<string, unknown>) {
    if (!key && !configured) {
      throw new Error('请先点击右上角 AI 设置，连接模型服务后再生成');
    }
    abortRef.current = new AbortController();
    return request(
      '/api/diary/ai',
      { ...body, key, textModel, imageModel },
      abortRef.current.signal,
    );
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
    if (!draft) return;
    void run('story', async () => {
      const result = await ai({
        action: 'story',
        notes: draft.notes,
        mode: draft.mode,
        references: allMemories
          .filter((e) => draft.references.includes(e.id))
          .map((e) => ({ title: e.title, story: e.story })),
      });
      if (draft.story)
        setHistory((h) =>
          [{ title: draft.title, story: draft.story }, ...h].slice(0, 6),
        );
      patch({ title: result.title, story: result.story });
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
        setImageDraft((i) => ({ ...i, step: 2, prompt: result.prompt }));
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
        setImageDraft((i) => ({ ...i, step: 3, result: result.image }));
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
        const s = await request('/api/beta/session', {
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
                            ? '比如，周末下雨，一起煮面，面有点糊了，但我们笑了很久。'
                            : paired
                              ? '等对方来补充，也可以先写成故事。'
                              : '切换到另一人的视角，补上这一天。'
                        }
                      />
                      {p === role && !draft.notes[p] && (
                        <div className="fragment-example">
                          {['一次约会', '平凡的小事', '想念的瞬间'].map((s) => (
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
                          ))}
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
                    生成后可自由编辑 · 也可以在右页直接写
                  </p>
                </section>
                <section className="story-page">
                  <div className="page-caption">
                    <span className="step-label">
                      <b>02</b> 我们的故事
                    </span>
                    <span className="badge">
                      {draft.mode === 'creative' ? '含想象创作' : '忠实记录'}
                    </span>
                  </div>
                  {!draft.story && !draft.title ? (
                    <div className="paper-empty">
                      <p className="quote">
                        那些很小的事，
                        <br />
                        也值得有一页。
                      </p>
                      <p>从左边的几句话开始，或自己写下故事。</p>
                      <figure className="sample-peek">
                        <img
                          src="/memories/rainy-noodles.jpg"
                          alt="雨天面馆里两个人的面碗，示例配图"
                        />
                        <figcaption>
                          雨没停，面已经吃完了<small>示例 · AI 配图</small>
                        </figcaption>
                      </figure>
                      <div className="empty-try">
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() => chooseEntry(examples[0])}
                        >
                          翻看这一篇示例 <ArrowUpRight />
                        </button>
                      </div>
                      <button
                        className="button-secondary"
                        disabled={!!busy}
                        onClick={() => patch({ title: '今天的小事' })}
                      >
                        <PenLine />
                        我想自己写
                      </button>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
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
                故事、提示词和图片使用同一个 OpenAI
                服务。密钥只留在当前页面内存，刷新后需重新填写。
              </DialogDescription>
              <div className="dialog-fields">
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
                      value={textModel}
                      onChange={(e) => setTextModel(e.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <label className="field">
                    图片模型
                    <input
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                      maxLength={120}
                    />
                  </label>
                </div>
                <p className="help-note">
                  生成时将发送当前片段、选中的记忆或原图。用量计入所用服务账户。
                </p>
                {offline && (
                  <div className="status-card">
                    离线文件可写日记和上传照片。AI
                    生成与跨设备同步需打开在线版本。
                  </div>
                )}
              </div>
              <div className="dialog-actions">
                <button className="text-button" onClick={() => setKey('')}>
                  清除密钥
                </button>
                <button
                  className="button-primary"
                  onClick={() => {
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
                          placeholder="比如，两人坐在面馆窗边，窗外下着雨"
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
