import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { createTauriHarness } from "./tauriHarness";

const harness = createTauriHarness();

declare global {
  // eslint-disable-next-line no-var
  var __TAURI_HARNESS__: ReturnType<typeof createTauriHarness> | undefined;
}

globalThis.__TAURI_HARNESS__ = harness;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: Parameters<ReturnType<typeof createTauriHarness>["invoke"]>) =>
    globalThis.__TAURI_HARNESS__!.invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: Parameters<ReturnType<typeof createTauriHarness>["listen"]>) =>
    globalThis.__TAURI_HARNESS__!.listen(...args),
}));

beforeEach(() => {
  globalThis.__TAURI_HARNESS__!.reset();
  document.documentElement.setAttribute("data-theme", "dark");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
}

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = ((handle: number) => window.clearTimeout(handle)) as typeof window.cancelAnimationFrame;
}
