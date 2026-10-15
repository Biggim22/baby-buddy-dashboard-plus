import { Component, useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useBabyData } from "./hooks/useBabyData";
import { api } from "./api";
import { useTimers } from "./hooks/useTimers";
import { UnitContext } from "./utils/units";
import { Icons } from "./components/Icons";
import { colors } from "./utils/colors";
import { getAge, formatElapsed, formatTime, toApiDatetime } from "./utils/formatters";
import { subscribeErrorLog, getErrorLog } from "./utils/errorLog";
import { clickableProps } from "./utils/a11y";
import { applyTheme } from "./utils/theme";
import { useTranslation, translate, getTimeFormat, setTimeFormat, subscribeTimeFormat } from "./locales";
import OverviewTab from "./tabs/OverviewTab";
import GrowthTab from "./tabs/GrowthTab";
import NotesTab from "./tabs/NotesTab";
import AnalyticsTab from "./tabs/AnalyticsTab";
import TimelineTab from "./tabs/TimelineTab";
import CareTab from "./tabs/CareTab";
import TasksTab from "./components/TaskPanel";
import { applyAppearance } from "./utils/appearance";
import FeedingForm from "./components/forms/FeedingForm";
import PumpingForm from "./components/forms/PumpingForm";
import SleepForm from "./components/forms/SleepForm";
import DiaperForm from "./components/forms/DiaperForm";
import TemperatureForm from "./components/forms/TemperatureForm";
import TummyTimeForm from "./components/forms/TummyTimeForm";
import NoteForm from "./components/forms/NoteForm";
import WeightForm from "./components/forms/WeightForm";
import HeightForm from "./components/forms/HeightForm";
import HeadCircumferenceForm from "./components/forms/HeadCircumferenceForm";
import BmiForm from "./components/forms/BmiForm";
import MedicationForm from "./components/forms/MedicationForm";
import TimerButton from "./components/TimerButton";
import SettingsModal from "./components/SettingsModal";
import "./styles.css";

function getTabs(t) {
  return [
    { id: "overview", label: t("tab.overview"), icon: <Icons.Activity /> },
    { id: "timeline", label: t("plus.timeline.title"), icon: <Icons.Clock /> },
    { id: "analytics", label: t("plus.nav.progress"), icon: <Icons.TrendUp /> },
    { id: "care", label: t("plus.nav.careHealth"), icon: <Icons.Heart /> },
    { id: "tasks", label: t("plus.tasksTab"), icon: <Icons.Clipboard /> },
  ];
}

function getActionGroups(t) {
  return [
    {
      id: "track",
      label: t("group.track"),
      actions: [
        { id: "feeding", label: t("action.feeding"), icon: <Icons.Bottle />, color: colors.feeding },
        { id: "sleep", label: t("action.sleep"), icon: <Icons.Moon />, color: colors.sleep },
        { id: "diaper", label: t("action.diaper"), icon: <Icons.Droplet />, color: colors.diaper },
        { id: "tummy", label: t("action.tummy"), icon: <Icons.Sun />, color: colors.tummy },
        { id: "pumping", label: t("plus.pumping.action"), icon: <Icons.Bottle />, color: colors.pumping },
        { id: "care", label: t("plus.addCare"), icon: <Icons.Heart />, color: "#06B6D4" },
      ],
    },
    {
      id: "measure",
      label: t("group.measure"),
      actions: [
        { id: "temp", label: t("action.temp"), icon: <Icons.Temp />, color: colors.temp },
        { id: "weight", label: t("action.weight"), icon: <Icons.Weight />, color: colors.growth },
        { id: "height", label: t("action.height"), icon: <Icons.Ruler />, color: colors.height },
        { id: "headCircumference", label: t("action.headCircumference"), icon: <Icons.HeadCircle />, color: colors.headCircumference },
      ],
    },
    {
      id: "medication",
      label: t("group.medication"),
      actions: [
        { id: "medication", label: t("action.medication"), icon: <Icons.Pill />, color: colors.medication },
      ],
    },
    {
      id: "note",
      label: t("group.note"),
      actions: [
        { id: "note", label: t("action.note"), icon: <Icons.StickyNote />, color: colors.note },
      ],
    },
  ];
}

function getTimerTypes(t) {
  return [
    { id: "feeding", label: t("action.feeding"), icon: <Icons.Bottle />, color: colors.feeding },
    { id: "sleep", label: t("action.sleep"), icon: <Icons.Moon />, color: colors.sleep },
    { id: "tummy", label: t("action.tummyTime"), icon: <Icons.Sun />, color: colors.tummy },
    { id: "pumping", label: t("plus.pumping.action"), icon: <Icons.Bottle />, color: colors.pumping },
  ];
}

function toLocalDatetime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timerNameToType(name) {
  if (!name) return "feeding";
  const n = name.toLowerCase();
  if (n.includes("sleep")) return "sleep";
  if (n.includes("tummy")) return "tummy";
  if (n.includes("pump")) return "pumping";
  return "feeding";
}

class TabErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="tab-error"><strong>{translate("common.viewLoadFailed")}</strong><span>{this.state.error.message}</span><button onClick={this.props.onBack}>{translate("common.backToOverview")}</button></div>;
  }
}

export default function App() {
  const t = useTranslation();
  useSyncExternalStore(subscribeTimeFormat, getTimeFormat);
  const data = useBabyData();
  const timer = useTimers(data.timers, data.child?.id);

  useEffect(() => {
    if (data.theme) applyTheme(data.theme);
  }, [data.theme]);

  useEffect(() => {
    if (!data.child?.id) return;
    let currentSettings;
    const refreshAppearance = () => currentSettings && applyAppearance(currentSettings);
    const loadSettings = () => api.getLocalSettings(data.child.id).then((settings) => {
      currentSettings = settings;
      setTimeFormat(settings.time_format);
      refreshAppearance();
      const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
      setTabCardSettings({ hidden: asObject(settings.tab_hidden_cards), order: asObject(settings.tab_card_order) });
    }).catch(() => {});
    loadSettings();
    const interval = window.setInterval(refreshAppearance, 30000);
    window.addEventListener("baby-buddy-settings-updated", loadSettings);
    return () => { window.clearInterval(interval); window.removeEventListener("baby-buddy-settings-updated", loadSettings); };
  }, [data.child?.id]);

  // Saved settings remount the visible tab so it re-reads its local settings.
  const [settingsVersion, setSettingsVersion] = useState(0);
  useEffect(() => {
    const bump = () => setSettingsVersion((version) => version + 1);
    window.addEventListener("baby-buddy-settings-updated", bump);
    return () => window.removeEventListener("baby-buddy-settings-updated", bump);
  }, []);

  const errorLog = useSyncExternalStore(subscribeErrorLog, getErrorLog);
  const [activeTab, setActiveTab] = useState("overview");
  const [modal, setModal] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState("track");
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [editingTimerId, setEditingTimerId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [openCareForm, setOpenCareForm] = useState(false);
  const [tabCardSettings, setTabCardSettings] = useState({ hidden: {}, order: {} });
  const tabNavRef = useRef(null);
  const TABS = getTabs(t);
  const TIMER_TYPES = getTimerTypes(t);
  // Each page still stores card preferences under its original section id.
  const cardPrefs = (sectionId) => ({ hidden: tabCardSettings.hidden[sectionId] || [], order: tabCardSettings.order[sectionId] || [] });
  // Pumping is switched on and off with its card (Settings → cards per tab).
  const pumpingEnabled = !cardPrefs("analytics").hidden.includes("pumping");
  const withoutDisabled = (actions) => actions.filter((action) => pumpingEnabled || action.id !== "pumping");
  const ACTION_GROUPS = getActionGroups(t).map((group) => ({ ...group, actions: withoutDisabled(group.actions) }));
  const QUICK_TIMER_TYPES = withoutDisabled(TIMER_TYPES);

  useEffect(() => {
    const active = tabNavRef.current?.querySelector(".tab-active");
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeTab]);

  const closeModal = () => setModal(null);
  const handleFormDone = () => {
    closeModal();
    data.refetch();
  };

  if (data.loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("header.loading")}</span>
      </div>
    );
  }

  return (
    <UnitContext.Provider value={data.unitSystem}>
    <div className="app">
      {/* Header */}
      <header className="app-header fade-in">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="avatar">
            {data.child?.picture ? (
              <img src={data.child.picture} alt={data.child.first_name} className="avatar-img" />
            ) : (
              <Icons.Baby />
            )}
          </div>
          <div>
            <h1 className="baby-name">
              {data.child?.first_name || t("header.defaultBabyName")}
            </h1>
            {data.child?.birth_date && (
              <span className="baby-age">{getAge(data.child.birth_date)}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {data.error && (
            <span className="sync-error">{t("header.connectionError")}</span>
          )}
          {data.lastSync && !data.error && (
            <span className="sync-time">
              {formatTime(data.lastSync)}
            </span>
          )}
          <button
            className="refresh-btn"
            style={{ position: "relative" }}
            onClick={() => setShowSettings(true)}
            title={t("header.settings")}
            aria-label={errorLog.length > 0 ? t("header.settingsUnread", { count: errorLog.length }) : t("header.settings")}
          >
            <Icons.Settings />
            {errorLog.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -3,
                  right: -3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#EF4444",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {errorLog.length > 9 ? "9+" : errorLog.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Child Switcher (only when 2+ children) */}
      {data.children.length >= 2 && (
        <div className="child-switcher fade-in">
          {data.children.map((c) => (
            <button
              key={c.id}
              className={`child-chip${c.id === data.child?.id ? " child-chip-active" : ""}`}
              onClick={() => data.selectChild(c.id)}
            >
              {c.first_name}
            </button>
          ))}
        </div>
      )}

      {/* Active Timer Bars */}
      {timer.activeTimers.map((activeTimer) => (
        <div key={activeTimer.id} className="timer-bar fade-in">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="timer-pulse" />
            <Icons.Timer />
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {TIMER_TYPES.find((timerType) => timerType.id === activeTimer.name)?.label || activeTimer.name}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {editingTimerId === activeTimer.id ? (
              <input
                type="datetime-local"
                className="timer-edit-input"
                defaultValue={toLocalDatetime(activeTimer.start)}
                autoFocus
                onBlur={(e) => {
                  if (e.target.value) {
                    timer.editTimer(activeTimer.id, toApiDatetime(e.target.value));
                  }
                  setEditingTimerId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") setEditingTimerId(null);
                }}
              />
            ) : (
              <span
                className="timer-elapsed"
                style={{ cursor: "pointer" }}
                title={t("header.timerEditHint")}
                {...clickableProps(() => setEditingTimerId(activeTimer.id))}
                aria-label={t("header.timerElapsed", { elapsed: formatElapsed(timer.elapsedMap[activeTimer.id] || 0) })}
              >
                {formatElapsed(timer.elapsedMap[activeTimer.id] || 0)}
              </span>
            )}
            <button
              className="timer-save-btn"
              onClick={async () => {
                const stopped = await timer.stopTimer(activeTimer.id);
                if (stopped) {
                  setModal({ type: timerNameToType(stopped.name), timerId: stopped.id });
                }
              }}
            >
              {t("header.timerSave")}
            </button>
            <button
              className="timer-discard-btn"
              onClick={() => timer.discardTimer(activeTimer.id)}
              aria-label={t("header.timerDiscard", { name: activeTimer.name })}
            >
              <Icons.X />
            </button>
          </div>
        </div>
      ))}

      {/* Tab Navigation */}
      <nav className="tab-nav fade-in" ref={tabNavRef}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ position: "relative" }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="tab-content">
        <TabErrorBoundary key={`${activeTab}-${settingsVersion}`} onBack={() => setActiveTab("overview")}>
        {activeTab === "overview" && (
          <OverviewTab
            childId={data.child?.id}
            demoMode={data.demoMode}
            feedings={data.monthlyFeedings}
            weeklyFeedings={data.weeklyFeedings}
            sleepEntries={data.weeklySleep}
            weeklySleep={data.weeklySleep}
            changes={data.monthlyChanges}
            lastSolidChange={data.monthlyChanges.find((entry) => entry.solid)}
            tummyTimes={data.weeklyTummyTimes}
            weeklyTummyTimes={data.weeklyTummyTimes}
            medications={data.medications}
            onEditEntry={(type, entry) => setModal({ type, entry })}
          />
        )}
        {activeTab === "analytics" && (
          <div className="tab-stack">
            <h2 className="tab-stack-heading">{t("tab.growth")}</h2>
            <GrowthTab
              hiddenCards={cardPrefs("growth").hidden}
              cardOrder={cardPrefs("growth").order}
              childId={data.child?.id}
              childName={data.child?.first_name}
              demoMode={data.demoMode}
              birthDate={data.child?.birth_date}
              childSex={data.childSex || "male"}
              weights={data.weights}
              heights={data.heights}
              headCircumferences={data.headCircumferences}
              bmis={data.bmis}
              monthlyFeedings={data.monthlyFeedings}
              monthlySleep={data.monthlySleep}
              monthlyChanges={data.monthlyChanges}
              onEditEntry={(type, entry) => setModal({ type, entry })}
            />
            <h2 className="tab-stack-heading">{t("plus.analyticsTab")}</h2>
            <AnalyticsTab
              childId={data.child?.id}
              hiddenCards={cardPrefs("analytics").hidden}
              cardOrder={cardPrefs("analytics").order}
              weights={data.weights}
              heights={data.heights}
              bmis={data.bmis}
              weeklyFeedings={data.weeklyFeedings}
              weeklySleep={data.weeklySleep}
              weeklyChanges={data.weeklyChanges || data.monthlyChanges}
              weeklyTummyTimes={data.weeklyTummyTimes}
              temperatures={data.temperatures}
              monthlyFeedings={data.monthlyFeedings}
              monthlySleep={data.monthlySleep}
              monthlyChanges={data.monthlyChanges}
              weeklyPumping={data.weeklyPumping}
              onDataChanged={data.refetch}
            />
          </div>
        )}
        {activeTab === "timeline" && (
          <TimelineTab
            hiddenCards={cardPrefs("timeline").hidden}
            childId={data.child?.id}
            childName={data.child?.first_name || t("header.defaultBabyName")}
            onEditEntry={(type, entry) => setModal({ type, entry })}
          />
        )}
        {activeTab === "care" && (
          <div className="tab-stack">
            <CareTab childId={data.child?.id} hiddenCards={cardPrefs("care").hidden} cardOrder={cardPrefs("care").order} autoOpen={openCareForm} onAutoOpenHandled={() => setOpenCareForm(false)} onDataChanged={data.refetch} />
            <h2 className="tab-stack-heading">{t("tab.notesAndMeds")}</h2>
            <NotesTab
              hiddenCards={cardPrefs("notes").hidden}
              cardOrder={cardPrefs("notes").order}
              childId={data.child?.id}
              demoMode={data.demoMode}
              notes={data.notes}
              medications={data.medications}
              onEditEntry={(type, entry) => setModal({ type, entry })}
              onDataChanged={data.refetch}
            />
          </div>
        )}
        {activeTab === "tasks" && <TasksTab childId={data.child?.id} hiddenCards={cardPrefs("tasks").hidden} cardOrder={cardPrefs("tasks").order} />}
        </TabErrorBoundary>
      </main>

      {/* Quick Action FAB */}
      <div className="fab-container">
        {showActions && (
          <div className="fab-menu fade-in">
            {ACTION_GROUPS.map((group) => {
              const isOpen = expandedGroup === group.id;
              return (
                <div key={group.id} className="fab-group">
                  <button
                    className={`fab-group-label${isOpen ? " fab-group-label-active" : ""}`}
                    onClick={() => setExpandedGroup(isOpen ? null : group.id)}
                  >
                    {group.label}
                  </button>
                  {isOpen && (
                    <div className="fab-group-items">
                      {group.actions.map((action) => (
                        <button
                          key={action.id}
                          className="fab-action"
                          onClick={() => {
                            if (action.id === "care") {
                              setActiveTab("care");
                              setOpenCareForm(true);
                            } else setModal({ type: action.id });
                            setShowActions(false);
                          }}
                        >
                          <span
                            className="fab-action-icon"
                            style={{ background: `${action.color}18`, color: action.color }}
                          >
                            {action.icon}
                          </span>
                          <span className="fab-action-label">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {showTimerPicker && (
          <div className="fab-menu fade-in" style={{ right: 76 }}>
            {QUICK_TIMER_TYPES.map((timerType) => (
              <button
                key={timerType.id}
                className="fab-action"
                onClick={() => {
                  timer.startTimer(timerType.id);
                  setShowTimerPicker(false);
                }}
              >
                <span
                  className="fab-action-icon"
                  style={{ background: `${timerType.color}18`, color: timerType.color }}
                >
                  {timerType.icon}
                </span>
                <span className="fab-action-label">{timerType.label}</span>
              </button>
            ))}
          </div>
        )}
        <TimerButton
          label={t("header.timer")}
          icon={<Icons.Timer />}
          color={colors.feeding}
          active={false}
          onClick={() => {
            setShowTimerPicker(!showTimerPicker);
            setShowActions(false);
          }}
        />
        <button
          className="fab-btn"
          style={{ background: showActions ? "var(--text-muted)" : "var(--accent)" }}
          onClick={() => { setShowActions(!showActions); setShowTimerPicker(false); setExpandedGroup("track"); }}
          aria-label={showActions ? t("header.closeQuickActions") : t("header.openQuickActions")}
        >
          <span style={{ transform: showActions ? "rotate(45deg)" : "none", transition: "transform 0.2s", display: "flex" }}>
            <Icons.Plus />
          </span>
        </button>
      </div>

      {/* Modals */}
      {modal?.type === "feeding" && (
        <FeedingForm
          childId={data.child?.id}
          timerId={modal.timerId}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "pumping" && (
        <PumpingForm
          childId={data.child?.id}
          timerId={modal.timerId}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "sleep" && (
        <SleepForm
          childId={data.child?.id}
          timerId={modal.timerId}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "diaper" && (
        <DiaperForm
          childId={data.child?.id}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "temp" && (
        <TemperatureForm
          childId={data.child?.id}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "tummy" && (
        <TummyTimeForm
          childId={data.child?.id}
          timerId={modal.timerId}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "weight" && (
        <WeightForm
          childId={data.child?.id}
          entry={modal.entry}
          heights={data.heights}
          bmis={data.bmis}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "height" && (
        <HeightForm
          childId={data.child?.id}
          entry={modal.entry}
          weights={data.weights}
          bmis={data.bmis}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "headCircumference" && (
        <HeadCircumferenceForm
          childId={data.child?.id}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "bmi" && (
        <BmiForm
          childId={data.child?.id}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "medication" && (
        <MedicationForm
          childId={data.child?.id}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {modal?.type === "note" && (
        <NoteForm
          childId={data.child?.id}
          entry={modal.entry}
          onDone={handleFormDone}
          onClose={closeModal}
        />
      )}
      {showSettings && (
        <SettingsModal
          childId={data.child?.id}
          connected={!data.error}
          lastSync={data.lastSync}
          errorMessage={data.error}
          onRefresh={data.refetch}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
    </UnitContext.Provider>
  );
}
