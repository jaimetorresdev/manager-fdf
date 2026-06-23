/** I-8 · Cabecera narrativa (crónica en lugar de título seco) */
interface Props {
  kicker?: string;
  title: string;
  lede?: string;
}

export function NarrativePageHeader({ kicker, title, lede }: Props) {
  return (
    <header className="mb-6 pb-4 border-b border-[var(--border-color)]">
      {kicker && (
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold-accent)] font-bold mb-1">{kicker}</p>
      )}
      <h1 className="font-display font-black text-2xl sm:text-3xl text-[var(--text-primary)] uppercase tracking-tight leading-tight">
        {title}
      </h1>
      {lede && (
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl leading-relaxed">{lede}</p>
      )}
    </header>
  );
}
