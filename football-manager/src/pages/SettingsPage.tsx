import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSession } from '../stores/sessionStore';
import { authApi, pushApi } from '../api/client';
import { Button } from '../components/ui';
import { getA11y, setA11y, type A11ySettings, type FontScale } from '../lib/a11y';
import { isAmbientEnabled, setAmbientEnabled } from '../components/match/broadcastAudio';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function SettingsPage() {
  const { t } = useTranslation('common');
  const { user, updateUser } = useSession();
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(user?.manager?.avatarSeed || user?.username || 'FDF');

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  const [a11y, setA11yState] = useState<A11ySettings>(() => getA11y());
  const [ambient, setAmbient] = useState(() => isAmbientEnabled());

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  const handleUpdateProfile = async () => {
    try {
      await authApi.updateMe({ email, avatarSeed });
      updateUser({ email, manager: { ...(user?.manager as any), avatarSeed } });
      toast.success(t('Perfil actualizado correctamente'));
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || t('Error al actualizar perfil'));
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return toast.error(t('Rellena ambos campos'));
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      toast.success(t('Contraseña cambiada'));
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: any) {
      toast.error(e.response?.data?.error || e.message || t('Error al cambiar contraseña'));
    }
  };

  const handleTogglePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      
      if (sub) {
        await sub.unsubscribe();
        await pushApi.unsubscribe(sub.endpoint).catch(() => {});
        setPushEnabled(false);
        toast.success(t('Notificaciones desactivadas'));
      } else {
        const { enabled, vapidPublicKey } = await pushApi.getConfig();
        if (!enabled || !vapidPublicKey) {
          return toast.error(t('El servidor no tiene Push habilitado'));
        }
        
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          return toast.error(t('Permiso de notificaciones denegado'));
        }
        
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
        
        await pushApi.subscribe(sub.toJSON() as PushSubscriptionJSON);
        setPushEnabled(true);
        toast.success(t('Notificaciones activadas'));
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('Error al configurar notificaciones'));
    }
  };

  const handleTestPush = async () => {
    try {
      await pushApi.test();
      toast.success(t('Notificación de prueba enviada'));
    } catch {
      toast.error(t('Error al enviar prueba'));
    }
  };

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600, margin: '0 auto' }}>
      <div>
        <p className="muted-label">{t('Ajustes')}</p>
        <h1 className="section-title text-3xl">{t('Tu Cuenta')}</h1>
      </div>

      <div className="section-panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>{t('Perfil y Avatar')}</h2>
        
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <img 
              src={`https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(avatarSeed)}`} 
              alt="Avatar" 
              style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--bg-base)', border: '2px solid var(--border-color)' }}
            />
            <Button size="sm" onClick={() => setAvatarSeed(Math.random().toString(36).substring(7))}>{t('Aleatorio')}</Button>
          </div>
          
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label htmlFor="settings-email" style={{ display: 'block', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('Correo Electrónico')}</label>
              <input 
                id="settings-email"
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label htmlFor="settings-avatar" style={{ display: 'block', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('Semilla de Avatar (Personalizada)')}</label>
              <input 
                id="settings-avatar"
                value={avatarSeed} 
                onChange={e => setAvatarSeed(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)' }}
              />
            </div>
            <Button onClick={handleUpdateProfile} style={{ alignSelf: 'flex-start' }}>{t('Guardar Perfil')}</Button>
          </div>
        </div>
      </div>

      {pushSupported && (
        <div className="section-panel" style={{ padding: 20 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16, color: 'var(--blue-info)' }}>{t('Notificaciones Push')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {t('Activa las notificaciones para recibir alertas cuando se complete el turno, pujas superadas, y eventos importantes, incluso con la app cerrada.')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button onClick={handleTogglePush} variant={pushEnabled ? "danger" : "primary"}>
                {pushEnabled ? t('Desactivar Notificaciones') : t('Activar Notificaciones')}
              </Button>
              {pushEnabled && (
                <Button onClick={handleTestPush} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                  {t('Probar Push')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="section-panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16, color: 'var(--gold-accent)' }}>{t('Accesibilidad y Apariencia')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label htmlFor="settings-ambient" style={{ fontSize: '0.95rem', fontWeight: 600, display: 'block', cursor: 'pointer' }}>{t('Ambiente de estadio')}</label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('Murmullo de grada en partidos (requiere activar sonido en Match Center). Respeta movimiento reducido.')}</p>
            </div>
            <button
              id="settings-ambient"
              role="switch"
              aria-checked={ambient}
              aria-label="Ambiente de estadio"
              style={{
                width: 44, height: 24, borderRadius: 99, border: '1px solid var(--border-color)',
                background: ambient ? 'var(--green-primary)' : 'var(--bg-elevated)',
                position: 'relative', cursor: 'pointer', transition: 'background .15s'
              }}
              onClick={() => {
                const next = !ambient;
                setAmbient(next);
                setAmbientEnabled(next);
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%',
                background: ambient ? 'var(--avatar-text)' : 'var(--text-primary)',
                transform: ambient ? 'translateX(20px)' : 'none', transition: 'transform .15s'
              }} />
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label htmlFor="settings-colorblind" style={{ fontSize: '0.95rem', fontWeight: 600, display: 'block', cursor: 'pointer' }}>{t('Modo Daltónico')}</label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('Activa una paleta de colores optimizada (Okabe-Ito)')}</p>
            </div>
            <button
              id="settings-colorblind"
              role="switch"
              aria-checked={a11y.colorblind}
              aria-label="Modo Daltónico"
              style={{
                width: 44, height: 24, borderRadius: 99, border: '1px solid var(--border-color)',
                background: a11y.colorblind ? 'var(--green-primary)' : 'var(--bg-elevated)',
                position: 'relative', cursor: 'pointer', transition: 'background .15s'
              }}
              onClick={() => {
                const next = { ...a11y, colorblind: !a11y.colorblind };
                setA11yState(next); setA11y(next);
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%',
                background: a11y.colorblind ? 'var(--avatar-text)' : 'var(--text-primary)',
                transform: a11y.colorblind ? 'translateX(20px)' : 'none', transition: 'transform .15s'
              }} />
            </button>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t('Tamaño de Texto')}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('Ajusta el tamaño global de la interfaz')}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['sm', 'md', 'lg'] as FontScale[]).map(size => (
                <button
                  key={size}
                  role="radio"
                  aria-checked={a11y.fontScale === size}
                  aria-label={`Tamaño de texto ${size}`}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: '0.85rem', fontFamily: 'var(--font-mono-retro)',
                    background: a11y.fontScale === size ? 'var(--green-primary)' : 'var(--bg-elevated)',
                    color: a11y.fontScale === size ? 'var(--avatar-text)' : 'var(--text-muted)',
                    border: a11y.fontScale === size ? 'none' : '1px solid var(--border-color)', cursor: 'pointer'
                  }}
                  onClick={() => {
                    const next = { ...a11y, fontScale: size };
                    setA11yState(next); setA11y(next);
                  }}
                >
                  {size === 'sm' ? t('A−') : size === 'md' ? t('A') : t('A+')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="section-panel" style={{ padding: 20 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16, color: 'var(--red-danger)' }}>{t('Seguridad')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="settings-current-password" style={{ display: 'block', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('Contraseña Actual')}</label>
            <input 
              id="settings-current-password"
              type="password" 
              value={currentPassword} 
              onChange={e => setCurrentPassword(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label htmlFor="settings-new-password" style={{ display: 'block', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('Nueva Contraseña')}</label>
            <input 
              id="settings-new-password"
              type="password" 
              value={newPassword} 
              onChange={e => setNewPassword(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-primary)' }}
            />
          </div>
          <Button onClick={handleChangePassword} variant="danger" style={{ alignSelf: 'flex-start' }}>{t('Cambiar Contraseña')}</Button>
        </div>
      </div>
    </div>
  );
}
