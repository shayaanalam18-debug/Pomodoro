function setActiveTab(nextTabEl) {
  console.log("[pomo:debug] setActiveTab", { tab: nextTabEl?.dataset?.tab });
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

  const nextId = nextTabEl?.dataset?.tab;
  if (!nextId) return;

  for (const tab of tabs) {
    const selected = tab === nextTabEl;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  }

  for (const panel of panels) {
    const isTarget = panel.dataset.panel === nextId;
    panel.hidden = !isTarget;
  }

  // Lazy-init Pomodoro logic when its tab is opened.
  if (nextId === "pomodoro") initPomodoro();
  // Lazy-init Progress logic when its tab is opened.
  if (nextId === "progress") initProgress();
}

function focusTabByIndex(tabs, idx) {
  console.log("[pomo:debug] focusTabByIndex", { idx });
  const clamped = ((idx % tabs.length) + tabs.length) % tabs.length;
  tabs[clamped].focus();
}

function initTabs() {
  console.log("[pomo:debug] initTabs");
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  if (tabs.length === 0) return;

  tablist.addEventListener("click", (e) => {
    console.log("[pomo:debug] initTabs tablist click");
    const tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    setActiveTab(tab);
    const panel = document.querySelector(`#${CSS.escape(tab.getAttribute("aria-controls"))}`);
    panel?.focus?.();
  });

  tablist.addEventListener("keydown", (e) => {
    console.log("[pomo:debug] initTabs tablist keydown", { key: e.key });
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    switch (e.key) {
      case "ArrowRight":
      case "Right": {
        e.preventDefault();
        focusTabByIndex(tabs, currentIndex + 1);
        break;
      }
      case "ArrowLeft":
      case "Left": {
        e.preventDefault();
        focusTabByIndex(tabs, currentIndex - 1);
        break;
      }
      case "Home": {
        e.preventDefault();
        focusTabByIndex(tabs, 0);
        break;
      }
      case "End": {
        e.preventDefault();
        focusTabByIndex(tabs, tabs.length - 1);
        break;
      }
      case "Enter":
      case " ":
      case "Spacebar": {
        e.preventDefault();
        const tab = document.activeElement.closest('[role="tab"]');
        if (!tab) return;
        setActiveTab(tab);
        const panel = document.querySelector(`#${CSS.escape(tab.getAttribute("aria-controls"))}`);
        panel?.focus?.();
        break;
      }
      default:
        break;
    }
  });
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function initPomodoro() {
  console.log("[pomo:debug] initPomodoro");
  const panel = document.querySelector('#panel-pomodoro[data-panel="pomodoro"]');
  if (!panel) return;
  if (panel.dataset.pomoInit === "true") return;
  panel.dataset.pomoInit = "true";

  const textBlock = panel.querySelector('.timer--text[data-display="text"]');
  const clockBlock = panel.querySelector('.timer--clock[data-display="clock"]');

  const timeText = panel.querySelector("#pomo-time-text");
  const timeClock = panel.querySelector("#pomo-time-clock");
  const ring = panel.querySelector(".clock__ring");
  const textLabel = panel.querySelector("#pomo-task-label");
  const clockLabel = panel.querySelector("#pomo-task-label-clock");

  const toggleBtn = panel.querySelector('button[data-action="toggle"]');
  const resetBtn = panel.querySelector('button[data-action="reset"]');
  const displayInputs = Array.from(panel.querySelectorAll('input[name="displayMode"]'));

  // Session metadata (title + sounds) used to log completed pomodoros.
  const taskInput = panel.querySelector("#pomo-task");
  const previewEl = panel.querySelector("#pomo-preview");
  const soundInputs = Array.from(panel.querySelectorAll('input[name="pomoSound"]'));
  const LOGS_KEY = "pomoLogs";
  const SOUNDS_KEY = "pomoSounds";

  // Fetch the logs from the local storage before updating them.
  function safeLoadLogs() {
    console.log("[pomo:debug] initPomodoro.safeLoadLogs");
    try {
      const parsed = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Save the logs to the local storage at end of a session.
  function safeSaveLogs(logs) {
    console.log("[pomo:debug] initPomodoro.safeSaveLogs", { count: logs?.length });
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }

  function getSelectedSounds() {
    console.log("[pomo:debug] initPomodoro.getSelectedSounds");
    return soundInputs.filter((i) => i.checked).map((i) => i.value);
  }

  if (
    !textBlock ||
    !clockBlock ||
    !timeText ||
    !timeClock ||
    !ring ||
    !toggleBtn ||
    !resetBtn
  ) {
    return;
  }

  const FOCUS_SECONDS = 25 * 60;
  const BREAK_SECONDS = 5 * 60;
  const FOCUS_GOAL = 4; // 25m focus sessions total

  /** @type {"focus" | "break" | "done"} */
  let phase = "focus";
  let focusCompletedCount = 0;

  let totalSeconds = FOCUS_SECONDS;
  let remainingSeconds = FOCUS_SECONDS;
  let tickId = null;
  let endAt = null;

  let activeTitle = "Pomodoro";
  let activeSounds = [];

  function updateSessionPreview() {
    console.log("[pomo:debug] initPomodoro.updateSessionPreview");
    const title = (taskInput?.value || "").trim();
    activeTitle = title || "Pomodoro";
    activeSounds = getSelectedSounds();

    if (previewEl) {
      const soundsText = activeSounds.length ? `${activeSounds.length} sound(s)` : "no sound";
      previewEl.textContent = `Session: ${activeTitle} • ${soundsText}`;
    }
  }

  // Restore sound selection (checkboxes).
  try {
    const savedSounds = JSON.parse(localStorage.getItem(SOUNDS_KEY) || "[]");
    if (Array.isArray(savedSounds)) {
      for (const input of soundInputs) input.checked = savedSounds.includes(input.value);
    }
  } catch {
    // ignore
  }
  updateSessionPreview();

  function setDisplayMode(mode) {
    console.log("[pomo:debug] initPomodoro.setDisplayMode", { mode });
    const isClock = mode === "clock";
    textBlock.hidden = isClock;
    clockBlock.hidden = !isClock;
    textBlock.style.display = isClock ? "none" : "";
    clockBlock.style.display = isClock ? "" : "none";
    localStorage.setItem("pomoDisplayMode", mode);
  }

  function setProgress(remaining, total) {
    const totalSafe = Math.max(1, total);
    const remainingSafe = Math.max(0, Math.min(totalSafe, remaining));

    const elapsedFrac = 1 - remainingSafe / totalSafe; // 0 → 1
    const hue = Math.round(120 * (1 - elapsedFrac)); // 120(green) → 0(red)

    ring.style.setProperty("--p", String(elapsedFrac));
    ring.style.setProperty("--h", String(hue));
  }

  function render() {
    const label = formatTime(remainingSeconds);
    timeText.textContent = label;
    timeClock.textContent = label;
    setProgress(remainingSeconds, totalSeconds);
  }

  function stopTicking() {
    console.log("[pomo:debug] initPomodoro.stopTicking");
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
    endAt = null;
  }

  function stopAll() {
    console.log("[pomo:debug] initPomodoro.stopAll");
    stopTicking();
    toggleBtn.textContent = "Start";
  }

  // Web Audio: create tones when a session completes.
  let audioCtx = null;
  function ensureAudio() {
    console.log("[pomo:debug] initPomodoro.ensureAudio");
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!audioCtx) audioCtx = new AudioCtor();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, durationMs, type = "sine", volume = 0.2) {
    const ctx = ensureAudio();
    if (!ctx) return;

    const t0 = ctx.currentTime + 0.01;
    const duration = durationMs / 1000;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playSoundPreset(soundKey) {
    console.log("[pomo:debug] initPomodoro.playSoundPreset", { soundKey });
    // Small presets: no external audio files needed.
    switch (soundKey) {
      case "chime":
        playTone(523.25, 140, "sine", 0.2); // C5
        setTimeout(() => playTone(659.25, 180, "sine", 0.2), 120); // E5
        break;
      case "beep":
        playTone(880, 180, "square", 0.2);
        break;
      case "soft":
        playTone(330, 260, "sine", 0.2);
        break;
      default:
        break;
    }
  }

  function playSelectedSounds(soundKeys) {
    console.log("[pomo:debug] initPomodoro.playSelectedSounds", { soundKeys });
    const keys = Array.isArray(soundKeys) ? soundKeys : [];
    if (!keys.length) return;
    // Staggered playback when multiple sounds are selected.
    let delay = 0;
    for (const key of keys) {
      setTimeout(() => playSoundPreset(key), delay);
      delay += 260;
    }
  }

  // Once a focus session is completed, log it to local storage.
  function logCompletedSession(minutesOverride) {
    console.log("[pomo:debug] initPomodoro.logCompletedSession", { minutesOverride });
    const logs = safeLoadLogs();
    const minutes =
      typeof minutesOverride === "number" && Number.isFinite(minutesOverride)
        ? Math.max(1, Math.round(minutesOverride))
        : Math.max(1, Math.round(FOCUS_SECONDS / 60));
    const title = activeTitle || "Pomodoro";
    const sounds = Array.isArray(activeSounds) ? activeSounds : [];

    logs.push({
      ts: Date.now(),
      title,
      minutes,
      sounds,
      type: "focus", // everything is focus for now. May expand to track other types later.
    });

    // Keep storage bounded.
    const capped = logs.slice(-500);
    safeSaveLogs(capped);

    document.dispatchEvent(
      new CustomEvent("pomoSessionLogged", {
        detail: { title, minutes, sounds, ts: Date.now() },
      })
    );
  }

  function updatePhaseLabels() {
    const next = phase === "break" ? "Break" : "Focus";
    const focusIndex = Math.min(FOCUS_GOAL, focusCompletedCount + (phase === "focus" ? 1 : 0));
    const suffix = phase === "focus" ? ` ${focusIndex}/${FOCUS_GOAL}` : "";

    if (textLabel) textLabel.textContent = `${next}${suffix}`;
    if (clockLabel) clockLabel.textContent = `${next}${suffix}`;
  }

  function setPhase(nextPhase, opts = {}) {
    const { keepRemaining = false } = opts;
    console.log("[pomo:debug] initPomodoro.setPhase", { nextPhase, keepRemaining });
    phase = nextPhase;

    if (phase === "focus") totalSeconds = FOCUS_SECONDS;
    else if (phase === "break") totalSeconds = BREAK_SECONDS;
    else totalSeconds = FOCUS_SECONDS;

    if (!keepRemaining) remainingSeconds = totalSeconds;
    updatePhaseLabels();
    render();
  }

  function handlePhaseComplete() {
    console.log("[pomo:debug] initPomodoro.handlePhaseComplete", { phase, focusCompletedCount });
    if (phase === "focus") {
      focusCompletedCount += 1;
      logCompletedSession(FOCUS_SECONDS / 60);
      playSelectedSounds(activeSounds);

      if (focusCompletedCount < FOCUS_GOAL) {
        setPhase("break");
        startTicking();
        return;
      }

      // Final focus completed: stop and reset to initial state.
      phase = "done";
      stopAll();
      focusCompletedCount = 0;
      setPhase("focus");
      return;
    }

    if (phase === "break") {
      setPhase("focus");
      startTicking();
    }
  }

  function startTicking() {
    console.log("[pomo:debug] initPomodoro.startTicking", { phase });
    if (tickId) return;
    toggleBtn.textContent = "Pause";
    // Capture the latest session metadata at the moment the user starts a focus session.
    if (phase === "focus") {
      activeTitle = (taskInput?.value || "").trim() || "Pomodoro";
      activeSounds = getSelectedSounds();
      ensureAudio();
    }
    // Use an absolute end timestamp to reduce drift.
    endAt = Date.now() + remainingSeconds * 1000;

    tickId = setInterval(() => {
      const msLeft = endAt - Date.now();
      const nextRemaining = Math.ceil(msLeft / 1000);

      remainingSeconds = Math.max(0, nextRemaining);
      render();

      if (remainingSeconds <= 0) {
        stopTicking();
        handlePhaseComplete();
      }
    }, 200);
  }

  function toggleRun() {
    console.log("[pomo:debug] initPomodoro.toggleRun", { running: Boolean(tickId) });
    if (tickId) {
      stopAll();
    } else {
      // If phase is "done", Start restarts from the first focus block.
      if (phase === "done") {
        focusCompletedCount = 0;
        setPhase("focus");
      } else {
        // Ensure labels are correct if the user paused mid-phase.
        updatePhaseLabels();
      }
      startTicking();
    }
  }

  function reset() {
    console.log("[pomo:debug] initPomodoro.reset");
    stopAll();
    focusCompletedCount = 0;
    setPhase("focus");
  }

  // Restore display mode
  const savedMode = localStorage.getItem("pomoDisplayMode");
  const initialMode = savedMode === "clock" || savedMode === "text" ? savedMode : "text";
  for (const input of displayInputs) {
    input.checked = input.value === initialMode;
  }
  setDisplayMode(initialMode);

  if (taskInput) {
    taskInput.addEventListener("input", () => {
      console.log("[pomo:debug] initPomodoro taskInput input");
      localStorage.setItem(SOUNDS_KEY, JSON.stringify(getSelectedSounds()));
      updateSessionPreview();
    });
  }
  for (const input of soundInputs) {
    input.addEventListener("change", () => {
      console.log("[pomo:debug] initPomodoro soundInput change", { value: input.value });
      localStorage.setItem(SOUNDS_KEY, JSON.stringify(getSelectedSounds()));
      updateSessionPreview();
    });
  }

  // Wire up events
  panel.addEventListener("change", (e) => {
    console.log("[pomo:debug] initPomodoro panel change");
    const input = e.target.closest('input[name="displayMode"]');
    if (!input) return;
    setDisplayMode(input.value);
  });

  // Event delegation keeps handlers working even if DOM changes later.
  panel.addEventListener("click", (e) => {
    console.log("[pomo:debug] initPomodoro panel click");
    const actionBtn = e.target.closest("button[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.getAttribute("data-action");
    if (action === "toggle") toggleRun();
    if (action === "reset") reset();
  });

  // Initial render
  setPhase("focus");
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("[pomo:debug] DOMContentLoaded");
  initTabs();
  initPomodoro();
  initProgress();
});

function initProgress() {
  console.log("[pomo:debug] initProgress");
  const panel = document.querySelector('#panel-progress[data-panel="progress"]');
  if (!panel) return;
  if (panel.dataset.progressInit === "true") return;
  panel.dataset.progressInit = "true";

  const rangeInputs = Array.from(panel.querySelectorAll('input[name="progressRange"]'));
  const tooltip = panel.querySelector("#progress-tooltip");

  const kpiFocus = panel.querySelector("#kpi-focus");
  const kpiFocusSub = panel.querySelector("#kpi-focus-sub");
  const kpiSessions = panel.querySelector("#kpi-sessions");
  const kpiSessionsSub = panel.querySelector("#kpi-sessions-sub");
  const kpiStreak = panel.querySelector("#kpi-streak");

  const lineSvg = panel.querySelector("#chart-line .chart__svg");
  const gridG = panel.querySelector("#chart-line .chart__gridlines");
  const areaPath = panel.querySelector("#chart-line .chart__area");
  const linePath = panel.querySelector("#chart-line .chart__path");
  const pointsG = panel.querySelector("#chart-line .chart__points");
  const lineCaption = panel.querySelector("#line-caption");

  const barsPlot = panel.querySelector("#bars-plot");
  const barsX = panel.querySelector("#bars-x");
  const barCaption = panel.querySelector("#bar-caption");
  const recentList = panel.querySelector("#recent-sessions");
  const recentCaption = panel.querySelector("#recent-caption");

  if (
    !tooltip ||
    !kpiFocus ||
    !kpiFocusSub ||
    !kpiSessions ||
    !kpiSessionsSub ||
    !kpiStreak ||
    !lineSvg ||
    !gridG ||
    !areaPath ||
    !linePath ||
    !pointsG ||
    !lineCaption ||
    !barsPlot ||
    !barsX ||
    !barCaption ||
    !recentList ||
    !recentCaption
  ) {
    return;
  }

  const DEMO = {
    week: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      focusMinutes: [120, 165, 70, 140, 190, 90, 110],
      sessions: [5, 7, 3, 6, 8, 4, 5],
    },
    month: {
      labels: ["W1", "W2", "W3", "W4"],
      focusMinutes: [650, 810, 720, 900],
      sessions: [26, 32, 28, 36],
    },
  };

  let range = "week";

  const LOGS_KEY = "pomoLogs";

  function safeLoadLogs() {
    console.log("[pomo:debug] initProgress.safeLoadLogs");
    try {
      const parsed = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function toDayKey(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function startOfToday() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }

  function computeStreakDays(logs) {
    console.log("[pomo:debug] initProgress.computeStreakDays", { logCount: logs?.length });
    if (!logs.length) return range === "week" ? 4 : 12;
    // Create a map to store the number of sessions per day.
    const byDay = new Map();
    for (const log of logs) {
      if (!log || typeof log.ts !== "number") continue;
      const key = toDayKey(new Date(log.ts));
      const existing = byDay.get(key) || { sessions: 0 };
      existing.sessions += 1;
      byDay.set(key, existing);
    }

    let streak = 0;
    const today = startOfToday();
    let cursor = new Date(today);
    // Loop through the days and count the number of sessions per day.
    while (true) {
      const key = toDayKey(cursor);
      if (!byDay.has(key) || (byDay.get(key)?.sessions || 0) <= 0) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  // Get the range data for the charts.
  function getRangeData(rangeKey, logs) {
    console.log("[pomo:debug] initProgress.getRangeData", { rangeKey, logCount: logs?.length });
    const noLogs = !logs.length;
    if (noLogs) {
      const d = DEMO[rangeKey];
      return { ...d, streakDays: computeStreakDays([]) };
    }

    const today = startOfToday(); // Get the start of today.
    const msDay = 86400000; // 24 hours in milliseconds

    // Create a map to store the number of focus minutes and sessions per day.
    const byDay = new Map(); 
    // dayKey -> { focusMinutes, sessions } (key is the day, value is an object with focus minutes and sessions)
    // Loop through the logs and count the number of focus minutes and sessions per day.
    for (const log of logs) {
      if (!log || typeof log.ts !== "number") continue;
      const dayKey = toDayKey(new Date(log.ts));
      const m = typeof log.minutes === "number" ? log.minutes : 0;
      const existing = byDay.get(dayKey) || { focusMinutes: 0, sessions: 0 };
      existing.focusMinutes += m;
      existing.sessions += 1;
      byDay.set(dayKey, existing);
    }

    // If the range is week, create an array of dates for the last 7 days.
    if (rangeKey === "week") {
      const dates = [];
      for (let offset = 6; offset >= 0; offset -= 1) {
        const d = new Date(today);
        d.setDate(d.getDate() - offset);
        dates.push(d);
      }

      // Create an array of labels for the days.
      const labels = dates.map((d) => d.toLocaleString("en-US", { weekday: "short" }));
      // Create an array of focus minutes for the days.
      const focusMinutes = dates.map((d) => byDay.get(toDayKey(d))?.focusMinutes || 0);
      // Create an array of sessions for the days.
      const sessions = dates.map((d) => byDay.get(toDayKey(d))?.sessions || 0);

      // Return the data for the week.
      return {
        labels,
        focusMinutes,
        sessions,
        streakDays: computeStreakDays(logs),
      };
    }

    // month = last 4 weeks (28 days), binned by 7-day groups (older -> newer)
    const dates28 = [];
    for (let offset = 27; offset >= 0; offset -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      dates28.push(d);
    }

    const labels = ["W1", "W2", "W3", "W4"];
    const focusMinutes = [0, 0, 0, 0];
    const sessions = [0, 0, 0, 0];

    for (let bin = 0; bin < 4; bin++) {
      const slice = dates28.slice(bin * 7, bin * 7 + 7);
      let fm = 0;
      let s = 0;
      for (const d of slice) {
        const entry = byDay.get(toDayKey(d));
        if (!entry) continue;
        fm += entry.focusMinutes;
        s += entry.sessions;
      }
      focusMinutes[bin] = fm;
      sessions[bin] = s;
    }
    return {
      labels,
      focusMinutes,
      sessions,
      streakDays: computeStreakDays(logs),
    };
  }

  function setRecentList(logs) {
    console.log("[pomo:debug] initProgress.setRecentList", { logCount: logs?.length });
    const sorted = logs
      .slice()
      .filter((l) => l && typeof l.ts === "number")
      .sort((a, b) => b.ts - a.ts);

    recentList.innerHTML = "";

    const recent = sorted.slice(0, 6);
    if (!recent.length) {
      recentCaption.textContent = "No sessions yet";
      const li = document.createElement("li");
      li.className = "recent__item muted small";
      li.textContent = "Start a Pomodoro to build your progress history.";
      recentList.appendChild(li);
      return;
    }

    recentCaption.textContent = `Last ${recent.length} runs`;

    for (const log of recent) {
      const li = document.createElement("li");
      li.className = "recent__item";

      const title = (log.title || "Pomodoro").toString();
      const minutes = typeof log.minutes === "number" ? log.minutes : 0;
      const dt = new Date(log.ts);
      const meta = `${dt.toLocaleDateString()} • ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ${minutes}m`;

      const titleEl = document.createElement("div");
      titleEl.className = "recent__title";
      titleEl.textContent = title;

      const metaEl = document.createElement("div");
      metaEl.className = "recent__meta";
      metaEl.textContent = meta;

      li.appendChild(titleEl);
      li.appendChild(metaEl);
      recentList.appendChild(li);
    }
  }

  function showTooltip(clientX, clientY, html) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    tooltip.style.left = `${clientX}px`;
    tooltip.style.top = `${clientY}px`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  function setKpis(d) {
    console.log("[pomo:debug] initProgress.setKpis", { range });
    const focus = sum(d.focusMinutes);
    const sessions = sum(d.sessions);
    kpiFocus.textContent = `${focus.toLocaleString()}m`;
    kpiSessions.textContent = `${sessions.toLocaleString()}`;
    kpiStreak.textContent = typeof d.streakDays === "number" ? `${d.streakDays}d` : "—";

    const perDay = range === "week" ? 7 : 4;
    kpiFocusSub.textContent = `avg ${(focus / perDay).toFixed(0)}m / ${range === "week" ? "day" : "week"}`;
    kpiSessionsSub.textContent = `avg ${(sessions / perDay).toFixed(1)} / ${range === "week" ? "day" : "week"}`;
  }

  // Clear the element's children.
  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  // Create an SVG element.
  function svgEl(name) {
    return document.createElementNS("http://www.w3.org/2000/svg", name);
  }

  // Render the line chart.
  function renderLine(d) {
    console.log("[pomo:debug] initProgress.renderLine", { labels: d?.labels?.length });
    // Set the width and height of the chart.
    const W = 640;
    const H = 240;
    const pad = 26;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;

    const values = d.sessions;
    // Set maximum value to 1 to avoid division by zero
    const maxV = Math.max(1, ...values);

    // Set minimum value to 0 to avoid division by zero
    const minV = Math.min(0, ...values);

    // Calculate x and y for the line chart.
    const xFor = (i) => pad + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
    const yFor = (v) => pad + (1 - (v - minV) / (maxV - minV || 1)) * innerH;

    // Clear the grid lines.
    clearEl(gridG);
    // Draw 4 grid lines.
    const lines = 4;

    // Draw the grid lines.
    for (let i = 0; i <= lines; i++) {
      const y = pad + (i / lines) * innerH;
      const ln = svgEl("line");
      ln.setAttribute("x1", String(pad));
      ln.setAttribute("x2", String(W - pad));
      ln.setAttribute("y1", String(y));
      ln.setAttribute("y2", String(y));
      gridG.appendChild(ln);
    }

    // Calculate the points for the line chart.
    const pts = values.map((v, i) => ({ x: xFor(i), y: yFor(v), v, label: d.labels[i] }));
    // Calculate the path for the line chart.
    const dLine = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    // Set the path for the line chart.
    linePath.setAttribute("d", dLine);

    
    const dArea = `${dLine} L ${(pad + innerW).toFixed(2)} ${(pad + innerH).toFixed(2)} L ${pad.toFixed(
      2
    )} ${(pad + innerH).toFixed(2)} Z`;

    // Set the path for the area chart.
    areaPath.setAttribute("d", dArea);

    // Animate "draw" by setting dasharray to total length and offset.
    const len = linePath.getTotalLength();
    linePath.style.strokeDasharray = String(len);
    linePath.style.strokeDashoffset = String(len);
    // Force reflow for transition
    void linePath.getBoundingClientRect();
    linePath.style.strokeDashoffset = "0";

    // Clear the points.
    clearEl(pointsG);
    // Draw the points.
    for (const p of pts) {
      const g = svgEl("g");
      g.classList.add("chart__point");

      const c = svgEl("circle");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", "5");

      const hit = svgEl("circle");
      hit.setAttribute("cx", String(p.x));
      hit.setAttribute("cy", String(p.y));
      hit.setAttribute("r", "14");
      hit.setAttribute("fill", "transparent");
      // Append the points to the points group.
      g.appendChild(c);
      // Append the hit circle to the points group.
      g.appendChild(hit);
      // Add event listeners to the points group.
      g.addEventListener("pointerenter", (e) => {
        showTooltip(e.clientX, e.clientY, `<strong>${p.label}</strong><br/>${p.v} sessions`);
      });
      g.addEventListener("pointermove", (e) => {
        showTooltip(e.clientX, e.clientY, `<strong>${p.label}</strong><br/>${p.v} sessions`);
      });
      g.addEventListener("pointerleave", hideTooltip);

      pointsG.appendChild(g);
    }

    lineCaption.textContent = range === "week" ? "Last 7 days" : "Last 4 weeks";
  }

  function renderBars(d) {
    console.log("[pomo:debug] initProgress.renderBars", { labels: d?.labels?.length });
    const values = d.focusMinutes;
    const maxV = Math.max(1, ...values);

    clearEl(barsPlot);
    clearEl(barsX);

    const columns = values.length;
    barsPlot.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    barsX.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    values.forEach((v, i) => {
      const bar = document.createElement("div");
      bar.className = "bars2__bar";
      bar.dataset.label = d.labels[i];
      bar.dataset.value = String(v);

      const fill = document.createElement("div");
      fill.className = "bars2__barFill";
      fill.style.setProperty("--h", "0%");
      bar.appendChild(fill);

      bar.addEventListener("pointerenter", (e) => {
        showTooltip(
          e.clientX,
          e.clientY,
          `<strong>${d.labels[i]}</strong><br/>${v.toLocaleString()} focus minutes`
        );
      });
      bar.addEventListener("pointermove", (e) => {
        showTooltip(
          e.clientX,
          e.clientY,
          `<strong>${d.labels[i]}</strong><br/>${v.toLocaleString()} focus minutes`
        );
      });
      bar.addEventListener("pointerleave", hideTooltip);

      barsPlot.appendChild(bar);

      const x = document.createElement("div");
      x.textContent = d.labels[i];
      barsX.appendChild(x);

      // Animate after insert (so transition runs)
      requestAnimationFrame(() => {
        const pct = (v / maxV) * 100;
        fill.style.setProperty("--h", `${pct.toFixed(2)}%`);
      });
    });

    barCaption.textContent = range === "week" ? "Focus minutes per day" : "Focus minutes per week";
  }

  // Render all the charts. Primary entry point for the progress tab.
  function renderAll() {
    console.log("[pomo:debug] initProgress.renderAll", { range });
    const logs = safeLoadLogs();
    const d = getRangeData(range, logs);
    setKpis(d);
    renderLine(d);
    renderBars(d);
    setRecentList(logs);
  }

  // Event listener for the range input.
  panel.addEventListener("change", (e) => {
    console.log("[pomo:debug] initProgress panel change");
    const input = e.target.closest('input[name="progressRange"]');
    if (!input) return;
    range = input.value === "month" ? "month" : "week";
    hideTooltip();
    renderAll();
  });

  // Initial render
  range = rangeInputs.find((i) => i.checked)?.value || range;
  for (const input of rangeInputs) input.checked = input.value === range;
  renderAll();

  document.addEventListener("pomoSessionLogged", () => {
    console.log("[pomo:debug] document pomoSessionLogged");
    renderAll();
  });

  // Hide tooltip on scroll/resize so it doesn't float oddly
  window.addEventListener("scroll", hideTooltip, { passive: true });
  window.addEventListener("resize", hideTooltip);
}

