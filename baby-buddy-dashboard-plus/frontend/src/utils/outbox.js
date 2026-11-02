import { logError } from "./errorLog";

// Baby Buddy writes that failed because the connection dropped (mobile network, Home
// Assistant renewing the ingress session, an add-on restart) wait here and are sent again
// on the next sync, so a started timer or a saved entry is not lost. The queue lives only
// in this browser's localStorage.
const STORAGE_KEY = "bbdp_outbox_v1";
const CONNECTION_STATUSES = new Set([401, 408, 429, 502, 503, 504]);
const LOCAL_TIMER_PREFIX = "local-";
const CLOCK_MARGIN_MS = 5000;

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let queue = load();
const listeners = new Set();
// Start times of the timers currently shown, so a timer-based entry that has to wait in
// the queue can be stored with its real start and end instead of a timer reference.
const timerStarts = new Map();
// Offline timers that have been sent meanwhile: local id -> Baby Buddy id.
const sentLocalTimers = new Map();
let flushing = null;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage unavailable or full: the queue still works in memory for this session.
  }
  listeners.forEach((listener) => listener());
}

function newId(prefix = "") {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isConnectionError(err) {
  if (!err) return false;
  if (err.connection) return true;
  return CONNECTION_STATUSES.has(err.status);
}

export function isLocalTimerId(id) {
  return typeof id === "string" && id.startsWith(LOCAL_TIMER_PREFIX);
}

// The Baby Buddy id of a timer, also for an offline timer that has been sent meanwhile.
export function resolveTimerId(id) {
  return sentLocalTimers.get(id) ?? id;
}

export function getOutbox() {
  return queue;
}

export function subscribeOutbox(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rememberTimerStart(id, start) {
  if (id == null || !start) return;
  timerStarts.set(String(id), new Date(start).toISOString());
}

function enqueue(entry) {
  queue = [...queue, { id: newId("q-"), createdAt: new Date().toISOString(), ...entry }];
  persist();
}

function timerCreateEntry(timerId) {
  return queue.find((entry) => entry.localTimerId === timerId);
}

// Timers started while offline: shown like server timers until they are sent.
export function pendingLocalTimers() {
  return queue
    .filter((entry) => entry.localTimerId)
    .map((entry) => ({
      id: entry.localTimerId,
      name: entry.body?.name || "timer",
      start: entry.body?.start,
      child: entry.body?.child,
    }));
}

// Server timers whose discard or completion is still waiting in the queue.
export function pendingTimerDeletes() {
  return new Set(
    queue
      .filter((entry) => entry.method === "DELETE" && /^timers\/\d+\/$/.test(entry.endpoint))
      .map((entry) => Number(entry.endpoint.split("/")[1]))
  );
}

export function updateLocalTimerStart(timerId, start) {
  const entry = timerCreateEntry(timerId);
  if (!entry) return;
  queue = queue.map((item) => (item === entry ? { ...item, body: { ...item.body, start } } : item));
  persist();
}

export function dropLocalTimer(timerId) {
  const before = queue.length;
  queue = queue.filter((entry) => entry.localTimerId !== timerId);
  if (queue.length !== before) persist();
}

// A timer-based entry needs a timer that exists on the server. When the timer only exists
// here, or the entry has to wait in the queue, it is saved with the timer's start and the
// moment it was saved instead.
function withoutTimer(body, timerId, savedAt) {
  const start = isLocalTimerId(timerId)
    ? timerCreateEntry(timerId)?.body?.start
    : timerStarts.get(String(timerId));
  if (!start) return null;
  const { timer: _timer, ...rest } = body;
  return { ...rest, start, end: savedAt };
}

function isQueueable(method, endpoint) {
  return method !== "GET" && !endpoint.startsWith("bmi/");
}

// Sends one Baby Buddy write through `send`, falling back to the queue when the connection
// is the problem. Errors Baby Buddy itself reports (validation, missing record) still reach
// the caller unchanged.
export async function sendOrQueue(send, endpoint, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  if (!isQueueable(method, endpoint)) return send(endpoint, options);

  // A few seconds early on purpose: Baby Buddy rejects times "in the future", and a phone
  // clock running even half a second ahead of the server would trip that check.
  const savedAt = new Date(Date.now() - CLOCK_MARGIN_MS).toISOString();
  let body = options.body ? JSON.parse(options.body) : undefined;
  let finishTimerId = null;

  if (body?.timer != null && sentLocalTimers.has(body.timer)) {
    body = { ...body, timer: sentLocalTimers.get(body.timer) };
  }
  if (body?.timer != null && isLocalTimerId(body.timer)) {
    const converted = withoutTimer(body, body.timer, savedAt);
    if (converted) {
      dropLocalTimer(body.timer);
      body = converted;
    }
  }

  const isTimerCreate = method === "POST" && endpoint === "timers/";
  // Online, Baby Buddy sets the timer start itself; only a queued timer needs its own.
  try {
    return await send(endpoint, { ...options, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    if (!isConnectionError(err)) throw err;

    if (isTimerCreate) {
      if (!body.start) body = { ...body, start: savedAt };
      const localTimerId = newId(LOCAL_TIMER_PREFIX);
      enqueue({ method, endpoint, body, localTimerId });
      return { id: localTimerId, name: body.name, start: body.start, child: body.child, queued: true };
    }

    if (body?.timer != null) {
      const converted = withoutTimer(body, body.timer, savedAt);
      if (converted) {
        finishTimerId = body.timer;
        body = converted;
      }
    }
    enqueue({ method, endpoint, body });
    if (finishTimerId != null) enqueue({ method: "DELETE", endpoint: `timers/${finishTimerId}/` });
    return { queued: true };
  }
}

// Sends queued writes in order. Stops at the first connection problem and keeps the rest;
// a write Baby Buddy rejects is moved to the error log so it is never dropped silently.
export function flushOutbox(send) {
  if (flushing) return flushing;
  if (queue.length === 0) return Promise.resolve({ sent: 0, remaining: 0 });
  flushing = (async () => {
    let sent = 0;
    try {
      for (const entry of [...queue]) {
        try {
          const result = await send(entry.endpoint, {
            method: entry.method,
            body: entry.body ? JSON.stringify(entry.body) : undefined,
          });
          if (entry.localTimerId && result?.id != null) {
            sentLocalTimers.set(entry.localTimerId, result.id);
            rememberTimerStart(result.id, result.start || entry.body?.start);
          }
          sent += 1;
        } catch (err) {
          if (isConnectionError(err)) break;
          // Already gone on the server (e.g. a discard that did arrive the first time).
          if (!(entry.method === "DELETE" && err.status === 404)) {
            logError(
              "Queued write rejected",
              `${entry.method} ${entry.endpoint} ${entry.body ? JSON.stringify(entry.body) : ""} - ${err.message}`
            );
          }
        }
        queue = queue.filter((item) => item.id !== entry.id);
        persist();
      }
    } finally {
      flushing = null;
    }
    return { sent, remaining: queue.length };
  })();
  return flushing;
}

// Test helper.
export function resetOutbox() {
  queue = [];
  timerStarts.clear();
  sentLocalTimers.clear();
  flushing = null;
  persist();
}
