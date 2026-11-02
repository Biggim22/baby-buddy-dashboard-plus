import { it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import SyncAge, { syncAgeLabel } from "./SyncAge";
afterEach(() => vi.useRealTimers());
it("formats seconds, minutes and hours with safe clock skew handling", () => {
  const start = new Date("2026-06-01T10:00:00Z");
  expect(syncAgeLabel(start, +start + 30000)).toBe("30s");
  expect(syncAgeLabel(start, +start + 60000)).toBe("1min");
  expect(syncAgeLabel(start, +start + 3600000)).toBe("1h");
  expect(syncAgeLabel(start, +start - 1000)).toBe("0s");
});
it("ages without refetching and resets only when a new successful timestamp arrives", () => {
  vi.useFakeTimers();
  const start = new Date("2026-06-01T10:00:00Z");
  vi.setSystemTime(start);
  const view = render(<SyncAge lastSync={start} />);
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByText(/· 30s/)).toBeInTheDocument();
  view.rerender(<SyncAge lastSync={start} />);
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByText(/· 1min/)).toBeInTheDocument();
  view.rerender(<SyncAge lastSync={new Date()} />);
  expect(screen.getByText(/· 0s/)).toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("has no misleading age before a first successful sync", () => {
  const { container } = render(<SyncAge lastSync={null} />);
  expect(container).toBeEmptyDOMElement();
});
