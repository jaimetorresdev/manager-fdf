import { create } from 'zustand';
import { gameApi, dashboardApi } from '../api/client';
import { useSession } from './sessionStore';

export interface TickCompletedPayload {
  turn?: number;
  inGameDate?: string;
  invalidates?: string[];
}

export interface GameState {
  id: number;
  /** Nombre de la temporada en curso, p. ej. "2024-25" (GET /game/state). */
  season: string;
  week: number;
  /** Jornada relativa a la temporada; `week` es acumulada entre temporadas. */
  seasonWeek: number;
  phase: string;
  turn: number;
  inGameDate: string;
  nextTickAt: string | null;
  isLocked: boolean;
}

interface GameStore {
  currentPage: string;
  sidebarOpen: boolean;
  selectedPlayerId: string | null;
  selectedStrategyId: number;
  
  // GameState fields
  gameState: GameState | null;
  shellContext: any | null;
  lastFetch: number;
  shellLastFetch: number;
  isFetching: boolean;
  isShellFetching: boolean;

  setCurrentPage: (page: string) => void;
  toggleSidebar: () => void;
  setSelectedPlayer: (id: string | null) => void;
  setSelectedStrategy: (id: number) => void;
  
  fetchGameState: (force?: boolean) => Promise<void>;
  fetchShellContext: (force?: boolean) => Promise<void>;
  handleTickCompleted: (payload: TickCompletedPayload) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  currentPage: 'dashboard',
  sidebarOpen: true,
  selectedPlayerId: null,
  selectedStrategyId: 0,
  
  gameState: null,
  shellContext: null,
  lastFetch: 0,
  shellLastFetch: 0,
  isFetching: false,
  isShellFetching: false,

  setCurrentPage: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSelectedPlayer: (id) => set({ selectedPlayerId: id }),
  setSelectedStrategy: (id) => set({ selectedStrategyId: id }),
  
  fetchGameState: async (force = false) => {
    // El shell sobrevive a la navegación; evita duplicados de StrictMode y
    // recargas encadenadas que antes agotaban el rate limit.
    if (get().isFetching || (!force && Date.now() - get().lastFetch < 5_000)) return;
    set({ isFetching: true });
    try {
      const state = await gameApi.getState();
      set({ gameState: state, lastFetch: Date.now() });
    } catch (e) {
      console.error('Failed to fetch game state:', e);
    } finally {
      set({ isFetching: false });
    }
  },

  fetchShellContext: async (force = false) => {
    if (get().isShellFetching || (!force && Date.now() - get().shellLastFetch < 5_000)) return;
    set({ isShellFetching: true });
    try {
      const ctx = await dashboardApi.shellContext();
      set({ shellContext: ctx, shellLastFetch: Date.now() });
    } catch (e) {
      console.error('Failed to fetch shell context:', e);
    } finally {
      set({ isShellFetching: false });
    }
  },

  handleTickCompleted: (payload) => {
    void get().fetchGameState(true);
    void get().fetchShellContext(true);
    const keys = payload.invalidates ?? [];
    const broad = keys.length === 0 || keys.some((k) =>
      ['club', 'market', 'dashboard', 'notifications', 'matches', 'news', 'world'].includes(k),
    );
    if (broad) {
      void useSession.getState().refreshClub();
    }
  },
}));
