// ─── FallbackRedirect — ruta * inteligente (I-35) ─────────────────────────────
import { Navigate } from 'react-router-dom';
import { useSession } from '../../stores/sessionStore';
import { LoreLoader } from '../../components/live';

export function FallbackRedirect() {
  const { status } = useSession();

  if (status === 'idle' || status === 'loading') {
    return <LoreLoader />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/landing" replace />;
  }

  return <Navigate to="/" replace />;
}
