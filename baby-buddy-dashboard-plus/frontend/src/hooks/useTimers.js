import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { api } from "../api";
import { logError } from "../utils/errorLog";
import {
  dropLocalTimer,
  getOutbox,
  isLocalTimerId,
  pendingLocalTimers,
  pendingTimerDeletes,
  rememberTimerStart,
  resolveTimerId,
  subscribeOutbox,
  updateLocalTimerStart,
} from "../utils/outbox";

// Server timers plus timers started while the connection was down (still in the outbox),
// minus timers whose discard or save is still waiting to be sent.
function mergeTimers(serverTimers, childId) {
  const deleted = pendingTimerDeletes();
  const server = (serverTimers || [])
    .filter((t) => !deleted.has(t.id))
    .map((t) => ({ id: t.id, name: t.name || "timer", start: new Date(t.start) }));
  const local = pendingLocalTimers()
    .filter((t) => !childId || t.child == null || t.child === childId)
    .map((t) => ({ id: t.id, name: t.name, start: new Date(t.start), pending: true }));
  return [...server, ...local];
}

export function useTimers(serverTimers, childId) {
  const [activeTimers, setActiveTimers] = useState([]);
  const [elapsedMap, setElapsedMap] = useState({});
  const tickRef = useRef(null);
  const outbox = useSyncExternalStore(subscribeOutbox, getOutbox);
  // Timers stopped for saving stay hidden until the next server data arrives, even when
  // the outbox changes in between.
  const stoppedRef = useRef(new Set());
  const lastServerTimersRef = useRef(serverTimers);

  // Sync with server timers on data load and whenever the outbox changes
  useEffect(() => {
    if (lastServerTimersRef.current !== serverTimers) {
      lastServerTimersRef.current = serverTimers;
      stoppedRef.current.clear();
    }
    const merged = mergeTimers(serverTimers, childId).filter((t) => !stoppedRef.current.has(t.id));
    merged.forEach((t) => rememberTimerStart(t.id, t.start));
    setActiveTimers(merged);
  }, [serverTimers, childId, outbox]);

  // Tick elapsed time for all active timers
  useEffect(() => {
    if (activeTimers.length === 0) {
      setElapsedMap({});
      clearInterval(tickRef.current);
      return;
    }
    const tick = () => {
      const now = Date.now();
      const map = {};
      for (const t of activeTimers) {
        map[t.id] = Math.floor((now - t.start.getTime()) / 1000);
      }
      setElapsedMap(map);
    };
    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => clearInterval(tickRef.current);
  }, [activeTimers]);

  const startTimer = useCallback(
    async (name) => {
      if (!childId) return;
      // Falls back to a local timer (sent later) when the connection is down.
      let res;
      try {
        res = await api.createTimer({ child: childId, name });
      } catch (err) {
        logError("Start Timer", err.message);
        return;
      }
      rememberTimerStart(res.id, res.start);
      setActiveTimers((prev) =>
        prev.some((t) => t.id === res.id)
          ? prev
          : [...prev, { id: res.id, name: res.name || name, start: new Date(res.start), pending: !!res.queued }]
      );
    },
    [childId]
  );

  const stopTimer = useCallback(async (timerId) => {
    const timer = activeTimers.find((t) => t.id === timerId);
    if (!timer) return null;
    stoppedRef.current.add(timerId);
    setActiveTimers((prev) => prev.filter((t) => t.id !== timerId));
    return { ...timer };
  }, [activeTimers]);

  const editTimer = useCallback(async (timerId, newStart) => {
    if (isLocalTimerId(resolveTimerId(timerId))) {
      updateLocalTimerStart(timerId, newStart);
    } else {
      await api.updateTimer(resolveTimerId(timerId), { start: newStart });
    }
    rememberTimerStart(timerId, newStart);
    setActiveTimers((prev) =>
      prev.map((t) => (t.id === timerId ? { ...t, start: new Date(newStart) } : t))
    );
  }, []);

  const discardTimer = useCallback(async (timerId) => {
    const timer = activeTimers.find((t) => t.id === timerId);
    if (!timer) return;
    if (isLocalTimerId(resolveTimerId(timerId))) {
      dropLocalTimer(timerId);
    } else {
      await api.deleteTimer(resolveTimerId(timerId));
    }
    setActiveTimers((prev) => prev.filter((t) => t.id !== timerId));
  }, [activeTimers]);

  return { activeTimers, elapsedMap, startTimer, stopTimer, editTimer, discardTimer };
}
