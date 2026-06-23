import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { matchesApi } from '../../api/client';
import { subscribe } from '../../lib/ws';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../stores/sessionStore';
import { cn } from '../../lib/cn';
import toast from 'react-hot-toast';

interface MatchComment {
  id: number;
  text: string;
  minute: number | null;
  createdAt: string;
  author: {
    id: number;
    username: string;
    name: string;
    clubShortName: string | null;
  };
}

interface MatchChatPanelProps {
  matchId: number;
  homeClubId: number;
  awayClubId: number;
  currentMinute?: number | null; // Null if not live
}

export function MatchChatPanel({ matchId, homeClubId, awayClubId, currentMinute }: MatchChatPanelProps) {
  const { t } = useTranslation('common');
  const { user, club } = useSession();
  const [comments, setComments] = useState<MatchComment[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const isParticipant = club?.id === homeClubId || club?.id === awayClubId;

  const loadComments = useCallback(() => {
    matchesApi.getComments(matchId)
      .then(r => setComments(Array.isArray(r) ? r : []))
      .catch(() => setComments([]));
  }, [matchId]);

  useEffect(() => {
    loadComments();
    const sub = subscribe(`match:${matchId}`, (msg) => {
      if (msg.type === 'match:comment' && msg.payload) {
        setComments(prev => {
          const newMsg = msg.payload as MatchComment;
          if (prev.some(c => c.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    });
    return () => sub.close();
  }, [matchId, loadComments]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const sendMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending || !isParticipant) return;
    setSending(true);
    try {
      await matchesApi.postComment(matchId, draft, currentMinute);
      setDraft('');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo enviar el comentario');
    }
    setSending(false);
  };

  return (
    <div className="mc-chat">
      <style>{`
        .mc-chat { display: flex; flex-direction: column; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-retro); overflow: hidden; height: 100%; max-height: 400px; }
        .mc-chat-head { padding: 12px 14px; background: var(--bg-elevated); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.9rem; }
        .mc-chat-body { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
        .mc-chat-msg { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; }
        .mc-chat-msg.me { align-items: flex-end; }
        .mc-chat-msg-meta { display: flex; gap: 6px; align-items: center; font-size: 0.7rem; color: var(--text-muted); }
        .mc-chat-msg-min { font-family: var(--font-mono-retro); color: var(--gold-accent); }
        .mc-chat-msg-bubble { background: var(--bg-elevated); padding: 8px 12px; border-radius: 12px; border: 1px solid var(--border-color); max-width: 85%; line-height: 1.4; word-break: break-word; }
        .mc-chat-msg.me .mc-chat-msg-bubble { background: color-mix(in srgb, var(--green-primary) 10%, var(--bg-elevated)); border-color: color-mix(in srgb, var(--green-primary) 30%, transparent); color: var(--green-primary); }
        .mc-chat-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--border-color); background: var(--bg-elevated); }
        .mc-chat-input { flex: 1; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font-size: 0.85rem; outline: none; transition: border-color 0.2s; }
        .mc-chat-input:focus { border-color: var(--gold-accent); }
        .mc-chat-btn { background: var(--gold-accent); color: var(--bg-surface); border: none; border-radius: 6px; padding: 0 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s; }
        .mc-chat-btn:hover { opacity: 0.85; }
        .mc-chat-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .mc-chat-empty { text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0; margin: auto; }
      `}</style>
      
      <div className="mc-chat-head">
        <MessageSquare size={16} /> {t('Rueda de Prensa')}
      </div>
      
      <div className="mc-chat-body">
        {comments.length === 0 ? (
          <div className="mc-chat-empty">{t('No hay declaraciones todavía.')}</div>
        ) : (
          comments.map(c => {
            const isMe = c.author.id === user?.id;
            return (
              <div key={c.id} className={cn('mc-chat-msg', isMe && 'me')}>
                <div className="mc-chat-msg-meta">
                  {c.minute != null && <span className="mc-chat-msg-min">{c.minute}'</span>}
                  <span>{c.author.name} {c.author.clubShortName ? `(${c.author.clubShortName})` : ''}</span>
                </div>
                <div className="mc-chat-msg-bubble">{c.text}</div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {isParticipant ? (
        <form className="mc-chat-form" onSubmit={sendMsg}>
          <input 
            className="mc-chat-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Escribe tus declaraciones..."
            maxLength={500}
            disabled={sending}
          />
          <button className="mc-chat-btn" type="submit" disabled={!draft.trim() || sending}>
            <Send size={16} />
          </button>
        </form>
      ) : (
        <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
          {t('Solo los mánagers del partido pueden declarar.')}
        </div>
      )}
    </div>
  );
}
