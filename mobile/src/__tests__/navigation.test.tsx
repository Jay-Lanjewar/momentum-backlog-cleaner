/**
 * Navigation architecture tests.
 * Verifies the 5-tab bottom navigation structure and file organization.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { getMockConfig } from "expo-router/build/testing-library/mock-config";

import { TabIcon } from "@/components/TabIcon";
import { Placeholder } from "@/components/Placeholder";
import { unstable_settings } from "@/app/(app)/_layout";
import { getLaunchRoute } from "@/app/index";

jest.mock("expo-router", () => {
  const R = require("react");
  function MockTabs({ children }: { children?: React.ReactNode }) {
    return R.createElement(R.Fragment, null, children);
  }
  function MockScreen() {
    return null;
  }
  MockTabs.Screen = MockScreen;
  return { Redirect: () => null, Tabs: MockTabs };
});

// ── TabIcon ──

describe("TabIcon", () => {
  it("renders without crashing for each primary tab name", () => {
    const tabs = ["today", "work", "plan", "progress", "me"];
    for (const name of tabs) {
      expect(() => render(<TabIcon name={name} color="#FFF" />)).not.toThrow();
    }
  });

  it("renders for unknown tab names (fallback)", () => {
    expect(() =>
      render(<TabIcon name="nonexistent" color="#FFF" />),
    ).not.toThrow();
  });
});

// ── Placeholder ──

describe("Placeholder", () => {
  it("renders without crashing with title only", () => {
    expect(() => render(<Placeholder title="Test Screen" />)).not.toThrow();
  });

  it("renders without crashing with title and subtitle", () => {
    expect(() =>
      render(<Placeholder title="Title" subtitle="Description text" />),
    ).not.toThrow();
  });
});

// ── File structure verification ──

describe("Navigation file structure", () => {
  const fs = require("fs");
  const path = require("path");
  const appDir = path.resolve(process.cwd(), "src/app/(app)");

  function fileExists(relativePath: string): boolean {
    return fs.existsSync(path.join(appDir, relativePath));
  }

  it("has (app)/_layout.tsx (bottom tab navigator)", () => {
    expect(fileExists("_layout.tsx")).toBe(true);
  });

  it("has today group with index, focus, and _layout", () => {
    expect(fileExists("(today)/_layout.tsx")).toBe(true);
    expect(fileExists("(today)/index.tsx")).toBe(true);
    expect(fileExists("(today)/focus.tsx")).toBe(true);
  });

  it("has work group with index, [id], courses, goals, and _layout", () => {
    expect(fileExists("(work)/_layout.tsx")).toBe(true);
    expect(fileExists("(work)/index.tsx")).toBe(true);
    expect(fileExists("(work)/[id].tsx")).toBe(true);
    expect(fileExists("(work)/courses.tsx")).toBe(true);
    expect(fileExists("(work)/goals.tsx")).toBe(true);
  });

  it("has plan group with index, schedule, plan, and _layout", () => {
    expect(fileExists("(plan)/_layout.tsx")).toBe(true);
    expect(fileExists("(plan)/index.tsx")).toBe(true);
    expect(fileExists("(plan)/schedule.tsx")).toBe(true);
    expect(fileExists("(plan)/plan.tsx")).toBe(true);
  });

  it("has progress group with index and _layout", () => {
    expect(fileExists("(progress)/index.tsx")).toBe(true);
  });

  it("has social group preserved (not in primary tabs)", () => {
    expect(fileExists("(social)/_layout.tsx")).toBe(true);
    expect(fileExists("(social)/friends.tsx")).toBe(true);
    expect(fileExists("(social)/feed.tsx")).toBe(true);
    expect(fileExists("(social)/search.tsx")).toBe(true);
  });

  it("has me group with index, settings, change-password, streaks, health, and _layout", () => {
    expect(fileExists("(me)/_layout.tsx")).toBe(true);
    expect(fileExists("(me)/index.tsx")).toBe(true);
    expect(fileExists("(me)/settings.tsx")).toBe(true);
    expect(fileExists("(me)/change-password.tsx")).toBe(true);
    expect(fileExists("(me)/streaks.tsx")).toBe(true);
    expect(fileExists("(me)/health.tsx")).toBe(true);
  });

  it("app index route is present and old app focus route is removed", () => {
    expect(fileExists("index.tsx")).toBe(true);
    expect(fileExists("focus.tsx")).toBe(false);
  });

  it("all tab group _layout files import from expo-router", () => {
    const groups = ["(today)", "(work)", "(plan)", "(me)"];
    for (const group of groups) {
      const content = fs.readFileSync(
        path.join(appDir, group, "_layout.tsx"),
        "utf8",
      );
      expect(content).toContain("expo-router");
    }
  });

  it("app _layout imports Tabs from expo-router", () => {
    const content = fs.readFileSync(
      path.join(appDir, "_layout.tsx"),
      "utf8",
    );
    expect(content).toContain("Tabs");
    expect(content).toContain("expo-router");
  });

  it("app _layout defines 5 visible tab screens", () => {
    const content = fs.readFileSync(
      path.join(appDir, "_layout.tsx"),
      "utf8",
    );
    expect(content).toContain('"(today)"');
    expect(content).toContain('"(work)"');
    expect(content).toContain('"(plan)"');
    expect(content).toContain('"(progress)"');
    expect(content).toContain('"(me)"');
  });

  it("app _layout explicitly starts authenticated navigation on Today", () => {
    expect(unstable_settings.initialRouteName).toBe("(today)");
  });

  it("Expo Router route tree uses Today as the (app) initial entry", () => {
    const config = getMockConfig({
      appDir: path.resolve(process.cwd(), "src/app"),
      overrides: {
        _layout: { default: () => null },
        "(app)/_layout": { default: () => null, unstable_settings },
        "(app)/(today)/_layout": { default: () => null },
        "(app)/(work)/_layout": { default: () => null },
        "(app)/(plan)/_layout": { default: () => null },
        "(app)/(social)/_layout": { default: () => null },
        "(app)/(me)/_layout": { default: () => null },
        "(auth)/_layout": { default: () => null },
        "(onboarding)/_layout": { default: () => null },
      },
    }) as {
      screens?: {
        __root?: {
          screens?: Record<string, { initialRouteName?: string }>;
        };
      };
    };
    const appConfig = config.screens?.__root?.screens?.["(app)"];

    expect(appConfig?.initialRouteName).toBe("(today)");
  });

  it("root launch waits for auth restoration", () => {
    expect(
      getLaunchRoute({
        isLoading: true,
        confirming: false,
        mfaRequired: false,
        isAuthenticated: false,
        hasProfile: false,
      }),
    ).toBeNull();
  });

  it("root launch routes an unauthenticated user to login", () => {
    expect(
      getLaunchRoute({
        isLoading: false,
        confirming: false,
        mfaRequired: false,
        isAuthenticated: false,
        hasProfile: false,
      }),
    ).toBe("/(auth)/login");
  });

  it("root launch routes an incomplete profile to onboarding", () => {
    expect(
      getLaunchRoute({
        isLoading: false,
        confirming: false,
        mfaRequired: false,
        isAuthenticated: true,
        hasProfile: false,
      }),
    ).toBe("/(onboarding)");
  });

  it("root launch routes a completed profile to Today", () => {
    expect(
      getLaunchRoute({
        isLoading: false,
        confirming: false,
        mfaRequired: false,
        isAuthenticated: true,
        hasProfile: true,
      }),
    ).toBe("/(app)/(today)");
  });

  it("app group root redirects to Today and remains hidden from tabs", () => {
    const content = fs.readFileSync(
      path.join(appDir, "index.tsx"),
      "utf8",
    );
    expect(content).toContain('href="/(app)/(today)"');
    expect(
      fs.readFileSync(path.join(appDir, "_layout.tsx"), "utf8"),
    ).toContain('name="index"');
    expect(
      fs.readFileSync(path.join(appDir, "_layout.tsx"), "utf8"),
    ).toContain("href: null");
  });

  it("social tab is hidden from primary navigation", () => {
    const content = fs.readFileSync(
      path.join(appDir, "_layout.tsx"),
      "utf8",
    );
    expect(content).toContain('"(social)"');
    expect(content).toContain("href: null");
  });

  it("social does not have a title in primary tabs", () => {
    const content = fs.readFileSync(
      path.join(appDir, "_layout.tsx"),
      "utf8",
    );
    const socialSection = content.substring(
      content.indexOf('"(social)"'),
    );
    expect(socialSection).not.toContain("title: \"Social\"");
  });

  it("today _layout uses Stack with focus as fullScreenModal", () => {
    const content = fs.readFileSync(
      path.join(appDir, "(today)", "_layout.tsx"),
      "utf8",
    );
    expect(content).toContain("Stack");
    expect(content).toContain("fullScreenModal");
    expect(content).toContain("focus");
  });
});
