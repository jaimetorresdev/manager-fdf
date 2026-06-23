// ─── E11 · Mensajes y Chat unificados ─────────────────────────────────────────
// Dos pestañas: Mensajes Directos (REST dmApi) y Salas de Chat (REST polling chatApi).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send, MessagesSquare, Hash, Globe, Loader2, AlertTriangle, Beer, Megaphone, Flag, Swords, HelpCircle, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { dmApi, chatApi } from '../api/client';
import { subscribe } from '../lib/ws';
import { useSession } from '../stores/sessionStore';
import { Skeleton, EmptyState, Tabs } from '../components/ui';
import { cn } from '../lib/cn';
import { dedupeBy, asArray } from '../lib/normalize';
import { fmtTime } from '../lib/format';
import { ManagerLink } from '../components/common/EntityLink';
import { TavernEventsStrip } from '../components/social/TavernEventsStrip';

// --- DM Interfaces ---
interface Convo { managerId: number; username?: string; clubName?: string; lastMessage?: { body?: string; createdAt?: string; fromMe?: boolean }; unread?: number }
interface Msg { id: number; body?: string; createdAt?: string; fromMe?: boolean }

// --- Chat Interfaces ---
interface ChatMessage {
  id: number; text: string; timestamp: string;
  author: { id: number; username: string; name: string; clubShortName: string | null; avatarSeed?: string };
  isMe?: boolean;
}
interface Channel { id: number; name: string; type: string; messageCount: number; }

const CHANNEL_ICONS: Record<string, typeof Globe> = { general: Beer, market: Store, rumors: Megaphone, league: Flag, derbies: Swords, help: HelpCircle };
const POLL_INTERVAL_MS = 8000;

function dedupeChannels(chs: any): Channel[] {
  return dedupeBy<Channel>(chs, (c) => String(c?.type ?? c?.id ?? c?.name));
}

function normalizeMessages(res: unknown, myUserId: number | null): ChatMessage[] {
  const raw = res && typeof res === 'object' && 'messages' in res
    ? (res as { messages?: unknown }).messages
    : res;
  return asArray<Record<string, unknown>>(raw).map((m, idx) => {
    const authorRaw = m.author as Record<string, unknown> | undefined;
    const author = {
      id: Number(authorRaw?.id ?? m.authorId ?? m.userId ?? 0),
      username: String(authorRaw?.username ?? m.username ?? 'Anónimo'),
      name: String(authorRaw?.name ?? m.name ?? m.username ?? 'Anónimo'),
      clubShortName: (authorRaw?.clubShortName ?? m.clubShortName ?? null) as string | null,
      avatarSeed: (authorRaw?.avatarSeed ?? m.avatarSeed) as string | undefined,
    };
    const text = String(m.text ?? m.message ?? '');
    const id = typeof m.id === 'number' ? m.id : idx + 1_000_000_000;
    return {
      id,
      text,
      timestamp: String(m.timestamp ?? m.createdAt ?? new Date().toISOString()),
      author,
      isMe: myUserId != null && author.id === myUserId,
    };
  });
}

export function MessagesPage() {
  const { t } = useTranslation('common');
  const [params, setParams] = useSearchParams();
  const toParam = Number(params.get('to'));
  const tabParam = params.get('tab');
  const [activeTab, setActiveTab] = useState<'dms' | 'chat'>(
    tabParam === 'chat' ? 'chat' : (Number.isFinite(toParam) && toParam > 0 ? 'dms' : 'dms')
  );

  // Sync tab state to URL (optional but good for reload)
  useEffect(() => {
    if (activeTab === 'chat') {
      setParams(p => { p.set('tab', 'chat'); p.delete('to'); return p; }, { replace: true });
    } else {
      setParams(p => { p.delete('tab'); return p; }, { replace: true });
    }
  }, [activeTab, setParams]);

  // --- DM State ---
  const [convos, setConvos] = useState<Convo[] | null>(null);
  const [active, setActive] = useState<number | null>(Number.isFinite(toParam) && toParam > 0 ? toParam : null);
  const [thread, setThread] = useState<Msg[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { user } = useSession();
  const myUserId = user?.id ?? null;

  const loadConvos = useCallback(() => {
    dmApi.conversations()
      .then(r => setConvos(asArray<Convo>(r)))
      .catch(() => setConvos([]));
  }, []);

  useEffect(() => {
    loadConvos();
    let sub: { close: () => void } | undefined;
    if (user?.id) {
      sub = subscribe(`user:${user.id}`, (msg) => {
        if (msg.type === 'dm:new') {
          loadConvos();
          if (active) {
            dmApi.thread(active).then(r => setThread(asArray<Msg>(r)));
          }
        }
      });
    }

    // Fallback de polling (P2 auditoría: WS no documentado/cae en silencio)
    const interval = setInterval(() => {
      loadConvos();
      if (active) {
        dmApi.thread(active).then(r => setThread(asArray<Msg>(r)));
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (sub) sub.close();
      clearInterval(interval);
    };
  }, [loadConvos, user?.id, active]);

  useEffect(() => {
    if (!active) { setThread(null); return; }
    let alive = true;
    setThread(null);
    dmApi.thread(active)
      .then(r => {
        if (alive) setThread(asArray<Msg>(r));
        setConvos(cs => (cs ?? []).map(c => c.managerId === active ? { ...c, unread: 0 } : c));
        window.dispatchEvent(new CustomEvent('fdf:dm-read'));
      })
      .catch(() => { if (alive) setThread([]); });
    return () => { alive = false; };
  }, [active]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);

  const pick = (id: number) => {
    setActiveTab('dms');
    setActive(id);
    setParams(p => { p.set('to', String(id)); p.delete('tab'); return p; }, { replace: true });
    setConvos(cs => (cs ?? []).map(c => c.managerId === id ? { ...c, unread: 0 } : c));
    window.dispatchEvent(new CustomEvent('fdf:dm-read'));
  };

  const sendDM = async () => {
    const body = draft.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      await dmApi.send(active, body);
      setDraft('');
      setThread(t => [...(t ?? []), { id: Date.now(), body, createdAt: new Date().toISOString(), fromMe: true }]);
      loadConvos();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo enviar'); }
    setSending(false);
  };

  // --- Chat State ---
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string>('general');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(true);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeTab !== 'chat') return;
    chatApi.getChannels()
      .then(ch => setChannels(dedupeChannels(ch)))
      .catch(() => {
        setChannels([
          { id: 1, name: 'General', type: 'general', messageCount: 0 },
          { id: 2, name: 'Mercado', type: 'market', messageCount: 0 },
          { id: 3, name: 'Rumores', type: 'rumors', messageCount: 0 },
          { id: 4, name: 'Liga', type: 'league', messageCount: 0 },
          { id: 5, name: 'Derbis', type: 'derbies', messageCount: 0 },
          { id: 6, name: 'Ayuda', type: 'help', messageCount: 0 },
        ]);
      });
  }, [activeTab]);

  const fetchChatMessages = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await chatApi.getMessages(activeChannel, 50, undefined, signal);
      setChatMessages(normalizeMessages(res, myUserId));
      setChatError(null);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setChatError(e.message ?? 'No se pudo cargar el chat');
    } finally {
      if (!signal?.aborted) setChatLoading(false);
    }
  }, [activeChannel, myUserId]);

  useEffect(() => {
    if (activeTab !== 'chat') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const ac = new AbortController();
    setChatLoading(true);
    setChatMessages([]);
    fetchChatMessages(ac.signal);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchChatMessages(), POLL_INTERVAL_MS);
    return () => { 
      ac.abort();
      if (pollRef.current) clearInterval(pollRef.current); 
    };
  }, [activeTab, activeChannel, fetchChatMessages]);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatSending(true);
    try {
      const res = await chatApi.postMessage(activeChannel, text);
      const norm = normalizeMessages(res, myUserId);
      if (norm.length) setChatMessages(norm); else await fetchChatMessages();
      setChatInput('');
    } catch (e: any) {
      setChatError(e.message ?? 'Error al enviar');
    } finally {
      setChatSending(false);
    }
  };

  const currentCh = channels.find(c => c.type === activeChannel);
  const AUTHOR_TONES = ['var(--green-primary)', 'var(--blue-info)', 'var(--gold-accent)', 'var(--violet-accent)', 'var(--teal-accent)'];
  const authorTone = (name: string) => AUTHOR_TONES[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AUTHOR_TONES.length];

  const totalUnread = (convos ?? []).reduce((acc, c) => acc + (c.unread ?? 0), 0);

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14, height: 'calc(100vh - 120px)' }}>
      <style>{`
        .dm-grid{display:grid;grid-template-columns:300px 1fr;gap:20px;flex:1;min-height:0;
          background: rgba(0,0,0,0.3);
          border-radius: 24px;
          padding: 16px;
          border: 1px solid rgba(255,255,255,0.05);
          box-shadow: inset 0 0 40px rgba(0,0,0,0.6), 0 20px 40px rgba(0,0,0,0.4);
          backdrop-filter: blur(20px);
        }
        .dm-list{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.05);border-radius:16px;overflow:auto;display:flex;flex-direction:column;gap:4px;padding:8px;}
        .dm-item{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;padding:12px 16px;cursor:pointer;
          background:transparent;border:1px solid transparent;border-radius:12px;color:var(--text-primary);transition:all 0.2s ease;}
        .dm-item:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);}
        .dm-item.active{background:linear-gradient(135deg, rgba(250,204,21,0.15), rgba(250,204,21,0.05));border-color:rgba(250,204,21,0.3);box-shadow:0 4px 15px rgba(0,0,0,0.2);}
        .dm-who{display:flex;align-items:center;gap:8px;font-weight:800;font-size:0.9rem;font-family:var(--font-sans);}
        .dm-club{color:var(--gold-accent);font-size:0.7rem;font-family:var(--font-mono-retro);text-transform:uppercase;letter-spacing:1px;opacity:0.8;}
        .dm-last{color:var(--text-muted);font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;}
        .dm-badge{margin-left:auto;background:var(--green-primary);color: var(--bg-primary);font-family:var(--font-mono-retro);font-size:0.7rem;font-weight:900;
          border-radius:12px;padding:2px 8px;box-shadow:0 0 10px var(--green-primary);}
        .dm-pane{display:flex;flex-direction:column;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.05);border-radius:16px;min-height:0;box-shadow:0 10px 30px rgba(0,0,0,0.5);overflow:hidden;}
        .dm-head{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.05);font-family:var(--font-display);font-weight:800;background:rgba(0,0,0,0.4);display:flex;align-items:center;gap:12px;font-size:1.1rem;text-transform:uppercase;letter-spacing:1px;}
        .dm-msgs{flex:1;overflow:auto;display:flex;flex-direction:column;gap:16px;padding:24px;}
        .dm-bub{max-width:80%;padding:12px 18px;border-radius:16px;font-size:0.95rem;line-height:1.5;box-shadow:0 4px 15px rgba(0,0,0,0.2);font-weight:500;}
        .dm-bub.me{align-self:flex-end;background:linear-gradient(135deg, var(--green-primary), #10b981);color: var(--bg-primary);border-bottom-right-radius:4px;box-shadow:0 4px 20px rgba(16,185,129,0.2);}
        .dm-bub.them{align-self:flex-start;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:var(--text-primary);border-bottom-left-radius:4px;}
        .dm-time{display:block;margin-top:6px;font-family:var(--font-mono-retro);font-size:0.65rem;color:rgba(255,255,255,0.5);text-align:right;}
        .dm-bub.me .dm-time{color:rgba(0,0,0,0.6);}
        .dm-compose{display:flex;gap:12px;padding:16px;border-top:1px solid rgba(255,255,255,0.05);background:rgba(0,0,0,0.3);}
        .dm-compose textarea, .dm-compose input{flex:1;resize:none;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:12px;
          padding:14px 16px;color:var(--text-primary);font-size:0.95rem;font-family:var(--font-sans);min-height:52px;transition:all 0.2s ease;}
        .dm-compose textarea:focus, .dm-compose input:focus{border-color:var(--green-primary);outline:none;background:rgba(0,0,0,0.6);box-shadow:0 0 0 2px rgba(16,185,129,0.2);}
        .dm-send{display:grid;place-items:center;width:52px;height:52px;border-radius:12px;cursor:pointer;border:none;
          background:var(--gold-accent);color: var(--bg-primary);box-shadow:0 4px 15px rgba(250,204,21,0.3);transition:all 0.2s ease;}
        .dm-send:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 20px rgba(250,204,21,0.4);}
        .dm-send:active:not(:disabled){transform:translateY(0);}
        .dm-send:disabled{opacity:0.5;cursor:default;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);box-shadow:none;}
        
        .ch-chan{font-family:var(--font-sans);font-weight:700;text-transform:uppercase;letter-spacing:1px;}
        .ch-msg{animation:chIn .3s cubic-bezier(0.16, 1, 0.3, 1) both}
        @keyframes chIn{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:none scale(1)}}
        .ch-meta{font-family:var(--font-mono-retro);font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;}
        .ch-bubble{border:1px solid rgba(255,255,255,0.05);box-shadow:0 4px 15px rgba(0,0,0,0.2);backdrop-filter:blur(10px);}
        @media(max-width:760px){.dm-grid{grid-template-columns:1fr;background:none;padding:0;border:none;box-shadow:none;backdrop-filter:none}.dm-list{max-height:30vh}}
      `}</style>

      <div>
        <p className="muted-label">{t('Social')}</p>
        <div className="flex items-center justify-between">
          <h1 className="section-title text-3xl">{t('Bar de Mánagers')}</h1>
          <Tabs
            tabs={[
              { id: 'chat', label: t('Salas de Chat') },
              { id: 'dms', label: t('Despachos (MD)'), count: totalUnread > 0 ? totalUnread : undefined },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as 'dms' | 'chat')}
          />
        </div>
      </div>

      {activeTab === 'dms' && (
        <div className="dm-grid">
          <div className="dm-list">
            {convos === null && <div style={{ padding: 12 }}><Skeleton height={160} /></div>}
            {convos !== null && convos.length === 0 && (
              <div style={{ padding: 14 }}><EmptyState icon={<MessagesSquare size={20} />} title="Sin conversaciones" hint="Busca un mánager en el buscador global (/) para escribirle." /></div>
            )}
            {(convos ?? []).map(c => (
              <button key={c.managerId} className={cn('dm-item', active === c.managerId && 'active')} onClick={() => pick(c.managerId)}>
                <span className="dm-who">👔 <ManagerLink id={c.managerId} name={c.username ?? `Mánager ${c.managerId}`} />{(c.unread ?? 0) > 0 && <span className="dm-badge">{c.unread}</span>}</span>
                {c.clubName && <span className="dm-club">{c.clubName}</span>}
                {c.lastMessage?.body && <span className="dm-last">{c.lastMessage.fromMe ? 'Tú: ' : ''}{c.lastMessage.body}</span>}
              </button>
            ))}
          </div>

          <div className="dm-pane">
            {!active && <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}><EmptyState icon={<MessagesSquare size={22} />} title="Elige una conversación" hint="O busca un mánager con / para empezar una nueva." /></div>}
            {active && (
              <>
                <div className="dm-head">👔 <ManagerLink id={active} name={convos?.find(c => c.managerId === active)?.username ?? `Mánager ${active}`} /></div>
                <div className="dm-msgs">
                  {thread === null && <Skeleton height={120} />}
                  {thread !== null && thread.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', textAlign: 'center' }}>{t('Aún no hay mensajes — rompe el hielo.')}</p>}
                  {(thread ?? []).map(m => (
                    <div key={m.id} className={cn('dm-bub', m.fromMe ? 'me' : 'them')}>
                      {m.body}
                      <span className="dm-time">{fmtTime(m.createdAt)}</span>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                <div className="dm-compose">
                  <textarea
                    value={draft} placeholder={t('Escribe un mensaje… (Enter envía, Shift+Enter salto)')}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDM(); } }}
                    style={{ maxHeight: 120 }}
                  />
                  <button className="dm-send" onClick={sendDM} disabled={!draft.trim() || sending} aria-label="Enviar"><Send size={16} /></button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <>
        <TavernEventsStrip />
        <div className="dm-grid" style={{ background: 'var(--panel-gradient)' }}>
          <div className="dm-list" style={{ borderRight: '1px solid var(--border-color)', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
            <div className="dm-head ch-chan text-sm" style={{ color: 'var(--green-primary)' }}>{t('Salas públicas')}</div>
            <div className="p-2 space-y-1">
              {channels.map(ch => {
                const Icon = CHANNEL_ICONS[ch.type] ?? Hash;
                const on = activeChannel === ch.type;
                return (
                  <button
                    key={ch.type}
                    onClick={() => setActiveChannel(ch.type)}
                    className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors text-left ch-chan')}
                    style={on
                      ? { background: 'color-mix(in srgb,var(--gold-accent) 25%,transparent)', color: 'var(--gold-accent)', border: '1px solid var(--gold-accent)' }
                      : { color: 'var(--text-muted)', border: '1px solid transparent' }}
                  >
                    <Icon size={14} className="flex-shrink-0" />
                    <span className="truncate">#{ch.name.toLowerCase()}</span>
                    {ch.messageCount > 0 && !on && (
                      <span className="ml-auto text-[10px] rounded-full px-1.5" style={{ background: 'var(--bg-elevated)' }}>{ch.messageCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dm-pane" style={{ borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
            <div className="dm-head flex items-center gap-3">
              {(() => { const Icon = CHANNEL_ICONS[activeChannel] ?? Hash; return <Icon size={18} style={{ color: 'var(--gold-accent)' }} />; })()}
              <div className="flex-1 min-w-0">
                <p className="ch-chan font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>#{(currentCh?.name ?? activeChannel).toLowerCase()}</p>
              </div>
              <span className="ch-meta font-normal">{t('⟳')} {POLL_INTERVAL_MS / 1000}{t('s ·')} {chatMessages.length} {t('msg')}</span>
              {chatLoading && <Loader2 size={14} className="animate-spin text-[var(--text-muted)] flex-shrink-0" />}
            </div>

            {chatError && (
              <div className="px-4 py-2 bg-[color-mix(in_srgb,var(--red-danger)_10%,transparent)] border-b border-[color-mix(in_srgb,var(--red-danger)_30%,transparent)] flex items-center gap-2 text-xs text-[var(--red-danger)]">
                <AlertTriangle size={12} />
                {chatError}
              </div>
            )}

            <div className="dm-msgs">
              {chatLoading && chatMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-[var(--green-primary)]" /></div>
              ) : chatMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full"><p className="text-sm text-[var(--text-muted)]">{t('Sin mensajes todavía.')}</p></div>
              ) : (
                chatMessages.map(msg => {
                  const authorName = msg.author.name || msg.author.username || '?';
                  const tone = msg.isMe ? 'var(--green-primary)' : authorTone(authorName);
                  return (
                    <div key={msg.id} className={cn('ch-msg flex gap-3', msg.isMe && 'flex-row-reverse')}>
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-black flex-shrink-0 overflow-hidden"
                        style={{ background: `color-mix(in srgb, ${tone} 22%, var(--bg-elevated))`, color: tone, border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)` }}
                      >
                        {msg.author.avatarSeed ? (
                          <img src={`https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(msg.author.avatarSeed)}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          authorName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className={cn('max-w-sm min-w-0', msg.isMe && 'items-end')}>
                        <div className={cn('flex items-baseline gap-2 mb-1', msg.isMe && 'flex-row-reverse')}>
                          <span className="text-xs font-bold" style={{ color: tone, fontFamily: 'var(--font-mono-retro)' }}><ManagerLink id={msg.author.id} name={authorName} /></span>
                          {msg.author.clubShortName && <span className="ch-meta">[{msg.author.clubShortName}]</span>}
                          <span className="ch-meta">{new Date(msg.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div
                          className={cn('ch-bubble px-4 py-2.5 text-sm leading-relaxed break-words')}
                          style={msg.isMe
                            ? { background: 'color-mix(in srgb,var(--gold-accent) 15%,var(--bg-elevated))', color: 'var(--text-primary)', borderRadius: '10px 2px 10px 10px' }
                            : { background: 'color-mix(in srgb,var(--bg-elevated) 80%,transparent)', color: 'var(--text-primary)', borderRadius: '2px 10px 10px 10px' }}
                        >
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            <div className="dm-compose">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                placeholder={`Escribe en #${currentCh?.name.toLowerCase() ?? activeChannel}...`}
                disabled={chatSending}
              />
              <button className="dm-send" onClick={sendChatMessage} disabled={!chatInput.trim() || chatSending} aria-label="Enviar">
                {chatSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
