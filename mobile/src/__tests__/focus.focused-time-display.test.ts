/**
 * Tests for focused-time display in pause states.
 *
 * Verifies that formatCountdown produces correct MM:SS output
 * for various focused elapsed times, used in pause/away banners.
 */

// Replicate the formatCountdown logic from focus.tsx for unit testing
function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

describe("formatCountdown for focused-time display", () => {
  it("formats 0ms as 00:00", () => {
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("formats 30 seconds as 00:30", () => {
    expect(formatCountdown(30_000)).toBe("00:30");
  });

  it("formats 1 minute as 01:00", () => {
    expect(formatCountdown(60_000)).toBe("01:00");
  });

  it("formats 5 minutes 30 seconds as 05:30", () => {
    expect(formatCountdown(5 * 60_000 + 30_000)).toBe("05:30");
  });

  it("formats 25 minutes as 25:00", () => {
    expect(formatCountdown(25 * 60_000)).toBe("25:00");
  });

  it("rounds up partial seconds", () => {
    expect(formatCountdown(61_500)).toBe("01:02");
  });

  it("handles large values (2 hours)", () => {
    expect(formatCountdown(120 * 60_000)).toBe("120:00");
  });

  it("negative values clamp to 00:00", () => {
    expect(formatCountdown(-5000)).toBe("00:00");
  });
});
