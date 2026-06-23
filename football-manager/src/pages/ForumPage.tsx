// Foro — Taberna de Mánagers (Premium Glassmorphism)
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Plus, ChevronLeft, Send, Loader2, AlertTriangle, RefreshCw, Pin, Coffee, Users, ScrollText, Sparkles, Swords } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/cn';
import { asArray } from '../lib/normalize';
import { forumApi, clubApi } from '../api/client';
import { Skeleton, EmptyState, Button, Badge, ClubBadge } from '../components/ui';
import { ManagerLink } from '../components/common/EntityLink';
import type { RivalWeekData } from '../components/competition/RivalWeekPanel';
import { fmtTime } from '../lib/format';

function isDerbyWeek(next?: RivalWeekData['nextMeeting']): boolean {
  if (!next?.playedAt) return false;
  const ms = +new Date(next.playedAt) - Date.now();
  return ms > 0 && ms <= 7 * 24 * 3600 * 1000;
}

const CATEGORIES = [
  { id: 'general', labelKey: 'forum.categories.general', icon: Coffee },
  { id: 'dudas', labelKey: 'forum.categories.help', icon: MessageSquare },
  { id: 'tactica', labelKey: 'forum.categories.tactics', icon: ScrollText },
  { id: 'sugerencias', labelKey: 'forum.categories.suggestions', icon: Sparkles },
  { id: 'bugs', labelKey: 'forum.categories.bugs', icon: AlertTriangle },
] as const;

function resolveCategory(categoryId?: string): string {
  if (categoryId && CATEGORIES.some((c) => c.id === categoryId)) return categoryId;
  return 'general';
}

function threadReplies(thread: any): number {
  const count = thread?.postCount ?? thread?.posts?.length ?? 0;
  return count > 0 ? count - 1 : 0;
}

function authorLabel(post: any): string {
  return post?.author?.name ?? post?.author?.username ?? `Manager #${post?.authorId ?? '?'}`;
}

export function ForumPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { categoryId, topicId } = useParams<{ categoryId?: string; topicId?: string }>();
  const category = resolveCategory(categoryId);
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rivalWeek, setRivalWeek] = useState<RivalWeekData | null>(null);

  useEffect(() => {
    clubApi.rivalWeek().then(r => setRivalWeek(r as RivalWeekData)).catch(() => setRivalWeek(null));
  }, []);

  const reloadThreads = useCallback(() => {
    setLoading(true); setError(null);
    forumApi.listThreads(category)
      .then(list => setThreads(asArray(list)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('forum.loadError')))
      .finally(() => setLoading(false));
  }, [category, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    if (!topicId) setSelectedThread(null);
    forumApi.listThreads(category)
      .then(list => { if (!cancelled) setThreads(asArray(list)); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('forum.loadError'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [category, topicId, t]);

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    setThreadLoading(true);
    forumApi.getThread(Number(topicId))
      .then((detail) => { if (!cancelled) setSelectedThread(detail); })
      .catch((e: unknown) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : t('forum.openError'));
      })
      .finally(() => { if (!cancelled) setThreadLoading(false); });
    return () => { cancelled = true; };
  }, [topicId, t]);

  const openThread = async (thread: any) => {
    const threadCategory = thread.category ?? category;
    navigate(`/forum/${threadCategory}/topic/${thread.id}`);
  };

  const closeThread = () => {
    navigate(`/forum/${category}`);
  };

  const selectCategory = (id: string) => {
    navigate(`/forum/${id}`);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newText.trim()) return;
    setSubmitting(true);
    try {
      const created = await forumApi.createThread(category, newTitle.trim(), newText.trim());
      toast.success(t('Hilo creado'));
      setNewTitle(''); setNewText(''); setShowCreate(false);
      await reloadThreads();
      openThread(created);
    } catch (e: any) {
      toast.error(e.message ?? t('No se pudo crear el hilo'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedThread) return;
    setSubmitting(true);
    try {
      await forumApi.reply(selectedThread.id, replyText.trim());
      setReplyText('');
      const detail = await forumApi.getThread(selectedThread.id);
      setSelectedThread(detail);
    } catch (e: any) {
      toast.error(e.message ?? t('No se pudo publicar la respuesta'));
    } finally {
      setSubmitting(false);
    }
  };

  const categoryData = CATEGORIES.find(c => c.id === category);
  const derbyWeek = isDerbyWeek(rivalWeek?.nextMeeting) && !!rivalWeek?.rival;

  return (
    <div className="flex flex-col gap-6 relative">
      {/* Background Decor */}
      <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-[var(--green-primary)] rounded-full mix-blend-overlay filter blur-[150px] opacity-[0.05] pointer-events-none" />
      <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] bg-[var(--gold-accent)] rounded-full mix-blend-overlay filter blur-[150px] opacity-[0.05] pointer-events-none" />

      {/* Hero Section */}
      <div className="bg-black/40 backdrop-blur-2xl border border-white/5 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent z-0 pointer-events-none" />
        <div className="relative z-10 flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--gold-accent)] to-[var(--gold-accent)] flex items-center justify-center text-black shadow-[0_0_30px_rgba(255,215,0,0.3)]">
            <Coffee size={32} />
          </div>
          <div>
            <h1 className="font-display font-black text-4xl uppercase tracking-widest text-white drop-shadow-md">
              {t('La')} <span className="text-[var(--gold-accent)]">{t('Taberna')}</span>
            </h1>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/50 mt-1 flex items-center gap-2">
              <Users size={14} className="text-[var(--gold-accent)]" /> {t('Club Privado de Mánagers FDF')}
            </p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-3 w-full md:w-auto">
          <Button variant="secondary" size="lg" className="backdrop-blur-md bg-white/5 border-white/10 hover:bg-white/10" onClick={reloadThreads} disabled={loading} aria-label={t('Recargar')}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </Button>
          {!selectedThread && (
            <Button variant="primary" size="lg" className="w-full md:w-auto shadow-[0_0_20px_rgba(0,255,100,0.2)]" onClick={() => setShowCreate(!showCreate)}>
              <Plus size={18} className="mr-2" /> {t('Nuevo Hilo')}
            </Button>
          )}
        </div>
      </div>

      {derbyWeek && !selectedThread && (
        <div
          className="flex items-center gap-4 rounded-2xl px-6 py-4 border border-[rgba(239,68,68,0.35)]"
          style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.5), color-mix(in srgb, var(--red-danger) 12%, rgba(0,0,0,0.6)))' }}
        >
          <Swords size={22} style={{ color: 'var(--red-danger)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-[var(--red-danger)]">{t('Taberna pre-derbi')}</p>
            <p className="text-sm text-white/80 mt-0.5 truncate">
              {t('La taberna arde antes del duelo contra')} <strong className="text-white">{rivalWeek?.rival?.name}</strong>
              {rivalWeek?.nextMeeting?.playedAt ? ` · ${fmtTime(rivalWeek.nextMeeting.playedAt)}` : ''}
            </p>
          </div>
          <ClubBadge id={rivalWeek?.rival?.id} name={rivalWeek?.rival?.name} badge={rivalWeek?.rival?.badge} size={44} />
        </div>
      )}

      {/* Navegación Categorías */}
      {!selectedThread && (
        <div className="flex flex-wrap gap-2 mb-2">
          {CATEGORIES.map(c => {
            const Icon = c.icon;
            const isActive = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => selectCategory(c.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 rounded-2xl font-display font-black text-xs uppercase tracking-widest transition-all duration-300",
                  isActive 
                    ? "bg-[rgba(255,215,0,0.15)] text-[var(--gold-accent)] border border-[var(--gold-accent)] shadow-[0_0_15px_rgba(255,215,0,0.2)]" 
                    : "bg-black/40 text-white/50 border border-white/5 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon size={14} /> {t(c.labelKey)}
              </button>
            )
          })}
        </div>
      )}

      {/* Composer de nuevo hilo */}
      {showCreate && !selectedThread && (
        <div className="bg-black/60 backdrop-blur-2xl border border-[var(--gold-accent)] rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-5 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <Pin size={18} className="text-[var(--gold-accent)]" />
            <span className="font-display font-black text-sm uppercase tracking-[0.2em] text-white">
              {t('forum.newThreadIn')} {t(categoryData?.labelKey ?? 'forum.categories.general')}
            </span>
          </div>
          <input
            className="w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 font-display font-bold text-lg text-white focus:outline-none focus:border-[var(--gold-accent)] focus:ring-2 focus:ring-[rgba(255,215,0,0.2)] transition-all shadow-inner"
            value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder={t('Título del debate...')}
          />
          <textarea
            className="w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 font-sans text-sm text-white focus:outline-none focus:border-[var(--gold-accent)] focus:ring-2 focus:ring-[rgba(255,215,0,0.2)] transition-all shadow-inner min-h-[150px] resize-y"
            value={newText} onChange={e => setNewText(e.target.value)}
            placeholder={t('Desarrolla tu idea aquí...')}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="lg" className="bg-white/5 border-white/10 hover:bg-white/10" onClick={() => { setShowCreate(false); setNewTitle(''); setNewText(''); }}>
              {t('Cancelar')}
            </Button>
            <Button variant="primary" size="lg" className="shadow-[0_0_20px_rgba(0,255,100,0.2)]" onClick={handleCreate} disabled={submitting || !newTitle.trim() || !newText.trim()}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="mr-2" />}
              {t('Publicar Tema')}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] backdrop-blur-md">
          <AlertTriangle size={20} className="text-[var(--red-danger)]" />
          <p className="text-sm font-bold text-[var(--red-danger)]">{error}</p>
        </div>
      )}

      {selectedThread ? (
        /* ─── Detalle del hilo ─────────────────────────────────────────── */
        <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-500">
          <button
            onClick={closeThread}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/50 hover:text-[var(--gold-accent)] transition-colors w-fit bg-black/40 px-4 py-2 rounded-xl border border-white/10"
          >
            <ChevronLeft size={16} /> {t('forum.backTo')} {t(categoryData?.labelKey ?? 'forum.categories.general')}
          </button>

          <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="px-8 py-6 border-b border-white/10 bg-gradient-to-r from-black/80 to-transparent">
              <Badge variant="warning" className="mb-3 bg-[rgba(255,215,0,0.1)] text-[var(--gold-accent)] border-[var(--gold-accent)]">
                {t(categoryData?.labelKey ?? 'forum.categories.general')}
              </Badge>
              <h2 className="font-display font-black text-2xl md:text-3xl text-white drop-shadow-md leading-tight">
                {selectedThread.title}
              </h2>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mt-3 flex items-center gap-2">
                <Pin size={12} /> {t('Hilo')} #{selectedThread.id} · {(selectedThread.posts ?? []).length} {t('mensajes')}
              </p>
            </div>

            <div className="flex flex-col">
              {(selectedThread.posts ?? []).map((post: any, idx: number) => (
                <div key={post.id} className={cn(
                  "p-6 md:p-8 border-b border-white/5 transition-colors",
                  idx === 0 ? "bg-[rgba(255,215,0,0.02)] border-l-4 border-l-[var(--gold-accent)]" : "hover:bg-white/[0.02]"
                )}>
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-center text-lg font-black text-[var(--gold-accent)] shadow-inner overflow-hidden shrink-0">
                      {post?.author?.avatarSeed ? (
                        <img src={`https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(post.author.avatarSeed)}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        authorLabel(post).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display font-black text-lg text-white">
                          <ManagerLink id={post?.authorId ?? post?.author?.id} name={authorLabel(post)} />
                        </p>
                        {idx === 0 && <Badge variant="warning" className="text-[8px] px-1.5 py-0.5 bg-[var(--gold-accent)] text-black border-none">{t('AUTOR')}</Badge>}
                      </div>
                      <p className="text-xs font-bold text-white/40 uppercase tracking-wider mt-0.5">
                        @{post?.author?.username ?? '—'}{post?.author?.clubShortName ? ` · ${post.author.clubShortName}` : ''}
                      </p>
                    </div>
                    <div className="ml-auto text-[10px] font-black text-white/20 uppercase tracking-widest">
                      #{post.id}
                    </div>
                  </div>
                  <div className="text-sm md:text-base text-white/80 leading-relaxed font-sans whitespace-pre-wrap pl-16">
                    {post.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Composer de respuesta */}
            <div className="p-6 md:p-8 bg-black/60 border-t border-white/10 flex flex-col md:flex-row gap-4">
              <textarea
                className="flex-1 bg-black/50 border border-white/10 rounded-xl px-5 py-4 font-sans text-sm text-white focus:outline-none focus:border-[var(--green-primary)] focus:ring-2 focus:ring-[rgba(0,255,100,0.2)] transition-all shadow-inner min-h-[60px] resize-y"
                value={replyText} onChange={e => setReplyText(e.target.value)} rows={2}
                placeholder={t('Participa en el debate...')}
              />
              <Button
                variant="primary"
                size="lg"
                className="md:self-end h-[60px] px-8 shadow-[0_0_20px_rgba(0,255,100,0.2)]"
                onClick={handleReply}
                disabled={submitting || !replyText.trim()}
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="mr-2" />}
                {t('Responder')}
              </Button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton height={100} className="rounded-3xl border border-white/5" />
          <Skeleton height={100} className="rounded-3xl border border-white/5" />
          <Skeleton height={100} className="rounded-3xl border border-white/5" />
        </div>
      ) : threads.length === 0 ? (
        <div className="py-20">
          <EmptyState
            icon={<Coffee size={64} className="text-[var(--gold-accent)] opacity-50" />}
            title={t('La taberna está vacía')}
            hint={t('Nadie ha sacado un tema de conversación en esta zona.')}
            action={
              <Button variant="primary" size="lg" className="mt-4 shadow-[0_0_20px_rgba(0,255,100,0.2)]" onClick={() => setShowCreate(true)}>
                <Plus size={18} className="mr-2" /> {t('Romper el hielo')}
              </Button>
            }
          />
        </div>
      ) : (
        /* ─── Tablón de hilos ──────────────────────────────────────────── */
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">{t('Debates Activos')}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">{threads.length} {t('hilos')}</span>
          </div>
          {threads.map((thread: any) => (
            <button 
              key={thread.id} 
              className="group flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-black/40 backdrop-blur-xl border border-white/5 hover:border-[var(--gold-accent)] hover:shadow-[0_10px_30px_rgba(255,215,0,0.1)] transition-all duration-300 text-left"
              onClick={() => openThread(thread)}
            >
              <div className="flex items-start md:items-center gap-5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--gold-accent)] shrink-0 group-hover:scale-110 group-hover:bg-[rgba(255,215,0,0.1)] transition-all duration-300">
                  <MessageSquare size={20} />
                </div>
                <div className="min-w-0">
                  <p className="font-display font-black text-lg text-white truncate group-hover:text-[var(--gold-accent)] transition-colors">
                    {thread.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge variant="default" className="text-[9px] py-0.5 bg-white/10 border-none text-white/70">
                      #{thread.id}
                    </Badge>
                    <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                      {t(CATEGORIES.find(c => c.id === thread.category)?.labelKey ?? thread.category)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 md:ml-auto bg-black/50 px-4 py-2 rounded-xl border border-white/5">
                <span className="font-display font-black text-xl text-white">{threadReplies(thread)}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{t('respuestas')}</span>
              </div>
            </button>
          ))}
          {threadLoading && (
            <div className="flex justify-center p-6">
              <Loader2 size={24} className="animate-spin text-[var(--gold-accent)]" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
