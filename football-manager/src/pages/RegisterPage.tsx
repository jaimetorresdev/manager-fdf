// ─── Registro — alta de nuevo mánager (E17 · LOTE C) ───────────────────────────
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { useSession } from '../stores/sessionStore';
import { PublicNav } from '../components/layout/PublicNav';
import { FootballStadiumBackground } from '../components/auth/FootballStadiumBackground';
import { AuthPageStyles } from '../components/auth/AuthPageStyles';
import {
  getPasswordChecks,
  getPasswordStrength,
  isPasswordAcceptable,
  STRENGTH_COLORS,
  STRENGTH_SEGMENTS,
  type PasswordStrength,
} from '../lib/passwordStrength';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useSession();

  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [terms,    setTerms]    = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);

  const strength     = useMemo(() => getPasswordStrength(password), [password]);
  const checkLabels  = useMemo(() => ({
    length:  t('auth.register.checkLength'),
    lower:   t('auth.register.checkLower'),
    upper:   t('auth.register.checkUpper'),
    digit:   t('auth.register.checkDigit'),
    special: t('auth.register.checkSpecial'),
  }), [t]);
  const passChecks   = useMemo(() => getPasswordChecks(password, checkLabels), [password, checkLabels]);
  const passwordsOk  = password.length > 0 && password === confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!USERNAME_RE.test(username.trim())) {
      setError(t('auth.register.errorUsername'));
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('auth.register.errorEmail'));
      return;
    }
    if (!isPasswordAcceptable(password)) {
      setError(t('auth.register.errorWeakPassword'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.register.errorMismatch'));
      return;
    }
    if (!terms) {
      setError(t('auth.register.errorTerms'));
      return;
    }

    setBusy(true);
    try {
      await register(username.trim(), email.trim(), password);
      navigate('/onboarding', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.register.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <PublicNav />

      <FootballStadiumBackground className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <AuthPageStyles />
        <style>{`
          .reg-strength{display:flex;gap:4px;margin-top:8px}
          .reg-strength-seg{flex:1;height:4px;border-radius:2px;background:var(--border-color);transition:background .2s}
          .reg-strength-label{font-family:var(--font-mono-retro);font-size:.68rem;margin-top:4px}
          .reg-checks{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}
          .reg-check{font-family:var(--font-mono-retro);font-size:.65rem;display:flex;align-items:center;gap:4px;color:var(--text-muted)}
          .reg-check--met{color:var(--green-primary)}
          .reg-match{font-family:var(--font-mono-retro);font-size:.68rem;margin-top:4px;display:flex;align-items:center;gap:4px}
          .reg-terms{display:flex;align-items:flex-start;gap:10px;margin-top:4px;cursor:pointer}
          .reg-terms input{margin-top:3px;accent-color:var(--green-primary);width:16px;height:16px;flex-shrink:0}
          .reg-terms span{font-size:.75rem;color:var(--text-muted);line-height:1.4}
        `}</style>

        <div className="relative z-10 mb-8 text-center select-none">
          <h1 className="auth-brand">
            <span className="auth-brand-top">{t('auth.brandTop')}</span>
            <span className="auth-brand-main">{t('Manager FDF')}</span>
          </h1>
        </div>

        <div className="auth-panel relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
          <header className="auth-panel-header flex justify-between items-center px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="window-dots" aria-hidden>
                <span className="bg-[var(--red-danger)] animate-pulse" />
                <span className="bg-[var(--gold-accent)]" />
                <span className="bg-[var(--green-primary)]" />
              </span>
              <span className="font-display font-black italic tracking-widest text-white ml-2">
                {t('auth.register.title')}
              </span>
            </div>
            <span className="text-lg opacity-40" aria-hidden>⚽</span>
          </header>

          <div className="p-8">
            <p className="font-mono-retro mb-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              &gt; {t('auth.register.prompt')}<span className="caret-blink">_</span>
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" data-testid="register-form" noValidate>
              <Field
                id="reg-username"
                label={t('auth.register.username')}
                hint={t('auth.register.usernameHint')}
                type="text"
                value={username}
                onChange={setUsername}
                autoFocus
                autoComplete="username"
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]{3,30}"
              />

              <Field
                id="reg-email"
                label={t('auth.register.email')}
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                required
              />

              <div>
                <label htmlFor="reg-password" className="block">
                  <span className="muted-label">{t('auth.register.password')}</span>
                  <div className="auth-field-wrap">
                    <input
                      id="reg-password"
                      type={showPass ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="auth-field auth-field--password"
                      data-testid="register-password"
                    />
                    <button
                      type="button"
                      className="auth-toggle"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? t('auth.register.hidePassword') : t('auth.register.showPassword')}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                {password.length > 0 && (
                  <>
                    <PasswordStrengthBar strength={strength} label={strengthLabel(strength, t)} />
                    <p className="auth-hint mt-2">{t('auth.register.requirements')}</p>
                    <div className="reg-checks">
                      {passChecks.map((c) => (
                        <span key={c.key} className={`reg-check ${c.met ? 'reg-check--met' : ''}`}>
                          {c.met ? <Check size={11} /> : <X size={11} />}
                          {c.label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div>
                <label htmlFor="reg-confirm" className="block">
                  <span className="muted-label">{t('auth.register.confirmPassword')}</span>
                  <div className="auth-field-wrap">
                    <input
                      id="reg-confirm"
                      type={showConf ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="auth-field auth-field--password"
                      data-testid="register-confirm"
                    />
                    <button
                      type="button"
                      className="auth-toggle"
                      onClick={() => setShowConf((v) => !v)}
                      aria-label={showConf ? t('auth.register.hidePassword') : t('auth.register.showPassword')}
                    >
                      {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
                {confirm.length > 0 && (
                  <p className={`reg-match ${passwordsOk ? 'text-[var(--green-primary)]' : 'text-[var(--red-danger)]'}`}>
                    {passwordsOk ? <Check size={11} /> : <X size={11} />}
                    {passwordsOk ? t('auth.register.passwordsMatch') : t('auth.register.errorMismatch')}
                  </p>
                )}
              </div>

              <label className="reg-terms">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  data-testid="register-terms"
                />
                <span>{t('auth.register.acceptTerms')}</span>
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
                data-testid="register-submit"
                className="w-full bg-[var(--green-primary)] text-[var(--avatar-text)] px-4 py-4 text-sm font-black italic uppercase tracking-widest transition-opacity disabled:opacity-60 min-h-[44px] shadow-[0_0_15px_var(--green-primary)]"
                style={{ fontFamily: 'var(--font-display)', clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)' }}
              >
                {busy ? t('auth.register.submitting') : t('auth.register.submit')}
              </button>
            </form>

            <div className="mt-6 flex flex-wrap justify-center gap-3 text-[10px] uppercase tracking-widest font-bold">
              <Link to="/explore" className="px-3 py-1.5 border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] hover:text-[var(--green-primary)] transition-colors">
                {t('auth.register.explore')}
              </Link>
              <Link to="/manual" className="px-3 py-1.5 border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] hover:text-[var(--green-primary)] transition-colors">
                {t('auth.register.manual')}
              </Link>
            </div>

            <div className="mt-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('auth.register.hasAccount')}{' '}
              <Link to="/login" className="font-bold" style={{ color: 'var(--green-primary)' }}>
                {t('auth.register.login')}
              </Link>
            </div>
          </div>
        </div>

        <p className="relative z-10 font-mono-retro mt-6 text-[10px]" style={{ color: 'var(--text-muted)', opacity: .7 }}>
          {t('auth.footer')}
        </p>
      </FootballStadiumBackground>
    </div>
  );
}

function strengthLabel(strength: PasswordStrength, t: (k: string) => string): string {
  const map: Record<PasswordStrength, string> = {
    empty:  t('auth.register.strengthEmpty'),
    weak:   t('auth.register.strengthWeak'),
    fair:   t('auth.register.strengthFair'),
    good:   t('auth.register.strengthGood'),
    strong: t('auth.register.strengthStrong'),
  };
  return map[strength];
}

function PasswordStrengthBar({ strength, label }: { strength: PasswordStrength; label: string }) {
  if (strength === 'empty') return null;
  const color    = STRENGTH_COLORS[strength];
  const segments = STRENGTH_SEGMENTS[strength];
  return (
    <div>
      <div className="reg-strength" role="meter" aria-valuenow={segments} aria-valuemin={0} aria-valuemax={4} aria-label={label}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="reg-strength-seg" style={{ background: i <= segments ? color : undefined }} />
        ))}
      </div>
      <p className="reg-strength-label" style={{ color }}>{label}</p>
    </div>
  );
}

interface FieldProps {
  id:           string;
  label:        string;
  hint?:        string;
  type:         string;
  value:        string;
  onChange:     (v: string) => void;
  autoFocus?:   boolean;
  autoComplete?: string;
  minLength?:   number;
  maxLength?:   number;
  pattern?:     string;
  required?:    boolean;
}

function Field({ id, label, hint, type, value, onChange, autoFocus, autoComplete, minLength, maxLength, pattern, required = true }: FieldProps) {
  return (
    <label htmlFor={id} className="block">
      <span className="muted-label">{label}</span>
      <input
        id={id}
        type={type}
        required={required}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="auth-field"
        style={{ paddingRight: 12 }}
      />
      {hint && <p className="auth-hint">{hint}</p>}
    </label>
  );
}
