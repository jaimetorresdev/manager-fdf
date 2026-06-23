// ─── Session Store ──────────────────────────────────────────────────────────
// Estado de sesión global. Se hidrata desde localStorage al cargar la app y
// sincroniza usuario, manager y club. Encapsula login/register/logout.

import { create } from 'zustand';
import { authApi, clubApi, setToken, clearToken, ApiError } from '../api/client';

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  role: string;
  manager: { id: number; clubId: number | null; name: string; prestige?: number; avatarSeed?: string } | null;
}

export interface SessionClub {
  id: number;
  name: string;
  shortName: string;
  badge: string;
  city: string;
  country: string;
  budget: number;
  stadiumName: string;
  stadiumCapacity: number;
  reputation: number;
  fans: number;
  primaryColor?: string;
  secondaryColor?: string;
}

export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface SessionState {
  status: SessionStatus;
  user:   SessionUser | null;
  club:   SessionClub | null;
  error:  string | null;
  previousLoginAt?: string;

  hydrate:  () => Promise<void>;
  login:    (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout:   () => void;
  refreshClub: () => Promise<void>;
  setClubId:   (clubId?: number) => Promise<void>;
  updateUser:  (data: Partial<SessionUser>) => void;
}

const TOKEN_KEY = 'fdf_token';
const ROLE_KEY  = 'fdf_role';
const USER_KEY  = 'fdf_user';

function persistAuth(token: string) {
  setToken(token);
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'idle',
  user:   null,
  club:   null,
  error:  null,
  previousLoginAt: sessionStorage.getItem("fdf_previousLoginAt") || undefined,

  async hydrate() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ status: 'unauthenticated' });
      return;
    }
    set({ status: 'loading', error: null });
    try {
      const user = await authApi.me();
      set({ user, status: 'authenticated' });
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.setItem(ROLE_KEY, user.role);
      await get().refreshClub();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
    sessionStorage.removeItem("fdf_previousLoginAt");
        set({ user: null, club: null, status: 'unauthenticated', error: null, previousLoginAt: undefined });
      } else {
        const stored = localStorage.getItem(USER_KEY);
        if (stored) {
          try {
            set({ user: JSON.parse(stored), status: 'authenticated' });
            await get().refreshClub();
          } catch {
            set({ user: null, club: null, status: 'unauthenticated', error: null });
          }
        } else {
          set({ user: null, club: null, status: 'unauthenticated', error: null });
        }
      }
    }
  },

  async login(username, password) {
    set({ status: 'loading', error: null });
    try {
      const res  = await authApi.login(username, password);
      setToken(res.token);
      const user = await authApi.me();
      persistAuth(res.token);
      if (res.previousLoginAt) sessionStorage.setItem('fdf_previousLoginAt', res.previousLoginAt);
      set({ user, status: 'authenticated', previousLoginAt: res.previousLoginAt });
      await get().refreshClub();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Error al iniciar sesión';
      set({ status: 'unauthenticated', error: msg, user: null, club: null });
      throw e;
    }
  },

  async register(username, email, password) {
    set({ status: 'loading', error: null });
    try {
      const res  = await authApi.register(username, email, password);
      setToken(res.token);
      const user = await authApi.me();
      persistAuth(res.token);
      set({ user, status: 'authenticated' });
      await get().refreshClub();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo crear la cuenta';
      set({ status: 'unauthenticated', error: msg, user: null, club: null });
      throw e;
    }
  },

  logout() {
    if (get().status === 'unauthenticated' && !get().user) return;
    clearToken();
    set({ user: null, club: null, status: 'unauthenticated', error: null });
  },

  async refreshClub() {
    const user = get().user;
    if (!user?.manager?.clubId) {
      set({ club: null });
      return;
    }
    try {
      const club = await clubApi.get();
      set({ club });
    } catch {
      // Si falla no rompemos la sesión; el club volverá en el próximo refresh.
      set({ club: null });
    }
  },

  async setClubId(_clubId?: number) {
    void _clubId;
    // Tras elegir club en onboarding, refrescamos el usuario para reflejar
    // manager.clubId y cargamos el club.
    const user = await authApi.me();
    set({ user });
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    await get().refreshClub();
  },

  updateUser(data: Partial<SessionUser>) {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...data, manager: data.manager ? { ...current.manager, ...data.manager } : current.manager } as SessionUser;
    set({ user: updated });
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('fdf_unauthorized', () => {
    useSession.getState().logout();
  });
}
