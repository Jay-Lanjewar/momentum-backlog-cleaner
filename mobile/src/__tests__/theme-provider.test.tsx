import React from "react";
import * as ReactNative from "react-native";
import { Text } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createJSONStorage } from "zustand/middleware";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  preferencesStorage,
  usePreferencesStore,
} from "@/store/usePreferencesStore";
import { useAuthStore } from "@/store/useAuthStore";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

const mockUseColorScheme = jest.spyOn(ReactNative, "useColorScheme");

jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockHideSplash = jest.fn().mockResolvedValue(undefined);
jest.mock("expo-splash-screen", () => ({
  hideAsync: (...args: unknown[]) => mockHideSplash(...args),
}));

const mockSetNavigationBarStyle = jest.fn();
jest.mock("expo-navigation-bar", () => ({
  NavigationBar: {
    setStyle: (...args: unknown[]) => mockSetNavigationBarStyle(...args),
  },
}));

function ThemeProbe() {
  const { mode, accent, hydrated } = useTheme();
  return (
    <Text>
      {mode}:{accent}:{hydrated ? "hydrated" : "pending"}
    </Text>
  );
}

function delayedStorage(value: string | null, delay = 20) {
  return createJSONStorage<unknown>(() => ({
    getItem: jest.fn(
      () =>
        new Promise<string | null>((resolve) => {
          setTimeout(() => {
            resolve(value);
          }, delay);
        }),
    ),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  }))!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseColorScheme.mockReturnValue("dark");
  usePreferencesStore.persist.setOptions({
    storage: createJSONStorage(() => preferencesStorage)!,
  });
  preferencesStorage.removeItem(PREFERENCES_STORAGE_KEY);
  usePreferencesStore.setState({
    ...DEFAULT_PREFERENCES,
    hydrationStatus: "idle",
  });
});

afterEach(() => {
  usePreferencesStore.persist.setOptions({
    storage: createJSONStorage(() => preferencesStorage)!,
  });
  usePreferencesStore.setState({
    ...DEFAULT_PREFERENCES,
    hydrationStatus: "idle",
  });
});

describe("ThemeProvider hydration", () => {
  it("renders a fallback while delayed hydration is pending", async () => {
    usePreferencesStore.persist.setOptions({
      storage: delayedStorage(
        JSON.stringify({
          state: { appearance: "light", accent: "rose" },
          version: 0,
        }),
      ),
    });

    await render(
      <ThemeProvider fallback={<Text>loading-theme</Text>}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByText("loading-theme")).toBeTruthy();
    expect(mockHideSplash).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("light:rose:hydrated")).toBeTruthy();
    });
    expect(mockHideSplash).toHaveBeenCalled();
  });

  it("falls back to Dark + Blue after a rejected storage read", async () => {
    usePreferencesStore.persist.setOptions({
      storage: createJSONStorage<unknown>(() => ({
        getItem: jest.fn(() => Promise.reject(new Error("read failed"))),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      }))!,
    });

    await render(
      <ThemeProvider fallback={<Text>loading-theme</Text>}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("dark:blue:hydrated")).toBeTruthy();
    });
    expect(usePreferencesStore.getState().hydrationStatus).toBe("error");
    expect(mockHideSplash).toHaveBeenCalled();
  });

  it("uses restored preferences after store recreation", async () => {
    usePreferencesStore.setState({
      ...DEFAULT_PREFERENCES,
      hydrationStatus: "idle",
    });
    await preferencesStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        state: { appearance: "light", accent: "emerald" },
        version: 0,
      }),
    );
    expect(await preferencesStorage.getItem(PREFERENCES_STORAGE_KEY)).toContain(
      '"appearance":"light"',
    );


    await render(
      <ThemeProvider fallback={<Text>loading-theme</Text>}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("light:emerald:hydrated")).toBeTruthy();
    });
  });

  it("does not throw when preference writes fail", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(() => {
          throw new Error("write failed");
        }),
        removeItem: jest.fn(),
      },
    });

    expect(() => {
      usePreferencesStore.getState().setAccent("violet");
    }).not.toThrow();
    expect(usePreferencesStore.getState().accent).toBe("violet");
    expect(warn).toHaveBeenCalledWith(
      "[preferences] writing preferences failed: write failed",
    );
    delete (globalThis as { localStorage?: unknown }).localStorage;
    warn.mockRestore();
  });
});

describe("ThemeProvider appearance resolution", () => {
  it("updates native navigation bar button style for the resolved mode", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      ReactNative.Platform,
      "OS",
    );
    Object.defineProperty(ReactNative.Platform, "OS", {
      configurable: true,
      value: "android",
    });
    usePreferencesStore.setState({
      appearance: "light",
      accent: "blue",
      hydrationStatus: "ready",
    });

    const view = await render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(mockSetNavigationBarStyle).toHaveBeenCalledWith("dark");
      expect(mockHideSplash).toHaveBeenCalled();
    });

    await act(async () => {
      usePreferencesStore.getState().setAppearance("dark");
    });
    await view.rerender(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(mockSetNavigationBarStyle).toHaveBeenCalledWith("light");
    if (platformDescriptor) {
      Object.defineProperty(ReactNative.Platform, "OS", platformDescriptor);
    }
  });

  it("follows system appearance changes after mounting", async () => {
    usePreferencesStore.setState({
      appearance: "system",
      accent: "blue",
      hydrationStatus: "ready",
    });
    const view = await render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("dark:blue:hydrated")).toBeTruthy();
    });
    mockUseColorScheme.mockReturnValue("light");
    await view.rerender(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("light:blue:hydrated")).toBeTruthy();
  });

  it("keeps explicit Light and Dark independent of the OS scheme", async () => {
    mockUseColorScheme.mockReturnValue("light");
    usePreferencesStore.setState({
      appearance: "dark",
      accent: "blue",
      hydrationStatus: "ready",
    });
    const view = await render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("dark:blue:hydrated")).toBeTruthy();

    await act(async () => {
      usePreferencesStore.getState().setAppearance("light");
    });
    await view.rerender(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText("light:blue:hydrated")).toBeTruthy();
  });
});

describe("preference lifecycle", () => {
  it("keeps preferences when authentication state is cleared", async () => {
    usePreferencesStore.getState().setAppearance("light");
    usePreferencesStore.getState().setAccent("rose");
    useAuthStore.getState().clearAuth();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(usePreferencesStore.getState()).toMatchObject({
      appearance: "light",
      accent: "rose",
    });
  });
});
