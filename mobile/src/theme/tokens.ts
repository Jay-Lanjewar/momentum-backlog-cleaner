export type Appearance = "system" | "light" | "dark";
export type AccentName = "blue" | "violet" | "emerald" | "rose" | "amber";

export const APPEARANCE_OPTIONS: readonly Appearance[] = [
  "system",
  "light",
  "dark",
];

export const ACCENT_OPTIONS: readonly AccentName[] = [
  "blue",
  "violet",
  "emerald",
  "rose",
  "amber",
];

export const ACCENT_LABELS: Record<AccentName, string> = {
  blue: "Blue",
  violet: "Violet",
  emerald: "Emerald",
  rose: "Rose",
  amber: "Amber",
};

export interface ThemeColors {
  background: string;
  surface: string;
  elevatedSurface: string;
  card: string;
  dialog: string;
  inputBackground: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  placeholder: string;
  border: string;
  divider: string;
  accent: string;
  accentForeground: string;
  accentText: string;
  accentSoftForeground: string;
  accentSoft: string;
  accentPressed: string;
  selected: string;
  pressed: string;
  tabBar: string;
  tabBarBorder: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

interface AccentPalette {
  accent: string;
  accentForeground: string;
  accentTextLight: string;
  accentTextDark: string;
  accentSoftLight: string;
  accentSoftDark: string;
  accentPressed: string;
}

const accents: Record<AccentName, AccentPalette> = {
  blue: {
    accent: "#2563EB",
    accentForeground: "#FFFFFF",
    accentTextLight: "#1D4ED8",
    accentTextDark: "#60A5FA",
    accentSoftLight: "#EFF6FF",
    accentSoftDark: "#172554",
    accentPressed: "#1D4ED8",
  },
  violet: {
    accent: "#7C3AED",
    accentForeground: "#FFFFFF",
    accentTextLight: "#6D28D9",
    accentTextDark: "#A78BFA",
    accentSoftLight: "#F5F3FF",
    accentSoftDark: "#2E1065",
    accentPressed: "#6D28D9",
  },
  emerald: {
    accent: "#059669",
    accentForeground: "#001B0D",
    accentTextLight: "#047857",
    accentTextDark: "#34D399",
    accentSoftLight: "#ECFDF5",
    accentSoftDark: "#022C22",
    accentPressed: "#047857",
  },
  rose: {
    accent: "#E11D48",
    accentForeground: "#FFFFFF",
    accentTextLight: "#BE123C",
    accentTextDark: "#FDA4AF",
    accentSoftLight: "#FFF1F2",
    accentSoftDark: "#4C0519",
    accentPressed: "#BE123C",
  },
  amber: {
    accent: "#D97706",
    accentForeground: "#451A03",
    accentTextLight: "#B45309",
    accentTextDark: "#FBBF24",
    accentSoftLight: "#FFFBEB",
    accentSoftDark: "#451A03",
    accentPressed: "#B45309",
  },
};

export function getThemeColors(
  mode: "light" | "dark",
  accentName: AccentName,
): ThemeColors {
  const accent = accents[accentName];
  const dark = mode === "dark";

  return {
    background: dark ? "#0F172A" : "#F8FAFC",
    surface: dark ? "#1E293B" : "#FFFFFF",
    elevatedSurface: dark ? "#263449" : "#FFFFFF",
    card: dark ? "#1E293B" : "#FFFFFF",
    dialog: dark ? "#263449" : "#FFFFFF",
    inputBackground: dark ? "#172033" : "#FFFFFF",
    primaryText: dark ? "#F8FAFC" : "#0F172A",
    secondaryText: dark ? "#CBD5E1" : "#334155",
    mutedText: dark ? "#94A3B8" : "#64748B",
    placeholder: dark ? "#64748B" : "#94A3B8",
    border: dark ? "#334155" : "#E2E8F0",
    divider: dark ? "#27364A" : "#E2E8F0",
    accent: accent.accent,
    accentForeground: accent.accentForeground,
    accentText: dark ? accent.accentTextDark : accent.accentTextLight,
    accentSoftForeground: dark ? accent.accentTextDark : accent.accentTextLight,
    accentSoft: dark ? accent.accentSoftDark : accent.accentSoftLight,
    accentPressed: accent.accentPressed,
    selected: dark ? "#243B63" : accent.accentSoftLight,
    pressed: dark ? "#263449" : "#F1F5F9",
    tabBar: dark ? "#1E293B" : "#FFFFFF",
    tabBarBorder: dark ? "#334155" : "#E2E8F0",
    success: dark ? "#34D399" : "#047857",
    warning: dark ? "#FBBF24" : "#B45309",
    error: dark ? "#FB7185" : "#B91C1C",
    info: dark ? "#60A5FA" : "#1D4ED8",
  };
}

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === "string" && APPEARANCE_OPTIONS.includes(value as Appearance);
}

export function isAccent(value: unknown): value is AccentName {
  return typeof value === "string" && ACCENT_OPTIONS.includes(value as AccentName);
}
