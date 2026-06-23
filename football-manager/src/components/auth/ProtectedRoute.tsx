// ─── ProtectedRoute ──────────────────────────────────────────────────────────
// Wrapper de rutas autenticadas:
//   - status === 'idle' o 'loading': muestra placeholder.
//   - status === 'unauthenticated': redirige a /login (guardando la URL origen).
//   - status === 'authenticated' pero sin club: redirige a /onboarding.
//   - status === 'authenticated' con club: renderiza el contenido.

import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../../stores/sessionStore';

// Jerarquía de roles: master > admin > agente_fifa > manager.
const ROLE_RANK: Record<string, number> = { manager: 0, agente_fifa: 1, admin: 2, master: 3 };
const rankOf = (role?: string) => ROLE_RANK[role ?? 'manager'] ?? 0;

const CLUB_REQUIRED_PATHS = [
  '/', '/competition', '/transfers', '/club-management', '/squad', '/tactics',
  '/training', '/scout', '/economy', '/staff', '/stadium', '/residences', '/fans',
  '/market', '/vacancies', '/calendar', '/league', '/matches', '/live', '/club/kits',
  '/career', '/ideology', '/auctions', '/negotiations', '/shortlist',
  '/shares', '/me',
];

function needsClub(pathname: string) {
  if (pathname === '/') return true;
  return CLUB_REQUIRED_PATHS.some((path) => path !== '/' && (pathname === path || pathname.startsWith(`${path}/`)));
}

function staffHome(role: string) {
  if (role === 'master') return '/master';
  if (role === 'admin') return '/admin';
  return '/fifa';
}

type RoleName = 'manager' | 'agente_fifa' | 'admin' | 'master';

interface Props {
  /** Si true, NO exige que el manager tenga clubId (útil para /onboarding). */
  allowWithoutClub?: boolean;
  /** Si true, exige rol admin o superior. (Equivale a requireRole="admin".) */
  requireAdmin?: boolean;
  /** Exige un rol mínimo jerárquico (manager | agente_fifa | admin | master). */
  requireRole?: RoleName;
  /**
   * Restringe a roles EXACTOS (p.ej. el panel admin solo lo ve admin, el de
   * FIFA solo el agente FIFA). El master SIEMPRE tiene acceso (control absoluto).
   */
  allowRoles?: RoleName[];
}

export function ProtectedRoute({ allowWithoutClub = false, requireAdmin = false, requireRole, allowRoles }: Props) {
  const location = useLocation();
  const { status, user, hydrate } = useSession();

  const [loadingText] = useState(() => ["Cargando el vestuario...", "Cortando el césped del estadio...", "Negociando primas de fichaje...", "Calentando a los suplentes..."][Math.floor(Math.random() * 4)]);

  useEffect(() => {
    if (status === 'idle') hydrate();
  }, [status, hydrate]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}
      >
        
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--border-color)] border-t-[var(--green-primary)] rounded-full animate-spin"></div>
          <p className="text-sm font-mono text-[var(--green-primary)] animate-pulse">
            {loadingText}
          </p>
        </div>

      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    if (location.pathname === '/') {
      return <Navigate to="/landing" replace />;
    }
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // Roles exactos (con master siempre permitido): paneles de gestión.
  if (allowRoles && user.role !== 'master' && !allowRoles.includes(user.role as RoleName)) {
    return <Navigate to="/" replace />;
  }

  const minRole = requireRole ?? (requireAdmin ? 'admin' : undefined);
  if (minRole && rankOf(user.role) < rankOf(minRole)) {
    return <Navigate to="/" replace />;
  }

  const isStaff = rankOf(user.role) >= rankOf('agente_fifa');
  const hasClub = Boolean(user.manager?.clubId);
  // Las vistas operativas del club no deben abrirse sin contexto: antes los perfiles
  // staff acababan en un dashboard vacío con navegación parcial.
  if (!allowWithoutClub && !hasClub && needsClub(location.pathname)) {
    if (isStaff) return <Navigate to={staffHome(user.role)} replace />;
    if (location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
