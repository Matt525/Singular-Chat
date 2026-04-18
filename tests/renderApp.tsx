import { cleanup, render } from "@testing-library/react";
import { vi } from "vitest";

export async function renderApp() {
  cleanup();
  vi.resetModules();
  const { default: App } = await import("../src/App");
  return render(<App />);
}

