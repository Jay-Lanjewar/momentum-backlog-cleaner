/**
 * Navigation architecture tests.
 * Verifies the 5-tab bottom navigation structure and file organization.
 */

import React from "react";
import { render } from "@testing-library/react-native";

import { TabIcon } from "@/components/TabIcon";
import { Placeholder } from "@/components/Placeholder";

// ── TabIcon ──

describe("TabIcon", () => {
  it("renders without crashing for each tab name", () => {
    const tabs = ["today", "work", "plan", "social", "me"];
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

  it("has social group with index, friends, feed, search, and _layout", () => {
    expect(fileExists("(social)/_layout.tsx")).toBe(true);
    expect(fileExists("(social)/index.tsx")).toBe(true);
    expect(fileExists("(social)/friends.tsx")).toBe(true);
    expect(fileExists("(social)/feed.tsx")).toBe(true);
    expect(fileExists("(social)/search.tsx")).toBe(true);
  });

  it("has me group with index, settings, streaks, health, and _layout", () => {
    expect(fileExists("(me)/_layout.tsx")).toBe(true);
    expect(fileExists("(me)/index.tsx")).toBe(true);
    expect(fileExists("(me)/settings.tsx")).toBe(true);
    expect(fileExists("(me)/streaks.tsx")).toBe(true);
    expect(fileExists("(me)/health.tsx")).toBe(true);
  });

  it("old (app)/index.tsx and (app)/focus.tsx are removed", () => {
    expect(fileExists("index.tsx")).toBe(false);
    expect(fileExists("focus.tsx")).toBe(false);
  });

  it("all tab group _layout files import from expo-router", () => {
    const groups = ["(today)", "(work)", "(plan)", "(social)", "(me)"];
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

  it("app _layout defines all 5 tab screens", () => {
    const content = fs.readFileSync(
      path.join(appDir, "_layout.tsx"),
      "utf8",
    );
    expect(content).toContain('"(today)"');
    expect(content).toContain('"(work)"');
    expect(content).toContain('"(plan)"');
    expect(content).toContain('"(social)"');
    expect(content).toContain('"(me)"');
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
