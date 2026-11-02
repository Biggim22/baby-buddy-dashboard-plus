import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  flushOutbox,
  getOutbox,
  isLocalTimerId,
  pendingLocalTimers,
  pendingTimerDeletes,
  rememberTimerStart,
  resetOutbox,
  resolveTimerId,
  sendOrQueue,
} from "./outbox";
import { clearErrorLog, getErrorLog } from "./errorLog";

function offline() {
  const err = new Error("Failed to fetch");
  err.connection = true;
  return err;
}

function httpError(status) {
  const err = new Error(`API error ${status}`);
  err.status = status;
  return err;
}

const body = (data) => ({ method: "POST", body: JSON.stringify(data) });

beforeEach(() => {
  resetOutbox();
  clearErrorLog();
  localStorage.clear();
});

describe("sendOrQueue", () => {
  it("passes successful writes and reads straight through", async () => {
    const send = vi.fn().mockResolvedValue({ id: 5 });
    await expect(sendOrQueue(send, "feedings/", body({ child: 1 }))).resolves.toEqual({ id: 5 });
    await sendOrQueue(send, "feedings/", {});
    expect(getOutbox()).toHaveLength(0);
  });

  it("queues a write when the connection fails and keeps Baby Buddy errors visible", async () => {
    const send = vi.fn().mockRejectedValueOnce(offline()).mockRejectedValueOnce(httpError(400));
    await expect(sendOrQueue(send, "changes/", body({ child: 1, wet: true }))).resolves.toEqual({ queued: true });
    await expect(sendOrQueue(send, "changes/", body({ child: 1 }))).rejects.toThrow("API error 400");
    expect(getOutbox()).toHaveLength(1);
    expect(getOutbox()[0]).toMatchObject({ method: "POST", endpoint: "changes/", body: { child: 1, wet: true } });
  });

  it("treats a Home Assistant 401 as a connection problem", async () => {
    const send = vi.fn().mockRejectedValue(httpError(401));
    await sendOrQueue(send, "sleep/1/", { method: "DELETE" });
    expect(getOutbox()[0]).toMatchObject({ method: "DELETE", endpoint: "sleep/1/" });
  });

  it("starts a local timer when the timer cannot be created", async () => {
    const send = vi.fn().mockRejectedValue(offline());
    const res = await sendOrQueue(send, "timers/", body({ child: 1, name: "sleep" }));
    expect(isLocalTimerId(res.id)).toBe(true);
    expect(res.start).toBeTruthy();
    expect(pendingLocalTimers()).toEqual([{ id: res.id, name: "sleep", start: res.start, child: 1 }]);
  });

  it("saves an entry for a local timer with its start and end and drops the timer", async () => {
    const send = vi.fn().mockRejectedValueOnce(offline());
    const timer = await sendOrQueue(send, "timers/", body({ child: 1, name: "feeding" }));

    send.mockResolvedValueOnce({ id: 9 });
    await sendOrQueue(send, "feedings/", body({ child: 1, timer: timer.id, type: "breast milk" }));
    const sent = JSON.parse(send.mock.calls[1][1].body);
    expect(sent.timer).toBeUndefined();
    expect(sent.start).toBe(timer.start);
    expect(sent.end).toBeTruthy();
    expect(getOutbox()).toHaveLength(0);
  });

  it("queues an entry for a server timer with start and end plus the timer removal", async () => {
    rememberTimerStart(7, "2026-11-01T08:00:00.000Z");
    const send = vi.fn().mockRejectedValue(offline());
    await sendOrQueue(send, "sleep/", body({ child: 1, timer: 7 }));
    const [entry, removal] = getOutbox();
    expect(entry.body.timer).toBeUndefined();
    expect(entry.body.start).toBe("2026-11-01T08:00:00.000Z");
    expect(entry.body.end).toBeTruthy();
    expect(removal).toMatchObject({ method: "DELETE", endpoint: "timers/7/" });
    expect(pendingTimerDeletes().has(7)).toBe(true);
  });

  it("never queues BMI writes, which are recalculated on every sync", async () => {
    const send = vi.fn().mockRejectedValue(offline());
    await expect(sendOrQueue(send, "bmi/", body({ child: 1 }))).rejects.toThrow();
    expect(getOutbox()).toHaveLength(0);
  });
});

describe("flushOutbox", () => {
  it("sends queued writes in order and stops at the next connection problem", async () => {
    const failing = vi.fn().mockRejectedValue(offline());
    await sendOrQueue(failing, "changes/", body({ n: 1 }));
    await sendOrQueue(failing, "changes/", body({ n: 2 }));
    await sendOrQueue(failing, "changes/", body({ n: 3 }));

    const send = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(offline());
    await expect(flushOutbox(send)).resolves.toEqual({ sent: 1, remaining: 2 });
    expect(getOutbox().map((e) => e.body.n)).toEqual([2, 3]);
  });

  it("logs and drops writes Baby Buddy rejects, but ignores already deleted records", async () => {
    const failing = vi.fn().mockRejectedValue(offline());
    await sendOrQueue(failing, "changes/", body({ n: 1 }));
    await sendOrQueue(failing, "timers/3/", { method: "DELETE" });

    const send = vi.fn().mockRejectedValueOnce(httpError(400)).mockRejectedValueOnce(httpError(404));
    await expect(flushOutbox(send)).resolves.toEqual({ sent: 0, remaining: 0 });
    expect(getErrorLog()).toHaveLength(1);
    expect(getErrorLog()[0].action).toBe("Queued write rejected");
  });

  it("maps an offline timer to its Baby Buddy id once it has been sent", async () => {
    const timer = await sendOrQueue(vi.fn().mockRejectedValue(offline()), "timers/", body({ child: 1, name: "sleep" }));
    await flushOutbox(vi.fn().mockResolvedValue({ id: 42, start: timer.start }));
    expect(resolveTimerId(timer.id)).toBe(42);

    const send = vi.fn().mockResolvedValue({});
    await sendOrQueue(send, "sleep/", body({ child: 1, timer: timer.id }));
    expect(JSON.parse(send.mock.calls[0][1].body).timer).toBe(42);
  });
});
