'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  Clock3,
  Copy,
  Heart,
  Link2,
  LoaderCircle,
  LogOut,
  MessageCircle,
  UserPlus,
  Users,
} from 'lucide-react';

const TOKEN_KEY = 'between-us-beta-token-v1';

type Member = {
  id: string;
  displayName: string;
  role: 'host' | 'guest';
  receptionEnabled: boolean;
  manualBusy: boolean;
  lastSeenAt: number;
};

type Session = {
  member: Member & { spaceId: string };
  partner: Member | null;
  space: { id: string; inviteCode: string };
};

type RoomMessage = {
  id: string;
  text: string;
  authorType: 'human' | 'assistant';
  senderMemberId: string | null;
  senderName: string | null;
  assistantForMemberId: string | null;
  pending: boolean;
  replyMode: 'model' | 'local' | 'fallback' | null;
  createdAt: number;
};

async function api<T>(
  path: string,
  token = '',
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, {
    ...init,
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后重试');
  return data;
}

function initials(name: string) {
  return Array.from(name.trim()).slice(-2).join('');
}

function relativeStatus(lastSeenAt: number) {
  const age = Date.now() - lastSeenAt;
  if (age < 12_000) return '在线';
  if (age < 60_000) return '刚刚在线';
  return '暂时离开';
}

export default function OnlineRoom() {
  const [token, setToken] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (currentToken: string, quiet = false) => {
    try {
      const [nextSession, messageData] = await Promise.all([
        api<Session>('/api/beta/session', currentToken),
        api<{ messages: RoomMessage[] }>('/api/beta/messages', currentToken),
      ]);
      setSession(nextSession);
      setMessages(messageData.messages);
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '同步失败';
      if (/重新进入|失效/.test(message)) {
        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setSession(null);
      } else if (!quiet) setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY) ?? '';
    const timer = window.setTimeout(() => {
      if (!saved) {
        setLoading(false);
        return;
      }
      setToken(saved);
      void refresh(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!token || !session) return;
    const timer = window.setInterval(() => void refresh(token, true), 3000);
    return () => window.clearInterval(timer);
  }, [refresh, session, token]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function enterRoom() {
    const name = displayName.trim();
    if (!name) {
      setError('先写下你的称呼');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await api<Session & { token: string }>(
        '/api/beta/session',
        '',
        {
          method: 'POST',
          body: JSON.stringify({
            action: mode,
            displayName: name,
            ...(mode === 'join' ? { inviteCode } : {}),
          }),
        },
      );
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setSession(result);
      setMessages([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '进入失败');
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }

  async function sendMessage(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !token || submitting) return;
    setSubmitting(true);
    setError('');
    const clientNonce = crypto.randomUUID().replaceAll('-', '');
    try {
      await api('/api/beta/messages', token, {
        method: 'POST',
        body: JSON.stringify({ text, clientNonce }),
      });
      setDraft('');
      await refresh(token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '发送失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(update: {
    manualBusy?: boolean;
    receptionEnabled?: boolean;
  }) {
    if (!token) return;
    try {
      const next = await api<Session>('/api/beta/session', token, {
        method: 'PATCH',
        body: JSON.stringify(update),
      });
      setSession(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    }
  }

  function leaveRoom() {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setSession(null);
    setMessages([]);
    setDisplayName('');
    setDraft('');
  }

  if (loading) {
    return (
      <main className="online-shell online-loading">
        <LoaderCircle className="spin" size={28} />
        <p>正在进入测试空间…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="online-shell online-entry-shell">
        <Link className="online-back" href="/">
          <ArrowLeft size={16} /> 返回演示
        </Link>
        <section className="online-entry-card">
          <span className="online-brandmark">
            <Heart size={24} />
          </span>
          <p className="eyebrow">SMALL BETA</p>
          <h1>两个人，进入同一个此间。</h1>
          <p className="online-intro">
            一人创建空间，把邀请码发给另一人，就可以在两台设备上聊天。
          </p>
          <div
            className="online-mode-tabs"
            role="tablist"
            aria-label="进入方式"
          >
            <button
              className={mode === 'create' ? 'active' : ''}
              onClick={() => setMode('create')}
            >
              <Users size={17} /> 创建空间
            </button>
            <button
              className={mode === 'join' ? 'active' : ''}
              onClick={() => setMode('join')}
            >
              <UserPlus size={17} /> 使用邀请码
            </button>
          </div>
          <label className="online-field">
            你的称呼
            <input
              value={displayName}
              maxLength={20}
              autoComplete="name"
              placeholder="例如：小夏"
              onChange={(event) => setDisplayName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void enterRoom()}
            />
          </label>
          {mode === 'join' && (
            <label className="online-field">
              6 位邀请码
              <input
                value={inviteCode}
                maxLength={6}
                autoCapitalize="characters"
                placeholder="例如：7H3KQ9"
                onChange={(event) =>
                  setInviteCode(event.target.value.toUpperCase())
                }
                onKeyDown={(event) => event.key === 'Enter' && void enterRoom()}
              />
            </label>
          )}
          {error && (
            <p className="online-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button online-submit"
            disabled={submitting}
            onClick={enterRoom}
          >
            {submitting ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Link2 size={17} />
            )}
            {mode === 'create' ? '创建测试空间' : '加入测试空间'}
          </button>
          <small className="online-footnote">
            测试身份只保存在当前浏览器。清除浏览器数据后需要重新创建空间。
          </small>
        </section>
      </main>
    );
  }

  const partnerOnline = session.partner
    ? relativeStatus(session.partner.lastSeenAt)
    : '等待加入';

  return (
    <main className="online-shell online-room-shell">
      <header className="online-room-header">
        <div className="online-room-title">
          <span className="online-brandmark">
            <Heart size={21} />
          </span>
          <div>
            <strong>此间</strong>
            <small>联机测试</small>
          </div>
        </div>
        <div className="online-header-actions">
          <Link href="/">查看完整演示</Link>
          <button onClick={leaveRoom} title="退出这台设备">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <section className="online-room">
        <div className="online-people">
          <div className="online-person mine">
            <span className="online-avatar">
              {initials(session.member.displayName)}
            </span>
            <div>
              <strong>
                {session.member.displayName} <small>你</small>
              </strong>
              <p>{session.member.manualBusy ? '忙碌' : '在线'}</p>
            </div>
          </div>
          <span className="online-connection">
            <span />
            <Heart size={15} />
            <span />
          </span>
          <div className="online-person partner">
            <span className="online-avatar">
              {session.partner ? initials(session.partner.displayName) : '？'}
            </span>
            <div>
              <strong>{session.partner?.displayName ?? '等待对方'}</strong>
              <p>{partnerOnline}</p>
            </div>
          </div>
        </div>

        {!session.partner && (
          <div className="online-invite-card">
            <div>
              <small>把邀请码发给对方</small>
              <strong>{session.space.inviteCode}</strong>
            </div>
            <button
              className="outline-button"
              onClick={async () => {
                await navigator.clipboard.writeText(session.space.inviteCode);
                setNotice('邀请码已复制');
              }}
            >
              <Copy size={16} /> 复制
            </button>
          </div>
        )}

        <section className="online-chat-card">
          <div className="online-chat-heading">
            <div>
              <MessageCircle size={19} />
              <span>
                <strong>留给彼此的话</strong>
                <small>
                  {session.partner
                    ? `${partnerOnline} · 消息自动同步`
                    : '等待另一人加入'}
                </small>
              </span>
            </div>
            <label className="online-switch">
              <span>
                <Bot size={16} /> 我的助手
              </span>
              <input
                type="checkbox"
                checked={session.member.receptionEnabled}
                onChange={(event) =>
                  void updateStatus({ receptionEnabled: event.target.checked })
                }
              />
            </label>
          </div>
          <div className="online-messages" role="log" aria-live="polite">
            {!messages.length && (
              <div className="online-empty">
                <Clock3 size={23} />
                <p>
                  {session.partner
                    ? '从第一句话开始吧。'
                    : '对方加入后，你们的消息会出现在这里。'}
                </p>
              </div>
            )}
            {messages.map((message) => {
              const mine = message.senderMemberId === session.member.id;
              return (
                <article
                  className={`online-message ${mine ? 'mine' : ''} ${message.authorType === 'assistant' ? 'assistant' : ''}`}
                  key={message.id}
                >
                  {!mine && (
                    <span className="online-avatar mini">
                      {message.authorType === 'assistant' ? (
                        <Bot size={14} />
                      ) : (
                        initials(message.senderName ?? '对方')
                      )}
                    </span>
                  )}
                  <div>
                    <small>
                      {message.authorType === 'assistant'
                        ? '此间助手'
                        : message.senderName}
                    </small>
                    <p>{message.text}</p>
                    {message.authorType === 'assistant' && (
                      <span className="online-message-note">
                        {message.replyMode === 'model'
                          ? 'AI 接待'
                          : message.replyMode === 'fallback'
                            ? '模型暂时不可用 · 基础接待'
                            : '基础接待'}
                        {message.pending ? ' · 已留给本人回应' : ''}
                      </span>
                    )}
                    <time>
                      {new Date(message.createdAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                </article>
              );
            })}
            <div ref={end} />
          </div>
          <form className="online-composer" onSubmit={sendMessage}>
            <textarea
              value={draft}
              maxLength={1000}
              rows={2}
              disabled={!session.partner}
              placeholder={
                session.partner
                  ? `发给${session.partner.displayName}…`
                  : '等待对方加入后开始聊天'
              }
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button
              className="send-button"
              disabled={!draft.trim() || !session.partner || submitting}
              aria-label="发送消息"
            >
              {submitting ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowUp size={17} />
              )}
            </button>
          </form>
        </section>

        <div className="online-status-actions">
          <button
            className={session.member.manualBusy ? 'active' : ''}
            onClick={() =>
              void updateStatus({ manualBusy: !session.member.manualBusy })
            }
          >
            {session.member.manualBusy ? (
              <Check size={15} />
            ) : (
              <Clock3 size={15} />
            )}
            {session.member.manualBusy ? '当前忙碌，点击接回' : '设为忙碌'}
          </button>
          <span>
            设为忙碌后，开启助手即可自动接待；当前未配置模型时使用基础回复。
          </span>
        </div>
        {error && (
          <p className="online-error online-room-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {notice && (
        <output className="toast-message">
          <Check size={16} />
          {notice}
        </output>
      )}
    </main>
  );
}
