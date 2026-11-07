import React from "react";
import * as ReactNative from "react-native";
import { StyleSheet } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import { BacklogForm } from "@/components/BacklogForm";
import {
  ACCENT_OPTIONS,
  getThemeColors,
  type AccentName,
} from "@/theme/tokens";
import {
  DEFAULT_PREFERENCES,
  usePreferencesStore,
} from "@/store/usePreferencesStore";

let mockCreateCoursePending = false;

const mockUseColorScheme = jest.spyOn(ReactNative, "useColorScheme");

jest.mock("@/services/hooks", () => ({
  useCourses: () => ({
    data: [{ id: "course-1", name: "Physics", color: "#2563EB" }],
    isLoading: false,
  }),
  useCreateCourse: () => ({
    isPending: mockCreateCoursePending,
    mutateAsync: jest.fn(),
  }),
}));

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
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

async function setPreferences(
  appearance: "light" | "dark" | "system",
  accent: AccentName,
) {
  await act(async () => {
    usePreferencesStore.setState({
      ...DEFAULT_PREFERENCES,
      appearance,
      accent,
      hydrationStatus: "ready",
    });
  });
}

async function openCourseCreation() {
  const view = await render(
    <BacklogForm saving={false} submitLabel="Save task" onSubmit={jest.fn()} />,
  );
  await fireEvent.press(view.getByText("Select a subject"));
  await fireEvent.press(view.getByText("+ Add Subject"));
  await fireEvent.changeText(view.getByPlaceholderText("Subject name"), "Chemistry");
  return view;
}

describe("BacklogForm theme accessibility", () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue("dark");
  });

  afterEach(async () => {
    mockCreateCoursePending = false;
    await act(async () => {
      usePreferencesStore.setState({
        ...DEFAULT_PREFERENCES,
        hydrationStatus: "idle",
      });
    });
  });

  it.each(["light", "dark"] as const)(
    "renders the create-course button with every %s accent foreground",
    async (mode) => {
      for (const accent of ACCENT_OPTIONS) {
        await setPreferences(mode, accent);
        const view = await openCourseCreation();
        const button = view.getByText("Create").parent;
        const style = StyleSheet.flatten(button?.props.style);
        const colors = getThemeColors(mode, accent);

        expect(style).toEqual(
          expect.objectContaining({ backgroundColor: colors.accent }),
        );
        expect(
          StyleSheet.flatten(view.getByText("Create").props.style),
        ).toEqual(expect.objectContaining({ color: colors.accentForeground }));
        expect(contrastRatio(colors.accentForeground, colors.accent)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each([
    ["light", "light"],
    ["dark", "dark"],
  ] as const)(
    "resolves System mode to the mocked %s OS appearance",
    async (_label, systemMode) => {
      mockUseColorScheme.mockReturnValue(systemMode);
      for (const accent of ACCENT_OPTIONS) {
        await setPreferences("system", accent);
        const view = await openCourseCreation();
        const colors = getThemeColors(systemMode, accent);
        const style = StyleSheet.flatten(view.getByText("Create").parent?.props.style);

        expect(style).toEqual(
          expect.objectContaining({ backgroundColor: colors.accent }),
        );
        expect(
          StyleSheet.flatten(view.getByText("Create").props.style),
        ).toEqual(expect.objectContaining({ color: colors.accentForeground }));
      }
    },
  );

  it.each(["light", "dark"] as const)(
    "uses the accent foreground for the main submit spinner in %s mode",
    async (mode) => {
      for (const accent of ACCENT_OPTIONS) {
        await setPreferences(mode, accent);
        const view = await render(
          <BacklogForm saving submitLabel="Saving" onSubmit={jest.fn()} />,
        );
        const spinner = view.getByTestId("backlog-submit-spinner");
        const colors = getThemeColors(mode, accent);

        expect(spinner.props.color).toBe(colors.accentForeground);
        expect(contrastRatio(spinner.props.color, colors.accent)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("preserves create-course loading, disabled, and pressed behavior", async () => {
    await setPreferences("light", "blue");
    const emptyView = await render(
      <BacklogForm saving={false} submitLabel="Save task" onSubmit={jest.fn()} />,
    );
    await fireEvent.press(emptyView.getByText("Select a subject"));
    await fireEvent.press(emptyView.getByText("+ Add Subject"));
    const emptyCreateButton = emptyView.getByText("Create").parent;

    expect(StyleSheet.flatten(emptyCreateButton?.props.style)).toEqual(
      expect.objectContaining({ opacity: 0.5 }),
    );

    mockCreateCoursePending = true;
    const pendingView = await openCourseCreation();
    expect(pendingView.getByTestId("backlog-create-course-spinner").props.color).toBe(
      getThemeColors("light", "blue").accentForeground,
    );
    expect(StyleSheet.flatten(pendingView.getByTestId("backlog-create-course-spinner").parent?.props.style)).toEqual(
      expect.objectContaining({ opacity: 0.5 }),
    );
  });

  it.each(["light", "dark"] as const)(
    "keeps all difficulty controls readable in %s mode",
    async (mode) => {
      await setPreferences(mode, "blue");
      const view = await render(
        <BacklogForm saving={false} submitLabel="Save task" onSubmit={jest.fn()} />,
      );

      for (const difficulty of ["easy", "medium", "hard"] as const) {
        await fireEvent.press(view.getByTestId(`backlog-difficulty-${difficulty}`));
        const button = view.getByTestId(`backlog-difficulty-${difficulty}`);
        const buttonStyle = StyleSheet.flatten(button.props.style);
        const label = view.getByText(
          difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
        );
        const labelStyle = StyleSheet.flatten(label.props.style);

        expect(buttonStyle.backgroundColor).toMatch(/^#/);
        expect(labelStyle.color).toMatch(/^#/);
        expect(contrastRatio(labelStyle.color, buttonStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      }

      await fireEvent.press(view.getByTestId("backlog-difficulty-easy"));
      const mediumLabel = view.getByText("Medium");
      const mediumButton = view.getByTestId("backlog-difficulty-medium");
      const mediumLabelStyle = StyleSheet.flatten(mediumLabel.props.style);
      const mediumButtonStyle = StyleSheet.flatten(mediumButton.props.style);
      expect(contrastRatio(mediumLabelStyle.color, mediumButtonStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
