import "@testing-library/jest-dom/vitest";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Keep AnimatePresence (mode="wait") transitions synchronous in jsdom so
// step navigation and mount/unmount are deterministic in tests.
MotionGlobalConfig.skipAnimations = true;

// vitest runs without globals here, so @testing-library/react cannot
// auto-register its cleanup hook; unmount between tests explicitly.
afterEach(() => cleanup());

// jsdom does not implement matchMedia; framer-motion and other UI code
// guard on it, so a minimal polyfill keeps them quiet in tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
