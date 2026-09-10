/**
 * Regression test: verifies FocusModeScreen's hooks ordering is stable
 * across phase transitions. The bug was that useMemo calls were placed
 * inside a conditional branch (after an early return), causing React
 * to throw "Rendered more hooks than during the previous render."
 *
 * This test verifies:
 * 1. The module imports cleanly (with mocked dependencies)
 * 2. All hooks appear before any conditional return in the function body
 * 3. No hooks exist inside the completion/adaptive result conditional branch
 */

// ── Must mock before importing the component ──
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({
    sessionId: "sess-1",
    backlogItemId: "bl-1",
    startTime: "16:00",
    endTime: "16:30",
    reason: "Work on Maths",
    remainingMinutes: "25",
    sessions: "[]",
    snapshotId: "snap-1",
    dailyMessage: "Keep it up!",
  }),
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock("expo-keep-awake", () => ({
  useKeepAwake: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: any) =>
    require("react").createElement("SafeAreaView", props, children),
}));

jest.mock("../hooks/useFocusLock", () => ({
  useFocusLock: () => ({
    phase: "focusing",
    focusedElapsedMs: 0,
    remainingMs: 25 * 60 * 1000,
    pause: jest.fn(),
    resume: jest.fn(),
    complete: jest.fn(),
  }),
}));

jest.mock("../services/hooks", () => ({
  useCompleteSession: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  RN.BackHandler = {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  return RN;
});

import FocusModeScreen from "../app/(app)/focus";

describe("FocusModeScreen hooks ordering regression", () => {
  it("exports the default component", () => {
    expect(typeof FocusModeScreen).toBe("function");
  });

  it("all useMemo/useCallback/useState/useEffect hooks are before conditional returns", () => {
    const fnSrc = FocusModeScreen.toString();

    // Find the first conditional return (the completion/adaptive branch)
    const firstIfReturn = fnSrc.indexOf('if (phase === "complete" || adaptiveResult)');
    expect(firstIfReturn).toBeGreaterThan(0);

    // Verify all hook calls appear BEFORE the conditional return
    const hookPatterns = [
      /useFocusLock\(/g,
      /useState</g,
      /useKeepAwake\(/g,
      /useEffect\(/g,
      /useCallback\(/g,
      /useMemo\(/g,
    ];

    for (const pattern of hookPatterns) {
      const matches = [...fnSrc.matchAll(pattern)];
      for (const match of matches) {
        expect(match.index).toBeLessThan(firstIfReturn);
      }
    }
  });

  it("no useMemo calls exist after the conditional return", () => {
    const fnSrc = FocusModeScreen.toString();

    const firstIfReturn = fnSrc.indexOf('if (phase === "complete" || adaptiveResult)');
    expect(firstIfReturn).toBeGreaterThan(0);

    // Everything after the conditional should have zero useMemo calls
    const afterConditional = fnSrc.substring(firstIfReturn);
    const useMemoAfter = [...afterConditional.matchAll(/useMemo\(/g)].length;
    expect(useMemoAfter).toBe(0);
  });

  it("hook names appear in the function body before the conditional", () => {
    const fnSrc = FocusModeScreen.toString();

    // These hook variable names confirm our useMemo/useState/... calls exist
    // in the source and are before the conditional return
    const firstIfReturn = fnSrc.indexOf('if (phase === "complete" || adaptiveResult)');

    // Confirm the function contains our key hooks by their variable assignments
    const hooksBefore = fnSrc.substring(0, firstIfReturn);
    expect(hooksBefore).toContain("changedSessionIds");
    expect(hooksBefore).toContain("overflowIds");
    expect(hooksBefore).toContain("minStart");
    expect(hooksBefore).toContain("useFocusLock");
    expect(hooksBefore).toContain("useKeepAwake");
    expect(hooksBefore).toContain("adaptiveResult");
  });
});
