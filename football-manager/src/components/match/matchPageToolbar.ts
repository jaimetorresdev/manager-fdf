// Estilos compartidos cabecera MatchPage (feel visual).
export const MATCH_PAGE_TOOLBAR_CSS = `
.mp-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}
.mp-toolbar .mp-btn-ghost{color:var(--text-muted)}
.mp-toolbar .mp-btn-ghost:hover{color:var(--text-primary)}
.mp-btn-tunnel{color:var(--gold-accent)!important;border:1px solid color-mix(in srgb,var(--gold-accent) 35%,var(--border-color))!important;background:color-mix(in srgb,var(--gold-accent) 8%,var(--bg-elevated))!important}
.mp-btn-share{color:var(--blue-info)!important;border:1px solid color-mix(in srgb,var(--blue-info) 30%,var(--border-color))!important;background:color-mix(in srgb,var(--blue-info) 8%,var(--bg-elevated))!important}
.mp-btn-share[data-copied="true"]{color:var(--green-primary)!important;border-color:color-mix(in srgb,var(--green-primary) 40%,var(--border-color))!important}
.mp-match-layout{display:grid;grid-template-columns:1fr;gap:16px;align-items:start}
.mp-match-main{min-width:0}
.mp-match-chat{min-width:0}
@media(min-width:1100px){
  .mp-match-layout{grid-template-columns:1fr 300px}
  .mp-match-chat{position:sticky;top:12px;max-height:calc(100vh - 100px);overflow:auto}
}
.mp-audit-fold{border:1px solid var(--border-color);border-radius:10px;padding:10px 14px;background:var(--bg-surface)}
.mp-audit-fold summary{cursor:pointer;font-size:.78rem;font-weight:700;color:var(--text-muted);list-style:none}
.mp-audit-fold summary::-webkit-details-marker{display:none}
.mp-audit-fold[open] summary{color:var(--text-primary);margin-bottom:4px}
.mp-match-view{display:flex;flex-direction:column;gap:10px}
.mp-cinema .mp-match-view{margin:0 -6px;gap:6px}
.mp-cinema .section-title,.mp-cinema .muted-label{display:none}
.mp-cinema .mc-arena{border-radius:12px}
@media(min-width:920px){.mp-cinema .mc-arena-body{min-height:calc(100dvh - 200px)}}
@media(min-width:1100px){.mp-cinema .mp-match-layout{grid-template-columns:1fr!important}}
@media(min-width:1100px){.mp-cinema .mp-match-chat{display:none}}
`;
