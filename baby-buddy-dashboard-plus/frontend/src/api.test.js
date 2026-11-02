import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "./api";
import { resetOutbox } from "./utils/outbox";

/** api.js always calls the global fetch - stub it so every test in this file
 * runs with zero real network calls (per project constraint: mocked tests only). */
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe("api request building", () => {
  it("remembers queued feeding choices only after the server confirms replay", async () => {
    resetOutbox();
    fetch.mockResolvedValueOnce(jsonResponse({}, { status: 503 }));
    const result = await api.createFeeding({ child: 3, type: "formula", method: "bottle" });
    expect(result.queued).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(jsonResponse({ id: 9 })).mockResolvedValueOnce(jsonResponse({}));
    await api.flushPendingWrites();
    expect(fetch.mock.calls[2][0]).toBe("./api/local/settings/3");
    resetOutbox();
  });
  it("remembers only confirmed new feeding choices, without copying other fields", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ id: 7 })).mockResolvedValueOnce(jsonResponse({}));
    await api.createFeeding({ child: 2, type: "formula", method: "bottle", amount: 120, notes: "not a preference" });
    expect(fetch.mock.calls[1][0]).toBe("./api/local/settings/2");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ last_feeding_type: "formula", last_feeding_method: "bottle" });
    fetch.mockClear(); fetch.mockResolvedValueOnce(jsonResponse({ id: 7 }));
    await api.updateFeeding(7, { type: "breast milk", method: "left breast" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not fail or replay a saved feeding when remembering defaults fails", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ id: 7 })).mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    await expect(api.createFeeding({ child: 2, type: "formula", method: "bottle" })).resolves.toEqual({ id: 7 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("loads every sleep page through the local proxy and preserves overlap filters", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ results: [{ id: 1 }], next: "https://upstream.invalid/api/sleep/?offset=1" }));
    fetch.mockResolvedValueOnce(jsonResponse({ results: [{ id: 2 }], next: null }));
    const response = await api.getSleep({ child: 1, end_min: "2026-11-01T00:00:00Z" });
    expect(response.results.map(x => x.id)).toEqual([1, 2]);
    expect(fetch.mock.calls[1][0]).toContain("./api/baby-buddy/sleep/?");
    expect(fetch.mock.calls[1][0]).toContain("offset=1");
    expect(fetch.mock.calls[1][0]).toContain("end_min=");
  });
  it("rejects a stuck sleep page instead of reporting truncated data as complete", async () => {
    fetch.mockResolvedValue(jsonResponse({ results: [{ id: 1 }], next: "next" }));
    await expect(api.getSleep()).rejects.toThrow("no progress");
  });
  it("GETs against the local proxy path, not a direct Baby Buddy URL", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
    await api.getChildren();
    expect(fetch).toHaveBeenCalledWith("./api/baby-buddy/children/", expect.any(Object));
  });

  it("serializes query params, dropping null/empty values", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
    await api.getMedication({ child: 1, limit: 30, ordering: null, extra: "" });
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("./api/baby-buddy/medication/?child=1&limit=30");
  });

  it("sends POST bodies as JSON with the right method", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await api.createNote({ note: "hi" });
    const [url, config] = fetch.mock.calls[0];
    expect(url).toBe("./api/baby-buddy/notes/");
    expect(config.method).toBe("POST");
    expect(config.body).toBe(JSON.stringify({ note: "hi" }));
  });

  it("sends DELETE requests to the entry's own URL", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204 });
    await api.deleteTemperature(42);
    const [url, config] = fetch.mock.calls[0];
    expect(url).toBe("./api/baby-buddy/temperature/42/");
    expect(config.method).toBe("DELETE");
  });

  it("returns null for a 204 No Content response", async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204 });
    await expect(api.deleteNote(1)).resolves.toBeNull();
  });

  it("throws with the status code on a non-ok response", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ detail: "not found" }, { status: 404 }));
    await expect(api.getWeight()).rejects.toThrow(/API error 404/);
  });
});

describe("clock skew diagnostic on API errors", () => {
  // Regression coverage for a real report: "Date/time can not be in the future" on a
  // payload that was already computed correctly (see toApiDatetime). The backend forwards
  // Baby Buddy's own Date response header as X-Baby-Buddy-Date (not as `Date` - uvicorn
  // always emits its own `Date`, so reusing that name would produce two headers merged into
  // one unparseable string by the browser). Comparing it against the device's clock at the
  // same instant tells us whether a "future" rejection is a genuine clock skew.
  it("appends a device-vs-server clock comparison when the backend forwarded Baby Buddy's Date header", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(
        { time: ["Date/time can not be in the future."] },
        { status: 400, headers: { "X-Baby-Buddy-Date": "Mon, 01 Jan 2024 00:00:00 GMT" } }
      )
    );
    await expect(api.getWeight()).rejects.toThrow(
      /clockCheck: device=.+ server=2024-01-01T00:00:00\.000Z deviceAheadByMs=\d+/
    );
  });

  it("does not append anything when the header is absent (e.g. a network-layer error with no upstream response)", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ detail: "bad request" }, { status: 400 }));
    await expect(api.getWeight()).rejects.not.toThrow(/clockCheck/);
  });
});

describe("request timeout", () => {
  // A request that just never settles (dead wifi, a backgrounded mobile tab, a proxy that
  // drops the response) must not hang forever - especially getConfig(), whose promise
  // chain gates the whole app's initial loading spinner.
  function hangingFetchRespectingAbort() {
    return vi.fn((url, options) => {
      return new Promise((resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts a hung API request after the timeout and rejects instead of hanging forever", async () => {
    vi.stubGlobal("fetch", hangingFetchRespectingAbort());
    const promise = api.getChildren();
    const assertion = expect(promise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it("aborts a hung getConfig() request after the timeout and rejects instead of hanging forever", async () => {
    vi.stubGlobal("fetch", hangingFetchRespectingAbort());
    const promise = api.getConfig();
    const assertion = expect(promise).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it("passes an abort signal to fetch so a real browser request actually cancels", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getChildren();
    const [, config] = fetchMock.mock.calls[0];
    expect(config.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not time out a request that resolves well within the deadline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ results: [] })));
    await expect(api.getChildren()).resolves.toEqual({ results: [] });
  });
});
