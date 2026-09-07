import { renderHook, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useFocusLock } from "./useFocusLock"

function fireVisibilityChange(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    writable: true,
    configurable: true,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

describe("useFocusLock", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Date, "now").mockReturnValue(1_000_000)

    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: vi.fn().mockResolvedValue(undefined),
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("transitions to focusing immediately on mount", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))
    expect(result.current.phase).toBe("focusing")
  })

  it("requests fullscreen on enter", () => {
    renderHook(() => useFocusLock(1_500_000))
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled()
  })

  it("continues without fullscreen when request fails", async () => {
    vi.mocked(document.documentElement.requestFullscreen).mockRejectedValue(new Error("denied"))
    const { result } = renderHook(() => useFocusLock(1_500_000))
    expect(result.current.phase).toBe("focusing")
  })

  it("calculates focused elapsed from timestamps", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))
    expect(result.current.phase).toBe("focusing")

    vi.mocked(Date.now).mockReturnValue(1_030_000)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.focusedElapsedMs).toBe(30_000)
  })

  it("calculates remaining from total duration minus focused elapsed", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_060_000)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.remainingMs).toBe(1_440_000)
  })

  it("pauses on manual pause", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_010_000)
    act(() => {
      result.current.pause()
    })

    expect(result.current.phase).toBe("paused_by_user")
  })

  it("freezes focused time on pause", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_010_000)
    act(() => {
      result.current.pause()
    })

    const elapsedAtPause = result.current.focusedElapsedMs
    expect(elapsedAtPause).toBe(10_000)

    vi.mocked(Date.now).mockReturnValue(1_060_000)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.focusedElapsedMs).toBe(elapsedAtPause)
  })

  it("resumes from paused state", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_010_000)
    act(() => {
      result.current.pause()
    })

    vi.mocked(Date.now).mockReturnValue(1_015_000)
    act(() => {
      result.current.resume()
    })

    expect(result.current.phase).toBe("focusing")

    vi.mocked(Date.now).mockReturnValue(1_025_000)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.focusedElapsedMs).toBe(20_000)
  })

  it("accumulates time across multiple focus/pause cycles", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    // Focus 10s
    vi.mocked(Date.now).mockReturnValue(1_010_000)
    act(() => {
      result.current.pause()
    })
    expect(result.current.focusedElapsedMs).toBe(10_000)

    // Pause 5s
    vi.mocked(Date.now).mockReturnValue(1_015_000)

    // Focus 8s more
    vi.mocked(Date.now).mockReturnValue(1_015_000)
    act(() => {
      result.current.resume()
    })
    vi.mocked(Date.now).mockReturnValue(1_023_000)
    act(() => {
      result.current.pause()
    })

    expect(result.current.focusedElapsedMs).toBe(18_000)
  })

  it("pauses on visibilitychange to hidden", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    act(() => {
      fireVisibilityChange("hidden")
    })

    expect(result.current.phase).toBe("paused_lost_focus")
  })

  it("transitions to focus_returned on visibility return", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    act(() => {
      fireVisibilityChange("hidden")
    })
    expect(result.current.phase).toBe("paused_lost_focus")

    act(() => {
      fireVisibilityChange("visible")
    })
    expect(result.current.phase).toBe("focus_returned")
  })

  it("does not auto-resume after returning", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    act(() => {
      fireVisibilityChange("hidden")
    })
    act(() => {
      fireVisibilityChange("visible")
    })

    expect(result.current.phase).toBe("focus_returned")

    vi.mocked(Date.now).mockReturnValue(1_030_000)
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.phase).toBe("focus_returned")
  })

  it("explicit resume after focus_returned goes to focusing", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    act(() => {
      fireVisibilityChange("hidden")
    })
    act(() => {
      fireVisibilityChange("visible")
    })
    act(() => {
      result.current.resume()
    })

    expect(result.current.phase).toBe("focusing")
  })

  it("does not count hidden time", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_010_000)
    act(() => {
      fireVisibilityChange("hidden")
    })
    const elapsedAtHidden = result.current.focusedElapsedMs
    expect(elapsedAtHidden).toBe(10_000)

    vi.mocked(Date.now).mockReturnValue(1_070_000)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.focusedElapsedMs).toBe(elapsedAtHidden)
  })

  it("handles duplicate blur/visibility events without double-counting", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_010_000)
    act(() => {
      fireVisibilityChange("hidden")
    })
    const afterFirst = result.current.focusedElapsedMs

    act(() => {
      fireVisibilityChange("hidden")
    })
    act(() => {
      window.dispatchEvent(new Event("blur"))
    })

    expect(result.current.phase).toBe("paused_lost_focus")
    expect(result.current.focusedElapsedMs).toBe(afterFirst)
  })

  it("pauses on window blur", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    act(() => {
      window.dispatchEvent(new Event("blur"))
    })

    expect(result.current.phase).toBe("paused_lost_focus")
  })

  it("transitions to focus_returned on window focus after lost focus", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    act(() => {
      window.dispatchEvent(new Event("blur"))
    })
    expect(result.current.phase).toBe("paused_lost_focus")

    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    expect(result.current.phase).toBe("focus_returned")
  })

  it("pauses on fullscreen exit", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: undefined,
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event("fullscreenchange"))
    })

    expect(result.current.phase).toBe("paused_lost_focus")
  })

  it("complete freezes final focused time", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_015_000)
    act(() => {
      result.current.complete()
    })

    const elapsedAtComplete = result.current.focusedElapsedMs
    expect(elapsedAtComplete).toBe(15_000)

    vi.mocked(Date.now).mockReturnValue(1_045_000)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.phase).toBe("complete")
    expect(result.current.focusedElapsedMs).toBe(elapsedAtComplete)
  })

  it("complete after pause captures accumulated time", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_010_000)
    act(() => {
      result.current.pause()
    })

    vi.mocked(Date.now).mockReturnValue(1_015_000)
    act(() => {
      result.current.complete()
    })

    expect(result.current.phase).toBe("complete")
    expect(result.current.focusedElapsedMs).toBe(10_000)
  })

  it("reset returns to focusing (entering is transient)", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    vi.mocked(Date.now).mockReturnValue(1_010_000)
    act(() => {
      result.current.reset()
    })

    // entering transitions to focusing immediately via effect
    expect(result.current.phase).toBe("focusing")
    expect(result.current.focusedElapsedMs).toBe(0)
  })

  it("actual_minutes is based on focused time only", () => {
    const { result } = renderHook(() => useFocusLock(1_500_000))

    // Focus 90 seconds
    vi.mocked(Date.now).mockReturnValue(1_090_000)
    act(() => {
      result.current.pause()
    })

    // Wait 5 minutes hidden
    vi.mocked(Date.now).mockReturnValue(1_390_000)

    const actualMinutes = Math.max(1, Math.ceil(result.current.focusedElapsedMs / 60000))
    expect(actualMinutes).toBe(2)
  })
})
