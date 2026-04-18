import type { TauriHarness } from "./tauriHarness";

declare global {
  // eslint-disable-next-line no-var
  var __TAURI_HARNESS__: TauriHarness | undefined;
}

export function getHarness() {
  const harness = globalThis.__TAURI_HARNESS__;
  if (!harness) {
    throw new Error("Tauri test harness has not been initialized.");
  }
  return harness;
}

