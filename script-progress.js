function initProgress() {
  console.log("[pomo:debug] initProgress");
  const panel = document.querySelector('#panel-progress[data-panel="progress"]');
  if (!panel) return;
  if (panel.dataset.progressInit === "true") return;
  panel.dataset.progressInit = "true";

  const rangeInputs = Array.from(panel.querySelectorAll('input[name="progressRange"]'));
  const tooltip = panel.querySelector("#progress-tooltip");
  const progressNote = panel.querySelector("#progress-note");

  const kpiFocus = panel.querySelector("#kpi-focus");
  const kpiFocusSub = panel.querySelector("#kpi-focus-sub");
  const kpiSessions = panel.querySelector("#kpi-sessions");
  const kpiSessionsSub = panel.querySelector("#kpi-sessions-sub");
  const kpiStreak = panel.querySelector("#kpi-streak");
  const kpiWrap = panel.querySelector(".progress__kpis");
  let kpiScore = panel.querySelector("#kpi-score");
  let kpiScoreSub = panel.querySelector("#kpi-score-sub");

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
    !kpiWrap ||
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

  // Optional KPI: focus score from logs.
  if (!kpiScore || !kpiScoreSub) {
    const card = document.createElement("div");
    card.className = "card kpi";
    card.innerHTML = `
      <div class="kpi__label muted">Focus score</div>
      <div class="kpi__value" id="kpi-score">—</div>
      <div class="kpi__trend muted small" id="kpi-score-sub">—</div>
    `;
    kpiWrap.appendChild(card);
    kpiScore = card.querySelector("#kpi-score");
    kpiScoreSub = card.querySelector("#kpi-score-sub");
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
  const PROGRESS_DEMO_KEY = "pomoProgressDemo";

  function useProgressDemo() {
    try {
      return localStorage.getItem(PROGRESS_DEMO_KEY) === "true";
    } catch {
      return false;
    }
  }

  function setProgressDemo(on) {
    try {
      if (on) localStorage.setItem(PROGRESS_DEMO_KEY, "true");
      else localStorage.removeItem(PROGRESS_DEMO_KEY);
    } catch {
      // ignore
    }
  }

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

  function safeLoadName() {
    try {
      const raw = (localStorage.getItem("pomoName") || "").trim();
      return raw ? raw.slice(0, 24) : "";
    } catch {
      return "";
    }
  }

  function setProgressNote(logs) {
    if (!progressNote) return;
    const name = safeLoadName();
    const today = startOfToday();
    const key = toDayKey(today);
    let sessionsToday = 0;
    for (const log of logs) {
      if (!log || typeof log.ts !== "number") continue;
      if (toDayKey(new Date(log.ts)) !== key) continue;
      sessionsToday += 1;
    }
    if (!sessionsToday) {
      progressNote.textContent = name ? `No sessions yet, ${name}.` : "No sessions yet.";
      return;
    }
    progressNote.textContent = name
      ? `${name}, you completed ${sessionsToday} session${sessionsToday === 1 ? "" : "s"} today.`
      : `You completed ${sessionsToday} session${sessionsToday === 1 ? "" : "s"} today.`;
  }

  function computeStreakDays(logs) {
    console.log("[pomo:debug] initProgress.computeStreakDays", { logCount: logs?.length });
    if (!logs.length) return 0;
    // Sessions per calendar day.
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
    // Count consecutive days backward from today with at least one session.
    while (true) {
      const key = toDayKey(cursor);
      if (!byDay.has(key) || (byDay.get(key)?.sessions || 0) <= 0) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function computeFocusScore(rangeKey, logs) {
    if (!Array.isArray(logs) || !logs.length) return null;
    const today = startOfToday();
    const windowDays = rangeKey === "month" ? 28 : 7;
    const start = new Date(today);
    start.setDate(start.getDate() - (windowDays - 1));

    const byDay = new Map(); // dayKey -> { sessions, focusMinutes }
    for (const log of logs) {
      if (!log || typeof log.ts !== "number") continue;
      const d = new Date(log.ts);
      if (d < start || d > new Date(today.getTime() + 86399999)) continue;
      const key = toDayKey(d);
      const existing = byDay.get(key) || { sessions: 0, focusMinutes: 0 };
      existing.sessions += 1;
      existing.focusMinutes += typeof log.minutes === "number" ? log.minutes : 0;
      byDay.set(key, existing);
    }

    const activeDays = byDay.size;
    const sessions = Array.from(byDay.values()).reduce((a, x) => a + (x.sessions || 0), 0);

    // Score: 60% consistency (days active), 40% cadence (sessions density).
    const consistency = activeDays / windowDays; // 0..1
    const targetSessions = windowDays * 2; // ~2 sessions/day target
    const cadence = Math.min(1, sessions / targetSessions); // 0..1
    const score = Math.round((consistency * 60 + cadence * 40) * 1);
    return { score: Math.max(0, Math.min(100, score)), activeDays, windowDays, sessions };
  }

  function buildEmptyWeekData() {
    const today = startOfToday();
    const dates = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      dates.push(d);
    }
    const labels = dates.map((d) => d.toLocaleString("en-US", { weekday: "short" }));
    return {
      labels,
      focusMinutes: [0, 0, 0, 0, 0, 0, 0],
      sessions: [0, 0, 0, 0, 0, 0, 0],
      streakDays: 0,
      focusScore: null,
      honestEmpty: true,
    };
  }

  function buildEmptyMonthData() {
    return {
      labels: ["W1", "W2", "W3", "W4"],
      focusMinutes: [0, 0, 0, 0],
      sessions: [0, 0, 0, 0],
      streakDays: 0,
      focusScore: null,
      honestEmpty: true,
    };
  }

  // Build chart series for week or month range.
  function getRangeData(rangeKey, logs) {
    console.log("[pomo:debug] initProgress.getRangeData", { rangeKey, logCount: logs?.length });
    // Demo sample data when demo mode is enabled in storage.
    if (useProgressDemo()) {
      const d = DEMO[rangeKey];
      return { ...d, streakDays: 0, focusScore: null, honestEmpty: false, chartDemo: true };
    }

    const noLogs = !logs.length;
    if (noLogs) {
      return rangeKey === "week" ? buildEmptyWeekData() : buildEmptyMonthData();
    }

    const today = startOfToday();
    const byDay = new Map();
    for (const log of logs) {
      if (!log || typeof log.ts !== "number") continue;
      const dayKey = toDayKey(new Date(log.ts));
      const m = typeof log.minutes === "number" ? log.minutes : 0;
      const existing = byDay.get(dayKey) || { focusMinutes: 0, sessions: 0 };
      existing.focusMinutes += m;
      existing.sessions += 1;
      byDay.set(dayKey, existing);
    }

    if (rangeKey === "week") {
      const dates = [];
      for (let offset = 6; offset >= 0; offset -= 1) {
        const d = new Date(today);
        d.setDate(d.getDate() - offset);
        dates.push(d);
      }

      const labels = dates.map((d) => d.toLocaleString("en-US", { weekday: "short" }));
      const focusMinutes = dates.map((d) => byDay.get(toDayKey(d))?.focusMinutes || 0);
      const sessions = dates.map((d) => byDay.get(toDayKey(d))?.sessions || 0);

      return {
        labels,
        focusMinutes,
        sessions,
        streakDays: computeStreakDays(logs),
        focusScore: computeFocusScore(rangeKey, logs),
        honestEmpty: false,
        chartDemo: false,
      };
    }

    // Month: last 28 days in four 7-day buckets (W1–W4).
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
      focusScore: computeFocusScore(rangeKey, logs),
      honestEmpty: false,
      chartDemo: false,
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

  function showTooltipContent(html) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
  }

  function moveTooltip(clientX, clientY) {
    const pad = 10;
    let x = clientX;
    let y = clientY;
    for (let i = 0; i < 2; i++) {
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      void tooltip.offsetWidth;
      const r = tooltip.getBoundingClientRect();
      let nx = x;
      let ny = y;
      if (r.right > window.innerWidth - pad) nx -= r.right - (window.innerWidth - pad);
      if (r.left < pad) nx += pad - r.left;
      if (r.bottom > window.innerHeight - pad) ny -= r.bottom - (window.innerHeight - pad);
      if (r.top < pad) ny += pad - r.top;
      if (nx === x && ny === y) break;
      x = nx;
      y = ny;
    }
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

    if (kpiScore && kpiScoreSub) {
      const fs = d.focusScore;
      if (!fs) {
        kpiScore.textContent = "—";
        kpiScoreSub.textContent = "build consistency";
      } else {
        kpiScore.textContent = `${fs.score}`;
        kpiScoreSub.textContent = `${fs.activeDays}/${fs.windowDays} days active`;
      }
    }
  }

  function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function svgEl(name) {
    return document.createElementNS("http://www.w3.org/2000/svg", name);
  }

  function renderLine(d) {
    console.log("[pomo:debug] initProgress.renderLine", { labels: d?.labels?.length });
    const W = 640;
    const H = 240;
    const pad = 26;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2;

    const values = d.sessions;
    const maxV = Math.max(1, ...values);
    const minV = Math.min(0, ...values);

    const xFor = (i) => pad + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
    const yFor = (v) => pad + (1 - (v - minV) / (maxV - minV || 1)) * innerH;

    clearEl(gridG);
    const lines = 4;

    for (let i = 0; i <= lines; i++) {
      const y = pad + (i / lines) * innerH;
      const ln = svgEl("line");
      ln.setAttribute("x1", String(pad));
      ln.setAttribute("x2", String(W - pad));
      ln.setAttribute("y1", String(y));
      ln.setAttribute("y2", String(y));
      gridG.appendChild(ln);
    }

    const pts = values.map((v, i) => ({ x: xFor(i), y: yFor(v), v, label: d.labels[i] }));
    const dLine = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    linePath.setAttribute("d", dLine);

    const dArea = `${dLine} L ${(pad + innerW).toFixed(2)} ${(pad + innerH).toFixed(2)} L ${pad.toFixed(
      2
    )} ${(pad + innerH).toFixed(2)} Z`;

    areaPath.setAttribute("d", dArea);

    const len = linePath.getTotalLength();
    linePath.style.strokeDasharray = String(len);
    linePath.style.strokeDashoffset = String(len);
    void linePath.getBoundingClientRect();
    linePath.style.strokeDashoffset = "0";

    clearEl(pointsG);
    for (const p of pts) {
      const g = svgEl("g");
      g.classList.add("chart__point");

      const c = svgEl("circle");
      c.classList.add("chart__dot");
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      c.setAttribute("r", "5");

      const hit = svgEl("circle");
      hit.classList.add("chart__hit");
      hit.setAttribute("cx", String(p.x));
      hit.setAttribute("cy", String(p.y));
      hit.setAttribute("r", "14");
      hit.setAttribute("fill", "transparent");
      g.appendChild(c);
      g.appendChild(hit);
      g.addEventListener("pointerenter", (e) => {
        showTooltipContent(`<strong>${p.label}</strong><br/>${p.v} sessions`);
        moveTooltip(e.clientX, e.clientY);
      });
      g.addEventListener("pointermove", (e) => {
        moveTooltip(e.clientX, e.clientY);
      });
      g.addEventListener("pointerleave", hideTooltip);

      pointsG.appendChild(g);
    }

    lineCaption.textContent = d.chartDemo
      ? "Example data"
      : d.honestEmpty
        ? "No data yet"
        : range === "week"
          ? "Last 7 days"
          : "Last 4 weeks";
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
        showTooltipContent(`<strong>${d.labels[i]}</strong><br/>${v.toLocaleString()} focus minutes`);
        moveTooltip(e.clientX, e.clientY);
      });
      bar.addEventListener("pointermove", (e) => {
        moveTooltip(e.clientX, e.clientY);
      });
      bar.addEventListener("pointerleave", hideTooltip);

      barsPlot.appendChild(bar);

      const x = document.createElement("div");
      x.textContent = d.labels[i];
      barsX.appendChild(x);

      requestAnimationFrame(() => {
        const pct = (v / maxV) * 100;
        fill.style.setProperty("--h", `${pct.toFixed(2)}%`);
      });
    });

    barCaption.textContent = d.chartDemo
      ? "Example data"
      : d.honestEmpty
        ? "No data yet"
        : range === "week"
          ? "Focus minutes per day"
          : "Focus minutes per week";
  }

  function renderAll() {
    console.log("[pomo:debug] initProgress.renderAll", { range });
    const logs = safeLoadLogs();
    const d = getRangeData(range, logs);
    setKpis(d);
    renderLine(d);
    renderBars(d);
    setRecentList(logs);
    setProgressNote(logs);
  }

  const progressDemoInput = panel.querySelector("#progress-show-demo");
  if (progressDemoInput) {
    progressDemoInput.checked = useProgressDemo();
    progressDemoInput.addEventListener("change", () => {
      setProgressDemo(progressDemoInput.checked);
      hideTooltip();
      renderAll();
    });
  }

  panel.addEventListener("change", (e) => {
    console.log("[pomo:debug] initProgress panel change");
    const input = e.target.closest('input[name="progressRange"]');
    if (!input) return;
    range = input.value === "month" ? "month" : "week";
    hideTooltip();
    renderAll();
  });

  range = rangeInputs.find((i) => i.checked)?.value || range;
  for (const input of rangeInputs) input.checked = input.value === range;
  renderAll();

  document.addEventListener("pomoSessionLogged", () => {
    console.log("[pomo:debug] document pomoSessionLogged");
    renderAll();
  });

  document.addEventListener("pomoNameUpdated", () => {
    console.log("[pomo:debug] document pomoNameUpdated");
    renderAll();
  });

  window.addEventListener("scroll", hideTooltip, { passive: true });
  window.addEventListener("resize", hideTooltip);
}

