import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = TestResizeObserver;
document.elementFromPoint = () => document.body;

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});
