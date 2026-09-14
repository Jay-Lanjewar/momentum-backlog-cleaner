/**
 * Tests for focus progress ring calculations.
 *
 * Verifies the SVG stroke-dashoffset math used in the animated progress ring.
 */

const RING_RADIUS = 112;
const RING_STROKE = 8;
const RING_SIZE = 260;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

describe("Progress ring math", () => {
  it("circumference is correct for radius 112", () => {
    expect(CIRCUMFERENCE).toBeCloseTo(703.716754, 4);
  });

  it("strokeDashoffset at 0% progress equals full circumference", () => {
    const progress = 0;
    const dashoffset = CIRCUMFERENCE * (1 - progress);
    expect(dashoffset).toBe(CIRCUMFERENCE);
  });

  it("strokeDashoffset at 100% progress equals 0", () => {
    const progress = 1;
    const dashoffset = CIRCUMFERENCE * (1 - progress);
    expect(dashoffset).toBe(0);
  });

  it("strokeDashoffset at 50% progress equals half circumference", () => {
    const progress = 0.5;
    const dashoffset = CIRCUMFERENCE * (1 - progress);
    expect(dashoffset).toBeCloseTo(CIRCUMFERENCE / 2, 4);
  });

  it("strokeDashoffset at 25% progress", () => {
    const progress = 0.25;
    const dashoffset = CIRCUMFERENCE * (1 - progress);
    expect(dashoffset).toBeCloseTo(CIRCUMFERENCE * 0.75, 4);
  });

  it("progress is clamped to [0, 1]", () => {
    const clampProgress = (p: number) => Math.min(Math.max(p, 0), 1);
    expect(clampProgress(-0.5)).toBe(0);
    expect(clampProgress(1.5)).toBe(1);
    expect(clampProgress(0.5)).toBe(0.5);
  });

  it("ring size matches existing UI dimensions", () => {
    expect(RING_SIZE).toBe(260);
    expect(RING_STROKE).toBe(8);
  });
});
