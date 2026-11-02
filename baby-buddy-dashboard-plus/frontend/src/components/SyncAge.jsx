import { useEffect, useState } from "react";
import { formatTime } from "../utils/formatters";
import { getLocale, useTranslation } from "../locales";

export function syncAgeLabel(lastSync, now) {
  const seconds = Math.max(0, Math.floor((now - new Date(lastSync).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h`;
}

export default function SyncAge({ lastSync }) {
  const t = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  if (!lastSync || !Number.isFinite(+new Date(lastSync))) return null;
  const age = syncAgeLabel(lastSync, now);
  const label = t("syncAgeDescription", { age, time: new Date(lastSync).toLocaleString(getLocale()) });
  return <span title={label} aria-label={label} style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
    {formatTime(lastSync)} · {age}
  </span>;
}
