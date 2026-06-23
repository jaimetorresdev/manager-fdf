// ─── Login — la portada del juego (E17 · LOTE C + B11 Landing) ───────────────────────────────
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '../stores/sessionStore';
import { Users, TrendingUp, Trophy, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { PublicNav } from '../components/layout/PublicNav';
import { FootballStadiumBackground } from '../components/auth/FootballStadiumBackground';
import { AuthPageStyles } from '../components/auth/AuthPageStyles';

interface LocationState { from?: string; hint?: string }

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locState = (location.state as LocationState | null);
  const from     = locState?.from ?? '/';
  const hint     = locState?.hint;

  const { login } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [busy,      setBusy]      = useState(false);
  // La portada comercial ya vive en /landing. /login abre directamente la
  // puerta de acceso para no obligar al usuario a superar dos héroes seguidos.
  const [showLogin, setShowLogin] = useState(true);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) return;
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <PublicNav />
      <main className="flex-1 flex flex-col">
        <FootballStadiumBackground className="flex-1 flex flex-col items-center justify-center px-4 py-10">
          <AuthPageStyles />

          {hint && (
            <p className="relative z-10 mb-4 max-w-md text-center text-sm px-4 py-2 rounded-lg border border-[var(--gold-accent)]/40 bg-[color-mix(in_srgb,var(--gold-accent)_12%,transparent)] text-[var(--text-primary)]">
              {hint}
            </p>
          )}

          <div className="relative z-10 mb-8 text-center select-none">
            <h1 className="auth-brand">
              <span className="auth-brand-top">{t('auth.brandTop')}</span>
              <span className="auth-brand-main">{t('Manager FDF')}</span>
            </h1>
            <p className="auth-tag">{t('auth.tag')}<span className="caret-blink">_</span></p>
          </div>

          {!showLogin ? (
            <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <p className="text-center mb-10 text-[1.05rem] leading-relaxed max-w-2xl mx-auto text-[var(--text-primary)]">
                {t('auth.hero')}
              </p>

              <button
                onClick={() => setShowLogin(true)}
                className="bg-[var(--green-primary)] text-[var(--avatar-text)] px-12 py-5 text-xl font-black uppercase italic tracking-widest flex items-center gap-3 transition-transform hover:scale-105 active:scale-95 shadow-[0_0_30px_var(--green-primary)] border-b-4 border-black/30"
                style={{ fontFamily: 'var(--font-display)', clipPath: 'polygon(15px 0, 100% 0, calc(100% - 15px) 100%, 0 100%)' }}
              >
                {t('auth.startAdventure')} <ArrowRight size={24} />
              </button>

              <div className="flex flex-wrap justify-center gap-3 mt-8 text-[10px] uppercase tracking-widest font-bold">
                <Link to="/explore" className="px-4 py-2 border border-white/15 rounded-lg text-[var(--text-muted)] hover:text-[var(--green-primary)] hover:border-[var(--green-primary)] transition-colors bg-black/30 backdrop-blur-sm">
                  {t('auth.exploreWorld')}
                </Link>
                <Link to="/manual" className="px-4 py-2 border border-white/15 rounded-lg text-[var(--text-muted)] hover:text-[var(--green-primary)] hover:border-[var(--green-primary)] transition-colors bg-black/30 backdrop-blur-sm">
                  {t('auth.readManual')}
                </Link>
                <Link to="/register" className="px-4 py-2 border border-[var(--green-primary)]/40 rounded-lg text-[var(--green-primary)] hover:bg-[var(--green-primary)]/10 transition-colors bg-black/30 backdrop-blur-sm">
                  {t('auth.registerCta')}
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-12">
                <div className="auth-feature-card">
                  <div className="auth-feature-icon"><Trophy size={24} /></div>
                  <h3 className="auth-feature-title">{t('auth.featureTacticsTitle')}</h3>
                  <p className="auth-feature-desc">{t('auth.featureTacticsDesc')}</p>
                </div>
                <div className="auth-feature-card">
                  <div className="auth-feature-icon"><TrendingUp size={24} /></div>
                  <h3 className="auth-feature-title">{t('auth.featureEconomyTitle')}</h3>
                  <p className="auth-feature-desc">{t('auth.featureEconomyDesc')}</p>
                </div>
                <div className="auth-feature-card">
                  <div className="auth-feature-icon"><Users size={24} /></div>
                  <h3 className="auth-feature-title">{t('auth.featureMultiTitle')}</h3>
                  <p className="auth-feature-desc">{t('auth.featureMultiDesc')}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="auth-panel relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
              <header className="auth-panel-header flex justify-between items-center px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="window-dots" aria-hidden>
                    <span className="bg-[var(--red-danger)] animate-pulse" />
                    <span className="bg-[var(--gold-accent)]" />
                    <span className="bg-[var(--green-primary)]" />
                  </span>
                  <span className="font-display font-black italic tracking-widest text-white ml-2">
                    {t('auth.fdfServer')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg opacity-40" aria-hidden>⚽</span>
                  <button
                    type="button"
                    onClick={() => setShowLogin(false)}
                    className="text-[10px] hover:text-[var(--red-danger)] font-bold transition-colors uppercase tracking-widest text-[var(--text-muted)]"
                  >
                    {t('auth.cancel')}
                  </button>
                </div>
              </header>

              <div className="p-8">
                <p className="font-mono-retro mb-6 text-center text-xs text-[var(--text-muted)]">
                  {t('auth.credentialsPrompt')}<span className="caret-blink">_</span>
                </p>

                <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
                  <label htmlFor="login-username" className="block">
                    <span className="muted-label">{t('auth.username')}</span>
                    <input
                      id="login-username"
                      type="text"
                      required
                      autoFocus
                      autoComplete="username"
                      data-testid="login-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="auth-field"
                    />
                  </label>

                  <label htmlFor="login-password" className="block">
                    <span className="muted-label">{t('auth.password')}</span>
                    <div className="auth-field-wrap">
                      <input
                        id="login-password"
                        type={showPass ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        data-testid="login-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-field auth-field--password"
                      />
                      <button
                        type="button"
                        className="auth-toggle"
                        onClick={() => setShowPass((v) => !v)}
                        aria-label={showPass ? t('auth.hidePassword') : t('auth.showPassword')}
                      >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>

                  {error && (
                    <div
                      className="font-mono-retro rounded-md px-3 py-2 text-xs"
                      role="alert"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--red-danger) 12%, transparent)',
                        border:          '1px solid var(--red-danger)',
                        color:           'var(--red-danger)',
                      }}
                    >
                      ! {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="login-submit"
                    className="w-full bg-[var(--green-primary)] text-[var(--avatar-text)] px-4 py-4 text-sm font-black italic uppercase tracking-widest transition-opacity disabled:opacity-60 min-h-[44px] shadow-[0_0_15px_var(--green-primary)]"
                    style={{ fontFamily: 'var(--font-display)', clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)' }}
                  >
                    {busy ? t('auth.connecting') : t('auth.enterServer')}
                  </button>
                </form>

                <div className="mt-6 text-center text-xs text-[var(--text-muted)]">
                  {t('auth.noAccount')}{' '}
                  <Link
                    to="/register"
                    data-testid="login-register-link"
                    className="font-bold text-[var(--green-primary)]"
                  >
                    {t('auth.registerCta')}
                  </Link>
                </div>

                {import.meta.env.DEV && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={async () => {
                        setError(null);
                        setBusy(true);
                        try {
                          await login('ragnar', 'demo1234');
                          navigate(from, { replace: true });
                        } catch (e) {
                          setError(e instanceof Error ? e.message : t('auth.error'));
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="font-mono-retro rounded-md px-3 py-2 text-xs transition-colors text-[var(--text-muted)] bg-[var(--bg-base)] border border-[var(--border-color)]"
                    >
                      {t('auth.tryDemo')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="relative z-10 font-mono-retro mt-6 text-[10px] text-[var(--text-muted)] opacity-70">
            {t('auth.footer')}
          </p>
        </FootballStadiumBackground>
      </main>
    </div>
  );
}
