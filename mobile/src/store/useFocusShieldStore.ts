import { create } from "zustand";

import { EMPTY_PROGRESS, masteryKey, updateMastery } from "@/focusShield/adaptive";
import { loadProgress, saveProgress } from "@/focusShield/persistence";
import type { ChallengeProgress } from "@/focusShield/types";

interface FocusShieldState {
  userId: string | null;
  progress: ChallengeProgress;
  storageError: boolean;
  hydrate: (userId: string) => void;
  recordAnswer: (userId: string, subject: string, topic: string, skill: string, questionId: string, correct: boolean, hintUsed: boolean) => void;
}

export const useFocusShieldStore = create<FocusShieldState>((set, get) => ({
  userId: null,
  progress: EMPTY_PROGRESS,
  storageError: false,
  hydrate: (userId) => set({ userId, progress: loadProgress(userId), storageError: false }),
  recordAnswer: (userId, subject, topic, skill, questionId, correct, hintUsed) => {
    const current = get().userId === userId ? get().progress : loadProgress(userId);
    const key = masteryKey(subject, topic, skill);
    const prior = current.skills[key] ?? null;
    const next: ChallengeProgress = {
      version: 2,
      skills: { ...current.skills, [key]: updateMastery(prior, correct, hintUsed) },
      recentQuestionIds: [...current.recentQuestionIds.filter((id) => id !== questionId), questionId].slice(-30),
    };
    const saved = saveProgress(userId, next);
    set({ userId, progress: next, storageError: !saved });
  },
}));
