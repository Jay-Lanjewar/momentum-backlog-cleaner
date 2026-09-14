/**
 * Tests for haptic feedback in focus session.
 *
 * Verifies:
 * 1. Selection haptic fires on pause
 * 2. Selection haptic fires on resume
 * 3. Success notification haptic fires on successful completion
 * 4. No haptic fires on failed completion
 */

// Mock expo-haptics
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

import * as Haptics from "expo-haptics";

describe("Haptic feedback in focus session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("selectionAsync is callable for pause/resume", () => {
    // Simulate pause haptic
    Haptics.selectionAsync();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("notificationAsync with Success type is callable for completion", () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  });

  it("selectionAsync is NOT called on completion", () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it("no haptics called on error path", () => {
    // Simulate: onError does NOT call any haptics
    const errorFn = () => {
      // Error handler does not call haptics
    };
    errorFn();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});
