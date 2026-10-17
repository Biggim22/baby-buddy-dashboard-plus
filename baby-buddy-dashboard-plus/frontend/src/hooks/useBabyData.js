import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import { getMockData } from "../utils/mockData";
import { syncBmisForMeasurements } from "../utils/bmiSync";

function toLocalISODate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fixChildPicture(c) {
  if (c?.picture) {
    try {
      const url = new URL(c.picture);
      c.picture = `./api/media${url.pathname}`;
    } catch {
      // leave as-is if not a valid URL
    }
  }
  return c;
}

const RETRY_DELAY_MS = 2000;
// Visibility, focus and pageshow often fire together when the app is resumed.
const AUTO_REFRESH_MIN_GAP_MS = 5000;

export function useBabyData() {
  const [children, setChildren] = useState([]);
  const [child, setChild] = useState(null);
  const [feedings, setFeedings] = useState([]);
  const [weeklyFeedings, setWeeklyFeedings] = useState([]);
  const [sleepEntries, setSleepEntries] = useState([]);
  const [weeklySleep, setWeeklySleep] = useState([]);
  const [changes, setChanges] = useState([]);
  const [tummyTimes, setTummyTimes] = useState([]);
  const [weeklyTummyTimes, setWeeklyTummyTimes] = useState([]);
  const [temperatures, setTemperatures] = useState([]);
  const [weights, setWeights] = useState([]);
  const [heights, setHeights] = useState([]);
  const [headCircumferences, setHeadCircumferences] = useState([]);
  const [bmis, setBmis] = useState([]);
  const [medications, setMedications] = useState([]);
  const [monthlyFeedings, setMonthlyFeedings] = useState([]);
  const [monthlySleep, setMonthlySleep] = useState([]);
  const [monthlyChanges, setMonthlyChanges] = useState([]);
  const [weeklyPumping, setWeeklyPumping] = useState([]);
  const [notes, setNotes] = useState([]);
  const [timers, setTimers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [unitSystem, setUnitSystem] = useState("metric");
  const [childSex, setChildSex] = useState("");
  const [theme, setTheme] = useState(null);
  const intervalRef = useRef(null);
  const childIdRef = useRef(null);
  const demoRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const lastSyncAttemptRef = useRef(0);

  const fetchData = useCallback(async (childId, { throwOnError = false } = {}) => {
    try {
      const now = new Date();

      const todayStr = toLocalISODate(now);
      const todayMin = `${todayStr}T00:00:00`;
      const todayMax = `${todayStr}T23:59:59`;

      const twentyFourAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sleepMin = `${toLocalISODate(twentyFourAgo)}T${String(twentyFourAgo.getHours()).padStart(2, "0")}:${String(twentyFourAgo.getMinutes()).padStart(2, "0")}:00`;

      const weekAgo = new Date(now);
      // Eight calendar days ensure the oldest displayed rolling 24-hour window
      // is complete even when the current time is late in the day.
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekMin = `${toLocalISODate(weekAgo)}T00:00:00`;

      const monthAgo = new Date(now);
      monthAgo.setDate(monthAgo.getDate() - 29);
      const monthMin = `${toLocalISODate(monthAgo)}T00:00:00`;

      const c = childId || undefined;

      const [
        feedingsRes,
        weeklyFeedingsRes,
        sleepRes,
        weeklySleepRes,
        changesRes,
        tummyRes,
        weeklyTummyRes,
        tempRes,
        weightRes,
        heightRes,
        headCircumferenceRes,
        bmiRes,
        medicationRes,
        timersRes,
        notesRes,
        monthlyFeedingsRes,
        monthlySleepRes,
        monthlyChangesRes,
        pumpingRes,
      ] = await Promise.all([
        api.getFeedings({ child: c, start_min: todayMin, start_max: todayMax, limit: 100, ordering: "-start" }),
        api.getFeedings({ child: c, start_min: weekMin, limit: 200, ordering: "-start" }),
        api.getSleep({ child: c, start_min: sleepMin, limit: 100, ordering: "-start" }),
        api.getSleep({ child: c, start_min: weekMin, limit: 200, ordering: "-start" }),
        api.getChanges({ child: c, date_min: todayMin, date_max: todayMax, limit: 100, ordering: "-time" }),
        api.getTummyTimes({ child: c, start_min: todayMin, start_max: todayMax, limit: 100, ordering: "-start" }),
        api.getTummyTimes({ child: c, start_min: weekMin, limit: 200, ordering: "-start" }),
        api.getTemperature({ child: c, limit: 10, ordering: "-time" }),
        api.getWeight({ child: c, limit: 20, ordering: "-date" }),
        api.getHeight({ child: c, limit: 20, ordering: "-date" }),
        api.getHeadCircumference({ child: c, limit: 20, ordering: "-date" }),
        api.getBmi({ child: c, limit: 20, ordering: "-date" }),
        api.getMedication({ child: c, limit: 30, ordering: "-time" }),
        api.getTimers(),
        api.getNotes({ child: c, limit: 20, ordering: "-time" }),
        api.getFeedings({ child: c, start_min: monthMin, limit: 500, ordering: "-start" }),
        api.getSleep({ child: c, start_min: monthMin, limit: 500, ordering: "-start" }),
        api.getChanges({ child: c, date_min: monthMin, limit: 500, ordering: "-time" }),
        api.getPumping({ child: c, start_min: weekMin, limit: 200, ordering: "-start" }),
      ]);

      setFeedings(feedingsRes.results || []);
      setWeeklyFeedings(weeklyFeedingsRes.results || []);
      setSleepEntries(sleepRes.results || []);
      setWeeklySleep(weeklySleepRes.results || []);
      setChanges(changesRes.results || []);
      setTummyTimes(tummyRes.results || []);
      setWeeklyTummyTimes(weeklyTummyRes.results || []);
      setTemperatures(tempRes.results || []);
      setWeights(weightRes.results || []);
      setHeights(heightRes.results || []);
      setHeadCircumferences(headCircumferenceRes.results || []);
      const fetchedBmis = bmiRes.results || [];
      setBmis(fetchedBmis);
      setMedications(medicationRes.results || []);
      setTimers(timersRes.results || []);
      setNotes(notesRes.results || []);
      setMonthlyFeedings(monthlyFeedingsRes.results || []);
      setMonthlySleep(monthlySleepRes.results || []);
      setMonthlyChanges(monthlyChangesRes.results || []);
      setWeeklyPumping(pumpingRes.results || []);
      try {
        const changed = await syncBmisForMeasurements({ childId: c, weights: weightRes.results || [], heights: heightRes.results || [], bmis: fetchedBmis, unitSystem });
        if (changed) {
          const refreshed = await api.getBmi({ child: c, limit: 20, ordering: "-date" });
          setBmis(refreshed.results || []);
        }
      } catch { /* BMI reconciliation must never block dashboard loading. */ }
      setLastSync(new Date());
      setError(null);
    } catch (err) {
      if (throwOnError) throw err;
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    syncInFlightRef.current = true;
    lastSyncAttemptRef.current = Date.now();
    try {
      // One quiet retry: a single dropped request (mobile network, a tab that was just
      // resumed) should not flip the header to "connection error".
      for (let attempt = 0; ; attempt += 1) {
        try {
          const childrenRes = await api.getChildren();
          const allChildren = (childrenRes.results || []).map(fixChildPicture);
          setChildren(allChildren);

          const active = allChildren.find((c) => c.id === childIdRef.current) || allChildren[0] || null;
          if (active) {
            childIdRef.current = active.id;
            setChild(active);
          }

          await fetchData(active?.id, { throwOnError: true });
          return;
        } catch (err) {
          if (attempt >= 1) {
            setError(err.message);
            setLoading(false);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    } finally {
      syncInFlightRef.current = false;
    }
  }, [fetchData]);

  // Background refresh: skipped while the page is hidden (browsers throttle or freeze
  // hidden tabs, so those requests tend to stall), and run as soon as it is shown again.
  const autoRefresh = useCallback(() => {
    if (demoRef.current || syncInFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (Date.now() - lastSyncAttemptRef.current < AUTO_REFRESH_MIN_GAP_MS) return;
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const onResume = () => autoRefresh();
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    window.addEventListener("pageshow", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      window.removeEventListener("pageshow", onResume);
    };
  }, [autoRefresh]);

  const selectChild = useCallback(
    (id) => {
      const selected = children.find((c) => c.id === id);
      if (!selected || selected.id === child?.id) return;
      childIdRef.current = id;
      setChild(selected);
      setLoading(true);
      fetchData(id);
    },
    [children, child, fetchData]
  );

  const loadMock = useCallback(() => {
    const mock = getMockData();
    setChildren(mock.children);
    setChild(mock.children[0]);
    childIdRef.current = mock.children[0].id;
    setFeedings(mock.feedings);
    setWeeklyFeedings(mock.weeklyFeedings);
    setSleepEntries(mock.sleepEntries);
    setWeeklySleep(mock.weeklySleep);
    setChanges(mock.changes);
    setTummyTimes(mock.tummyTimes);
    setWeeklyTummyTimes(mock.weeklyTummyTimes);
    setTemperatures(mock.temperatures);
    setWeights(mock.weights);
    setHeights(mock.heights);
    setHeadCircumferences(mock.headCircumferences);
    setBmis(mock.bmis);
    setMedications(mock.medications);
    setTimers(mock.timers);
    setNotes(mock.notes);
    setMonthlyFeedings(mock.monthlyFeedings);
    setMonthlySleep(mock.monthlySleep);
    setMonthlyChanges(mock.monthlyChanges);
    setWeeklyPumping(mock.pumping || []);
    setLastSync(new Date());
    setLoading(false);
  }, []);

  const selectMockChild = useCallback(
    (id) => {
      const selected = children.find((c) => c.id === id);
      if (!selected || selected.id === child?.id) return;
      childIdRef.current = id;
      setChild(selected);
      const mock = getMockData(id);
      setFeedings(mock.feedings);
      setWeeklyFeedings(mock.weeklyFeedings);
      setSleepEntries(mock.sleepEntries);
      setWeeklySleep(mock.weeklySleep);
      setChanges(mock.changes);
      setTummyTimes(mock.tummyTimes);
      setWeeklyTummyTimes(mock.weeklyTummyTimes);
      setTemperatures(mock.temperatures);
      setWeights(mock.weights);
      setHeights(mock.heights);
      setHeadCircumferences(mock.headCircumferences);
      setBmis(mock.bmis);
      setMedications(mock.medications);
      setTimers(mock.timers);
      setNotes(mock.notes);
      setMonthlyFeedings(mock.monthlyFeedings);
      setMonthlySleep(mock.monthlySleep);
      setMonthlyChanges(mock.monthlyChanges);
      setWeeklyPumping(mock.pumping || []);
    },
    [children, child]
  );


  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        if (cfg.unit_system) setUnitSystem(cfg.unit_system);
        if (cfg.child_sex) setChildSex(cfg.child_sex);
        if (cfg.theme) setTheme(cfg.theme);
        if (cfg.demo_mode) {
          demoRef.current = true;
          loadMock();
        } else {
          fetchAll();
          const ms = (cfg.refresh_interval || 30) * 1000;
          intervalRef.current = setInterval(autoRefresh, ms);
        }
      })
      .catch(() => {
        fetchAll();
        intervalRef.current = setInterval(autoRefresh, 30000);
      });

    return () => clearInterval(intervalRef.current);
  }, [fetchAll, autoRefresh, loadMock]);

  return {
    children,
    child,
    selectChild: demoRef.current ? selectMockChild : selectChild,
    feedings,
    weeklyFeedings,
    sleepEntries,
    weeklySleep,
    changes,
    tummyTimes,
    weeklyTummyTimes,
    temperatures,
    weights,
    heights,
    headCircumferences,
    bmis,
    medications,
    monthlyFeedings,
    monthlySleep,
      monthlyChanges,
      weeklyPumping,
    notes,
    timers,
    loading,
    error,
    lastSync,
    unitSystem,
    childSex,
    theme,
    demoMode: demoRef.current,
    refetch: fetchAll,
  };
}
