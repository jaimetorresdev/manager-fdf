import { create } from 'zustand';
import { managerApi } from '../api/client';

export interface TutorialStep {
  step: number;
  key: string;
  route: string;
  objective: string;
}

export interface TutorialState {
  managerId: number;
  tutorialStep: number;
  tutorialCompleted: boolean;
  tutorialSkipped: boolean;
  steps: TutorialStep[];
}

interface TutorialStore {
  state: TutorialState | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  load: () => Promise<void>;
  skip: () => Promise<void>;
  advance: () => Promise<void>;
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  state: null,
  status: 'idle',
  load: async () => {
    set({ status: 'loading' });
    try {
      const data = await managerApi.getTutorial();
      set({ state: data, status: 'loaded' });
    } catch {
      set({ status: 'error' });
    }
  },
  skip: async () => {
    try {
      await managerApi.updateTutorial({ tutorialSkipped: true });
      set((s) => ({ state: s.state ? { ...s.state, tutorialSkipped: true } : null }));
    } catch (e) {
      console.error(e);
    }
  },
  advance: async () => {
    const s = get().state;
    if (!s) return;
    const nextStep = s.tutorialStep + 1;
    const isCompleted = nextStep > s.steps.length;
    try {
      await managerApi.updateTutorial({ 
        tutorialStep: isCompleted ? s.tutorialStep : nextStep,
        tutorialCompleted: isCompleted 
      });
      set({ state: { ...s, tutorialStep: isCompleted ? s.tutorialStep : nextStep, tutorialCompleted: isCompleted } });
    } catch (e) {
      console.error(e);
    }
  }
}));
