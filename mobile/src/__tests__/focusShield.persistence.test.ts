import { clearProgress, loadProgress, saveProgress } from "@/focusShield/persistence";
import { EMPTY_PROGRESS, updateMastery } from "@/focusShield/adaptive";
import { useFocusShieldStore } from "@/store/useFocusShieldStore";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("local offline mastery recovery", () => {
  const original = globalThis.localStorage;
  beforeEach(() => Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage() }));
  beforeEach(() => useFocusShieldStore.setState({ userId: null, progress: EMPTY_PROGRESS, storageError: false }));
  afterAll(() => Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original }));

  it("saves by authenticated user and restores after a new app session", () => {
    const progress = {
      ...EMPTY_PROGRESS,
      skills: { "fraction-addition": updateMastery(null, true, false) },
      recentQuestionIds: ["frac-01"],
    };
    expect(saveProgress("student-a", progress)).toBe(true);
    expect(loadProgress("student-a")).toEqual(progress);
    expect(loadProgress("student-b")).toEqual(EMPTY_PROGRESS);
  });

  it("recovers from corrupt persisted data without crashing", () => {
    globalThis.localStorage.setItem("momentum.focus-shield.v2.student", "not-json");
    expect(loadProgress("student")).toEqual(EMPTY_PROGRESS);
  });

  it("supports clearing a single student's local record", () => {
    saveProgress("student-a", EMPTY_PROGRESS);
    saveProgress("student-b", EMPTY_PROGRESS);
    clearProgress("student-a");
    expect(globalThis.localStorage.getItem("momentum.focus-shield.v2.student-a")).toBeNull();
    expect(loadProgress("student-b")).toEqual(EMPTY_PROGRESS);
  });

  it("rejects a prior schema version and malformed mastery records", () => {
    globalThis.localStorage.setItem("momentum.focus-shield.v2.student", JSON.stringify({ version: 1, skills: {}, recentQuestionIds: [] }));
    expect(loadProgress("student")).toEqual(EMPTY_PROGRESS);
    globalThis.localStorage.setItem("momentum.focus-shield.v2.student", JSON.stringify({ version: 2, skills: { algebra: { attempts: "many" } }, recentQuestionIds: [] }));
    expect(loadProgress("student")).toEqual(EMPTY_PROGRESS);
  });

  it("isolates account switching and restores each account after returning", () => {
    const store = useFocusShieldStore.getState();
    store.hydrate("student-a");
    store.recordAnswer("student-a", "mathematics", "math-fractions", "fraction-addition", "frac-02", true, false);
    useFocusShieldStore.getState().hydrate("student-b");
    expect(useFocusShieldStore.getState().progress.skills["mathematics.math-fractions.fraction-addition"]).toBeUndefined();
    useFocusShieldStore.getState().recordAnswer("student-b", "english", "english-parts", "parts-of-speech", "part-01", false, false);
    useFocusShieldStore.getState().hydrate("student-a");
    expect(useFocusShieldStore.getState().progress.skills["mathematics.math-fractions.fraction-addition"].mastery).toBe(100);
    expect(loadProgress("student-b").skills["english.english-parts.parts-of-speech"].mastery).toBe(0);
  });
});
