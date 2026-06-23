/** Estilos compartidos de marca y campos en pantallas de auth pública. */
export function AuthPageStyles() {
  return (
    <style>{`
      .auth-brand{font-family:var(--font-display);font-weight:700;line-height:.95;text-transform:uppercase;
        letter-spacing:2px;color:var(--green-primary);
        text-shadow:0 0 18px color-mix(in srgb,var(--green-primary) 50%,transparent),
                    0 0 46px color-mix(in srgb,var(--green-primary) 22%,transparent)}
      .auth-brand-top{display:block;font-size:1rem;letter-spacing:8px;color:var(--text-muted);text-shadow:none;margin-bottom:2px}
      .auth-brand-main{display:block;font-size:clamp(2.2rem,7vw,3.4rem)}
      .auth-tag{font-family:var(--font-mono-retro);font-size:.72rem;color:var(--text-muted);letter-spacing:1px;margin-top:8px}
      @media (prefers-reduced-motion: no-preference){
        @keyframes auth-flicker{0%,97%,100%{opacity:1}98%{opacity:.92}}
        .auth-brand{animation:auth-flicker 6s infinite}
      }
      .auth-field{font-family:var(--font-mono-retro);width:100%;border-radius:var(--radius-retro);
        padding:10px 12px;font-size:.88rem;outline:none;background:var(--bg-base);
        border:1px solid var(--border-color);color:var(--text-primary);transition:border-color .15s,box-shadow .15s}
      .auth-field:focus{border-color:var(--green-primary);box-shadow:0 0 10px color-mix(in srgb,var(--green-primary) 25%,transparent)}
      .auth-field--password{padding-right:40px}
      .auth-field-wrap{position:relative;margin-top:4px}
      .auth-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);
        padding:6px;border-radius:6px;color:var(--text-muted);transition:color .15s}
      .auth-toggle:hover{color:var(--green-primary)}
      .auth-hint{font-family:var(--font-mono-retro);font-size:.68rem;color:var(--text-muted);margin-top:3px}
      .auth-panel{
        background:var(--glass-panel);backdrop-filter:blur(20px);
        box-shadow:var(--shadow-soft),0 0 0 1px var(--border-color);
        border:1px solid var(--border-color);
        border-top:4px solid var(--green-primary);
        border-radius:var(--radius-retro);
        clip-path:polygon(20px 0,100% 0,calc(100% - 20px) 100%,0 100%)}
      .auth-panel-header{background:var(--bg-elevated);border-bottom:1px solid var(--border-color)}
      .auth-feature-card{
        background:var(--glass-panel);border:1px solid var(--border-color);
        border-left:4px solid var(--green-primary);padding:1.5rem;text-align:center;
        backdrop-filter:blur(12px);border-radius:var(--radius-retro);
        box-shadow:var(--shadow-soft)}
      .auth-feature-icon{
        display:inline-flex;align-items:center;justify-content:center;
        width:48px;height:48px;border-radius:50%;
        background:color-mix(in srgb,var(--green-primary) 15%,transparent);
        color:var(--green-primary);margin-bottom:1rem}
      .auth-feature-title{font-family:var(--font-display);font-weight:700;margin-bottom:.5rem;
        color:var(--text-primary);text-transform:uppercase;letter-spacing:1px;font-size:.95rem}
      .auth-feature-desc{color:var(--text-muted);font-size:.85rem;line-height:1.5}
    `}</style>
  );
}
