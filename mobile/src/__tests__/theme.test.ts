import {
  ACCENT_OPTIONS,
  getThemeColors,
} from "@/theme/tokens";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  preferencesStorage,
  usePreferencesStore,
} from "@/store/usePreferencesStore";

function relativeLuminance(hex: string) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("theme customization", () => {
  beforeEach(() => {
    usePreferencesStore.persist.clearStorage();
    usePreferencesStore.setState(DEFAULT_PREFERENCES);
  });

  it("uses the dark blue defaults", () => {
    expect(usePreferencesStore.getState()).toMatchObject(DEFAULT_PREFERENCES);
  });

  it("provides all five accent palettes", () => {
    expect(ACCENT_OPTIONS).toEqual([
      "blue",
      "violet",
      "emerald",
      "rose",
      "amber",
    ]);

    for (const accent of ACCENT_OPTIONS) {
      expect(getThemeColors("dark", accent).accent).toMatch(/^#/);
      expect(getThemeColors("light", accent).accent).toMatch(/^#/);
    }
  });

  it.each(["light", "dark"] as const)(
    "keeps every accent role readable in %s mode",
    (mode) => {
      for (const accent of ACCENT_OPTIONS) {
        const colors = getThemeColors(mode, accent);
        const surface = mode === "light" ? colors.background : colors.card;

        expect(contrastRatio(colors.accentForeground, colors.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.accentText, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.accentSoftForeground, colors.accentSoft)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(
    (["system", "light", "dark"] as const).flatMap((appearance) =>
      ACCENT_OPTIONS.map((accent) => [appearance, accent] as const),
    ),
  )("resolves the %s/%s appearance-accent combination", (appearance, accent) => {
    const resolvedModes = appearance === "system" ? (["light", "dark"] as const) : [appearance];

    for (const mode of resolvedModes) {
      const colors = getThemeColors(mode, accent);
      expect(colors.accent).toMatch(/^#[0-9A-F]{6}$/i);
      expect(colors.primaryText).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("resolves distinct light and dark semantic surfaces", () => {
    const light = getThemeColors("light", "blue");
    const dark = getThemeColors("dark", "blue");

    expect(light.background).not.toBe(dark.background);
    expect(light.primaryText).not.toBe(dark.primaryText);
    expect(light.accent).toBe(dark.accent);
  });

  it("persists only appearance and accent", async () => {
    usePreferencesStore.getState().setAppearance("light");
    usePreferencesStore.getState().setAccent("rose");

    await new Promise((resolve) => setTimeout(resolve, 0));
    const persisted = JSON.parse(
      (await preferencesStorage.getItem(PREFERENCES_STORAGE_KEY)) ?? "{}",
    );

    expect(persisted.state).toEqual({
      appearance: "light",
      accent: "rose",
    });
    expect(persisted.state.setAppearance).toBeUndefined();
  });

  it("falls back to defaults for invalid persisted values", async () => {
    await preferencesStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        state: { appearance: "neon", accent: "custom" },
        version: 0,
      }),
    );
    await usePreferencesStore.persist.rehydrate();

    expect(usePreferencesStore.getState()).toMatchObject(DEFAULT_PREFERENCES);
  });

  it("discards malformed JSON and retains defaults", async () => {
    await preferencesStorage.setItem(PREFERENCES_STORAGE_KEY, "{not-json");
    await usePreferencesStore.persist.rehydrate();

    expect(usePreferencesStore.getState()).toMatchObject(DEFAULT_PREFERENCES);
    expect(await preferencesStorage.getItem(PREFERENCES_STORAGE_KEY)).toBe(
      JSON.stringify({
        state: DEFAULT_PREFERENCES,
        version: 0,
      }),
    );
  });
});
