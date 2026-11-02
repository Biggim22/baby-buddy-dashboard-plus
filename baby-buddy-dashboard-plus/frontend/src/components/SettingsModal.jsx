import { useState, useSyncExternalStore } from "react";
import Modal from "./Modal";
import { Icons } from "./Icons";
import { subscribeErrorLog, getErrorLog, clearErrorLog } from "../utils/errorLog";
import { downloadFile } from "../utils/download";
import { useTranslation, getLocale, getLanguage, setLanguage, subscribeLanguage, SUPPORTED_LANGUAGES, getTimeFormat } from "../locales";
import SettingsTab from "../tabs/SettingsTab";
import { api } from "../api";

function formatTime(iso) {
  return new Date(iso).toLocaleString(getLocale(), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SettingsModal({ childId, connected, lastSync, errorMessage, onClose }) {
  const t = useTranslation();
  const [group, setGroup] = useState("general");
  const groups = ["general", "appearance", "content", "ha", "system"];
  const log = useSyncExternalStore(subscribeErrorLog, getErrorLog);
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);

  const handleExport = () => {
    const lines = log.map((e) => `${e.time}\t${e.action}\t${e.message}`);
    downloadFile(
      `baby-buddy-error-log-${new Date().toISOString().slice(0, 10)}.txt`,
      ["time\taction\tmessage", ...lines].join("\n"),
      "text/plain"
    );
  };

  const changeLanguage = (code) => {
    setLanguage(code);
    if (childId) api.updateLocalSettings(childId, { language: code }).catch(() => {});
  };

  return (
    <Modal title={t("settings.title")} onClose={onClose} maxWidth={760} className="modal-sheet">
      <div className="settings-category-tabs" role="tablist" aria-label={t("settings.title")}>
        {groups.map((id, index) => <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={group === id} aria-controls="settings-panel" tabIndex={group === id ? 0 : -1}
          onClick={() => setGroup(id)} onKeyDown={event => {
            const target = event.key === "ArrowRight" ? (index + 1) % groups.length : event.key === "ArrowLeft" ? (index + groups.length - 1) % groups.length : event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : null;
            if (target == null) return;
            event.preventDefault(); setGroup(groups[target]); document.getElementById(`settings-tab-${groups[target]}`)?.focus();
          }}>{t(`settingsGroups.${id}`)}</button>)}
      </div>
      <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${group}`}>
      <div hidden={group !== "system"}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderRadius: 10,
          marginBottom: 20,
          background: connected ? "#22C55E12" : "#EF444412",
          border: `1px solid ${connected ? "#22C55E30" : "#EF444430"}`,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: connected ? "#22C55E" : "#EF4444",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: connected ? "#22C55E" : "#EF4444" }}>
              {connected ? t("settings.connected") : t("settings.connectionError")}
            </span>
          </div>
          {connected && lastSync && (
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4, fontFamily: "var(--mono)" }}>
              {t("settings.lastSync", { time: lastSync.toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit", hour12: getTimeFormat() === "12h" }) })}
            </div>
          )}
          {!connected && errorMessage && (
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{errorMessage}</div>
          )}
        </div>
      </div>

      </div>
      <div hidden={group !== "general"}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
        {t("settings.language")}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 10,
              border: language === lang.code ? "1px solid var(--accent-60)" : "1px solid var(--border)",
              background: language === lang.code ? "var(--accent-09)" : "var(--bg)",
              color: language === lang.code ? "var(--accent)" : "var(--text-muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {lang.label}
          </button>
        ))}
      </div>

      <p className="form-hint">{t("settingsLanguageImmediate")}</p>
      </div>
      <div hidden={group !== "system"}>

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 24, marginBottom: 10 }}>
        {t("settings.errorLog")}
      </div>
      {log.length === 0 ? (
        <div style={{ color: "var(--text-dim)", fontSize: 13, textAlign: "center", padding: 20 }}>
          {t("settings.noErrorsRecorded")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto", marginBottom: 16 }}>
          {log.map((e, i) => (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--bg)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)", marginBottom: 4 }}>
                <span>{e.action}</span>
                <span>{formatTime(e.time)}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text)" }}>{e.message}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleExport}
          disabled={log.length === 0}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 13,
            fontWeight: 600,
            cursor: log.length === 0 ? "default" : "pointer",
            opacity: log.length === 0 ? 0.5 : 1,
            fontFamily: "inherit",
          }}
        >
          <Icons.Download /> {t("settings.exportLog")}
        </button>
        <button
          onClick={clearErrorLog}
          disabled={log.length === 0}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #EF444440",
            background: "#EF444415",
            color: "#EF4444",
            fontSize: 13,
            fontWeight: 600,
            cursor: log.length === 0 ? "default" : "pointer",
            opacity: log.length === 0 ? 0.5 : 1,
            fontFamily: "inherit",
          }}
        >
          <Icons.Trash /> {t("settings.clear")}
        </button>
      </div>
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 12, lineHeight: 1.5 }}>
        <strong style={{ color: "var(--text)" }}>Baby Buddy Dashboard Plus {__APP_VERSION__}</strong><br />
        <span>{t("plus.aboutPlus")}</span><br />
        {t("plus.basedOn")} <a href="https://github.com/mbentancour/baby-buddy-dashboard" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Baby Buddy Dashboard 1.7.7</a>
      </div>
      </div>
      <SettingsTab key={childId} childId={childId} embedded group={group} />
      </div>
    </Modal>
  );
}
