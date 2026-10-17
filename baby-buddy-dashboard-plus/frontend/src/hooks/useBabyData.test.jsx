import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useBabyData } from "./useBabyData";
import { api } from "../api";

vi.mock("../api", () => {
  const empty = () => Promise.resolve({ results: [] });
  const api = new Proxy({}, {
    get: (target, key) => {
      if (!(key in target)) target[key] = vi.fn(empty);
      return target[key];
    },
  });
  return { api };
});

let visibility = "visible";

beforeEach(() => {
  vi.clearAllMocks();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  api.getConfig.mockResolvedValue({ refresh_interval: 30 });
  api.getChildren.mockResolvedValue({ results: [{ id: 1, first_name: "Test" }] });
});

afterEach(() => {
  delete document.visibilityState;
});

describe("useBabyData sync", () => {
  it("refreshes when the page becomes visible again", async () => {
    const { result } = renderHook(() => useBabyData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getChildren).toHaveBeenCalledTimes(1);

    visibility = "hidden";
    await new Promise((resolve) => setTimeout(resolve, 5100));
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(api.getChildren).toHaveBeenCalledTimes(1);

    visibility = "visible";
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(api.getChildren).toHaveBeenCalledTimes(2));
  }, 10000);

  it("retries a failed sync once before showing a connection error", async () => {
    api.getChildren.mockRejectedValueOnce(new Error("Request timed out"));
    const { result } = renderHook(() => useBabyData());
    await waitFor(() => expect(api.getChildren).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.child?.first_name).toBe("Test");
  }, 10000);

  it("waits out a short 401 while Home Assistant renews its session", async () => {
    const unauthorized = Object.assign(new Error("API error 401: Unauthorized"), { status: 401 });
    api.getChildren.mockRejectedValueOnce(unauthorized).mockRejectedValueOnce(unauthorized);
    const { result } = renderHook(() => useBabyData());
    await waitFor(() => expect(api.getChildren).toHaveBeenCalledTimes(3), { timeout: 12000 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  }, 20000);
});
