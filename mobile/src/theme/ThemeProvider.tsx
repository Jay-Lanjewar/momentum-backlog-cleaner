import { Platform, useColorScheme } from "react-native";
import {
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import * as SystemUI from "expo-system-ui";
import * as SplashScreen from "expo-splash-screen";
import { NavigationBar } from "expo-navigation-bar";

import { usePreferencesStore } from "@/store/usePreferencesStore";
import { performanceMark } from "@/lib/performance";
import { getThemeColors, type ThemeColors } from "./tokens";

export interface ThemeValue {
  appearance: ReturnType<typeof usePreferencesStore.getState>["appearance"];
  accent: ReturnType<typeof usePreferencesStore.getState>["accent"];
  mode: "light" | "dark";
  colors: ThemeColors;
  hydrated: boolean;
}

export function ThemeProvider({
  children,
  fallback,
}: PropsWithChildren<{ fallback?: ReactNode }>) {
  const appearance = usePreferencesStore((state) => state.appearance);
  const accent = usePreferencesStore((state) => state.accent);
  const systemScheme = useColorScheme();
  const hydrationStatus = usePreferencesStore((state) => state.hydrationStatus);
  const hydrationStarted = useRef(false);

  useEffect(() => {
    if (hydrationStarted.current || hydrationStatus !== "idle") return;
    hydrationStarted.current = true;
    void Promise.resolve(usePreferencesStore.persist.rehydrate()).catch(() => {
      usePreferencesStore.setState({
        appearance: "dark",
        accent: "blue",
        hydrationStatus: "error",
      });
    });
  }, [hydrationStatus]);

  const mode =
    appearance === "system"
      ? systemScheme === "light"
        ? "light"
        : "dark"
      : appearance;
  const colors = useMemo(() => getThemeColors(mode, accent), [mode, accent]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setStyle(mode === "dark" ? "light" : "dark");
    }
  }, [mode]);

  useEffect(() => {
    if (hydrationStatus !== "ready" && hydrationStatus !== "error") return;
    performanceMark("startup.theme_hydrated");
    performanceMark("startup.splash_hide.requested");
    void Promise.resolve(SplashScreen.hideAsync()).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[startup] hiding native splash failed: ${message}`);
    });
  }, [hydrationStatus]);

  return hydrationStatus === "ready" || hydrationStatus === "error"
    ? children
    : fallback ?? children;
}

export function useTheme(): ThemeValue {
  const appearance = usePreferencesStore((state) => state.appearance);
  const accent = usePreferencesStore((state) => state.accent);
  const systemScheme = useColorScheme();
  const hydrationStatus = usePreferencesStore((state) => state.hydrationStatus);
  const mode =
    appearance === "system"
      ? systemScheme === "light"
        ? "light"
        : "dark"
      : appearance;

  return {
    appearance,
    accent,
    mode,
    colors: useMemo(() => getThemeColors(mode, accent), [mode, accent]),
    hydrated: hydrationStatus === "ready" || hydrationStatus === "error",
  };
}
