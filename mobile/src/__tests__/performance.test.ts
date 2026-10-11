describe("performance diagnostics", () => {
  const originalDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  const originalDebug = console.debug;

  beforeEach(() => {
    jest.resetModules();
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    console.debug = jest.fn();
  });

  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = originalDev;
    console.debug = originalDebug;
  });

  it("logs guarded marks and elapsed measures without exposing payloads", () => {
    const { performanceMark, performanceMeasure } = require("@/lib/performance");

    performanceMark("startup.auth_me.request.begin");
    performanceMeasure(
      "startup.auth_me.request.finish",
      "startup.auth_me.request.begin",
    );

    expect(console.debug).toHaveBeenNthCalledWith(
      1,
      "[PERF] startup.auth_me.request.begin",
    );
    expect(console.debug).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /^\[PERF\] startup\.auth_me\.request\.finish \d+ ms$/,
      ),
    );
  });

  it("does not log outside development", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    const { performanceMark, performanceMeasure } = require("@/lib/performance");

    performanceMark("startup.auth_restore.begin");
    performanceMeasure(
      "startup.auth_restore.finish",
      "startup.auth_restore.begin",
    );

    expect(console.debug).not.toHaveBeenCalled();
  });
});
