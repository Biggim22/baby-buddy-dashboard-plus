import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTimers } from "./useTimers";
import { api } from "../api";
import { resetOutbox, sendOrQueue } from "../utils/outbox";

vi.mock("../api", () => ({ api: { createTimer: vi.fn(), updateTimer: vi.fn(), deleteTimer: vi.fn() } }));

const NO_TIMERS = [];

function offline() {
  const err = new Error("Failed to fetch");
  err.connection = true;
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetOutbox();
  // The real API routes writes through the outbox; mimic that with a dead connection.
  api.createTimer.mockImplementation((data) =>
    sendOrQueue(() => Promise.reject(offline()), "timers/", { method: "POST", body: JSON.stringify(data) })
  );
});

describe("useTimers without a connection", () => {
  it("keeps a timer started offline across server refreshes", async () => {
    const { result, rerender } = renderHook(({ timers }) => useTimers(timers, 1), {
      initialProps: { timers: NO_TIMERS },
    });
    await act(() => result.current.startTimer("sleep"));
    expect(result.current.activeTimers).toHaveLength(1);
    expect(result.current.activeTimers[0]).toMatchObject({ name: "sleep", pending: true });

    rerender({ timers: [{ id: 3, name: "feeding", start: "2026-11-01T08:00:00Z" }] });
    await waitFor(() => expect(result.current.activeTimers.map((t) => t.name)).toEqual(["feeding", "sleep"]));
  });

  it("discards an offline timer without calling Baby Buddy", async () => {
    const { result } = renderHook(() => useTimers(NO_TIMERS, 1));
    await act(() => result.current.startTimer("tummy"));
    const id = result.current.activeTimers[0].id;
    await act(() => result.current.discardTimer(id));
    expect(api.deleteTimer).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.activeTimers).toHaveLength(0));
  });
});
