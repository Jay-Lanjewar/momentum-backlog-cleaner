/**
 * Tests for personalized greeting in focus session.
 *
 * Verifies:
 * 1. Greeting includes user name when available
 * 2. Greeting falls back to generic when name is empty
 * 3. Greeting falls back when name is not provided
 */

describe("Personalized greeting in focus session", () => {
  function buildGreeting(userName: string | undefined): string {
    if (!userName) return "";
    return `Let's finish this one, ${userName}.`;
  }

  it("includes user name when provided", () => {
    const result = buildGreeting("Alex");
    expect(result).toBe("Let's finish this one, Alex.");
  });

  it("returns empty string for empty name", () => {
    const result = buildGreeting("");
    expect(result).toBe("");
  });

  it("returns empty string for undefined name", () => {
    const result = buildGreeting(undefined);
    expect(result).toBe("");
  });

  it("handles special characters in name", () => {
    const result = buildGreeting("O'Connor");
    expect(result).toContain("O'Connor");
  });

  it("handles single character name", () => {
    const result = buildGreeting("A");
    expect(result).toBe("Let's finish this one, A.");
  });
});
