import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { Platform } from "react-native";

import {
  isAccent,
  isAppearance,
  type AccentName,
  type Appearance,
} from "@/theme/tokens";

if (process.env.NODE_ENV !== "test" && Platform.OS !== "web") {
  // Expo SQLite installs the native SQLite-backed localStorage implementation.
  // Jest uses its browser storage implementation instead.
  require("expo-sqlite/localStorage/install");
}

export const PREFERENCES_STORAGE_KEY = "momentum-preferences-v1";

export interface PreferencesState {
  appearance: Appearance;
  accent: AccentName;
  hydrationStatus: "idle" | "hydrating" | "ready" | "error";
  setAppearance: (appearance: Appearance) => void;
  setAccent: (accent: AccentName) => void;
  reset: () => void;
}

export const DEFAULT_PREFERENCES = {
  appearance: "dark" as const,
  accent: "blue" as const,
};

const memoryStorage = new Map<string, string>();
let preferencesStore: typeof usePreferencesStore | undefined;

function reportStorageError(operation: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[preferences] ${operation} failed: ${message}`);
}

export const preferencesStorage: StateStorage = {
  getItem: (name) => {
    try {
      const value =
        typeof localStorage === "undefined"
        ? memoryStorage.get(name) ?? null
        : localStorage.getItem(name);
      if (value === null || name !== PREFERENCES_STORAGE_KEY) return value;

      const parsed = JSON.parse(value) as {
        state?: { appearance?: unknown; accent?: unknown };
        version?: unknown;
      };
      const state = parsed.state ?? {};
      const normalized = {
        appearance: isAppearance(state.appearance)
          ? state.appearance
          : DEFAULT_PREFERENCES.appearance,
        accent: isAccent(state.accent)
          ? state.accent
          : DEFAULT_PREFERENCES.accent,
      };

      if (
        state.appearance !== normalized.appearance ||
        state.accent !== normalized.accent
      ) {
        const repaired = JSON.stringify({
          ...parsed,
          state: normalized,
        });
        if (typeof localStorage === "undefined") {
          memoryStorage.set(name, repaired);
        } else {
          localStorage.setItem(name, repaired);
        }
        return repaired;
      }

      return value;
    } catch {
      try {
        if (typeof localStorage === "undefined") {
          memoryStorage.delete(name);
        } else {
          localStorage.removeItem(name);
        }
      } catch (error) {
        reportStorageError("discarding corrupt preferences", error);
      }
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof localStorage === "undefined") {
        memoryStorage.set(name, value);
      } else {
        localStorage.setItem(name, value);
      }
    } catch (error) {
      reportStorageError("writing preferences", error);
    }
  },
  removeItem: (name) => {
    try {
      if (typeof localStorage === "undefined") {
        memoryStorage.delete(name);
      } else {
        localStorage.removeItem(name);
      }
    } catch (error) {
      reportStorageError("removing preferences", error);
    }
  },
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      hydrationStatus: "idle",
      setAppearance: (appearance) => set({ appearance }),
      setAccent: (accent) => set({ accent }),
      reset: () => set(DEFAULT_PREFERENCES),
    }),
    {
      name: PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => preferencesStorage),
      partialize: (state) => ({
        appearance: state.appearance,
        accent: state.accent,
      }),
      merge: (persisted, current) => {
        const value = persisted as Partial<PreferencesState> | null;
        return {
          ...current,
          appearance: isAppearance(value?.appearance)
            ? value.appearance
            : DEFAULT_PREFERENCES.appearance,
          accent: isAccent(value?.accent)
            ? value.accent
            : DEFAULT_PREFERENCES.accent,
        };
      },
      skipHydration: true,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          preferencesStore?.setState({
            ...DEFAULT_PREFERENCES,
            hydrationStatus: "error",
          });
          preferencesStorage.removeItem(PREFERENCES_STORAGE_KEY);
          return;
        }
        preferencesStore?.setState({
          ...(state ?? DEFAULT_PREFERENCES),
          hydrationStatus: "ready",
        });
      },
    },
  ),
);

preferencesStore = usePreferencesStore;
