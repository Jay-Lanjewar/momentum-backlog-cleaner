import {
  parseBacklogInput,
  getTotalTopics,
  isValidEmail,
  passwordStrength,
  COURSE_COLORS,
} from "../lib/onboarding";

// ── parseBacklogInput ──

describe("parseBacklogInput", () => {
  it("returns empty array for empty string", () => {
    expect(parseBacklogInput("")).toEqual([]);
    expect(parseBacklogInput("   ")).toEqual([]);
  });

  it("parses blank-line-separated groups", () => {
    const input = "Physics\nMotion\nGravitation\n\nMaths\nTriangles\nCircles";
    const result = parseBacklogInput(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ subject: "Physics", items: ["Motion", "Gravitation"] });
    expect(result[1]).toEqual({ subject: "Maths", items: ["Triangles", "Circles"] });
  });

  it("parses dash-separated groups", () => {
    const input = "Physics - Motion\nPhysics - Gravitation\nMaths - Triangles";
    const result = parseBacklogInput(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ subject: "Physics", items: ["Motion", "Gravitation"] });
    expect(result[1]).toEqual({ subject: "Maths", items: ["Triangles"] });
  });

  it("falls back to single General group", () => {
    const input = "Study chapter 3\nReview flashcards";
    const result = parseBacklogInput(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      subject: "General",
      items: ["Study chapter 3", "Review flashcards"],
    });
  });

  it("trims whitespace from lines in catch-all fallback", () => {
    const input = "  Physics  \n  Motion  ";
    const result = parseBacklogInput(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      subject: "General",
      items: ["Physics", "Motion"],
    });
  });

  it("handles single group with trailing blank line (falls to catch-all)", () => {
    const input = "Physics\nMotion\n";
    const result = parseBacklogInput(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ subject: "General", items: ["Physics", "Motion"] });
  });
});

// ── getTotalTopics ──

describe("getTotalTopics", () => {
  it("counts items across all groups", () => {
    const groups = [
      { subject: "Physics", items: ["Motion", "Gravitation"] },
      { subject: "Maths", items: ["Triangles"] },
    ];
    expect(getTotalTopics(groups)).toBe(3);
  });

  it("returns 0 for empty array", () => {
    expect(getTotalTopics([])).toBe(0);
  });
});

// ── isValidEmail ──

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
    expect(isValidEmail("a.b@c.co")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("noat")).toBe(false);
    expect(isValidEmail("no@domain")).toBe(false);
  });
});

// ── passwordStrength ──

describe("passwordStrength", () => {
  it("returns Weak for very short passwords", () => {
    expect(passwordStrength("abc").label).toBe("Weak");
  });

  it("returns Fair for 8 chars with one uppercase", () => {
    expect(passwordStrength("Abcdefgh").label).toBe("Fair");
  });

  it("returns Good for uppercase + digits", () => {
    expect(passwordStrength("Abcdefg1").label).toBe("Good");
  });

  it("returns Strong for uppercase + digits + special", () => {
    expect(passwordStrength("Abcdefg1!").label).toBe("Strong");
  });
});

// ── COURSE_COLORS ──

describe("COURSE_COLORS", () => {
  it("has 14 colors", () => {
    expect(COURSE_COLORS).toHaveLength(14);
  });

  it("all are valid hex", () => {
    for (const color of COURSE_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
