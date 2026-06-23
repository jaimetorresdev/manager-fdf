import { useCallback, useEffect, useRef, useState } from 'react';
import { Radio, Play, Square } from 'lucide-react';
import { Button } from '../ui';

interface ClubRadioPanelProps {
  headline?: string | null;
  checklistItems?: { title: string; detail?: string; urgent?: boolean }[];
}

function buildScript(headline?: string | null, items?: ClubRadioPanelProps['checklistItems']): string {
  const parts: string[] = [];
  parts.push('Radio del club. Resumen del día.');
  if (headline) parts.push(headline);
  if (items && items.length > 0) {
    parts.push('En la agenda del mánager:');
    for (const it of items.slice(0, 4)) {
      parts.push(`${it.title}.${it.detail ? ` ${it.detail}` : ''}`);
    }
  } else {
    parts.push('No hay tareas urgentes. El vestuario respira tranquilo.');
  }
  parts.push('Fin del boletín. Vamos con el siguiente turno.');
  return parts.join(' ');
}

export function ClubRadioPanel({ headline, checklistItems }: ClubRadioPanelProps) {
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    utterRef.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (!supported) return;
    stop();
    const text = buildScript(headline, checklistItems);
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';
    utter.rate = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const es = voices.find(v => v.lang.startsWith('es'));
    if (es) utter.voice = es;
    utter.onend = () => setPlaying(false);
    utter.onerror = () => setPlaying(false);
    utterRef.current = utter;
    setPlaying(true);
    window.speechSynthesis.speak(utter);
  }, [supported, headline, checklistItems, stop]);

  if (!supported) return null;

  return (
    <div className="chub-panel chub-panel--glass" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--blue-info)', fontWeight: 700 }}>
        <Radio size={14} /> Radio del club
      </div>
      <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
        Escucha el resumen del turno con la voz del navegador (sin servicios externos).
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" size="sm" onClick={playing ? stop : play} disabled={!headline && !checklistItems?.length}>
          {playing ? <><Square size={12} /> Detener</> : <><Play size={12} /> Reproducir</>}
        </Button>
      </div>
    </div>
  );
}
