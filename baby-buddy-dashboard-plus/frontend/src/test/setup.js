import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { setLanguage } from "../locales";

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Locale selection is persisted by the application. Each test must start from
// the same language so a component test that switches locale cannot influence
// a later, unrelated assertion.
beforeEach(() => setLanguage("en"));
