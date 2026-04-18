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
  const progressRing = panel.querySelector("#pomo-ring-progress");
  const textLabel = panel.querySelector("#pomo-task-label");
  const clockLabel = panel.querySelector("#pomo-task-label-clock");

  const toggleBtn = panel.querySelector('button[data-action="toggle"]');
  const resetBtn = panel.querySelector('button[data-action="reset"]');
  const displayInputs = Array.from(panel.querySelectorAll('input[name="displayMode"]'));

  // Session fields used when logging a completed focus block.
  const taskInput = panel.querySelector("#pomo-task");
  const previewEl = panel.querySelector("#pomo-preview");
  const sessionForm = panel.querySelector(".session-form");
  const soundInputs = Array.from(panel.querySelectorAll('input[name="pomoSound"]'));
  const LOGS_KEY = "pomoLogs";
  const SOUNDS_KEY = "pomoSounds";
  const VOLUME_KEY = "pomoVolume";
  const NUDGES_KEY = "pomoNudges";
  const TOP3_KEY = "pomoTop3";
  const FOCUSMODE_KEY = "pomoFocusMode";
  const NAME_KEY = "pomoName";

  // Load logs from localStorage.
  function safeLoadLogs() {
    console.log("[pomo:debug] initPomodoro.safeLoadLogs");
    try {
      const parsed = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Write logs to localStorage.
  function safeSaveLogs(logs) {
    console.log("[pomo:debug] initPomodoro.safeSaveLogs", { count: logs?.length });
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }

  function getSelectedSounds() {
    console.log("[pomo:debug] initPomodoro.getSelectedSounds");
    return soundInputs.filter((i) => i.checked).map((i) => i.value);
  }

  // SVG ring geometry (must match index.html: r="92", stroke-width="10")
  const RING_R = 92;
  const RING_STROKE = 10;
  const RING_LEN = 2 * Math.PI * RING_R;
  const RING_DASH_OPEN_MAX = Math.max(0, RING_LEN - RING_STROKE);

  if (
    !textBlock ||
    !clockBlock ||
    !timeText ||
    !timeClock ||
    !ring ||
    !progressRing ||
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
  let breakSuggestion = "";
  let pendingReflectionTs = null;

  let totalSeconds = FOCUS_SECONDS;
  let remainingSeconds = FOCUS_SECONDS;
  let tickId = null;
  let endAt = null;

  let activeTitle = "Pomodoro";
  let activeSounds = [];
  let focusModeEnabled = false;
  /** Empty-task prompt: hide until Reset after dismiss. */
  let intentBypassEmptyTask = false;

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

    // Ring progress: stroke dash from elapsed fraction (matches SVG circle geometry).
    const t = Math.min(1, Math.max(0, elapsedFrac));
    const dash = t >= 1 ? RING_LEN : t * RING_DASH_OPEN_MAX;
    progressRing.style.stroke = `hsl(${hue} 92% 58%)`;
    progressRing.style.strokeDasharray = `${dash} ${RING_LEN}`;
    progressRing.style.strokeDashoffset = "0";
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
    panel.classList.remove("pomo-running");
  }

  // Web Audio: create tones when a session completes.
  let audioCtx = null;
  let currentTone = null;
  let volumeScalar = 0.2;

  function clamp01(n) {
    const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
    return Math.max(0, Math.min(1, x));
  }

  function safeLoadVolume() {
    try {
      const raw = Number(localStorage.getItem(VOLUME_KEY));
      return clamp01(Number.isFinite(raw) ? raw : 0.2);
    } catch {
      return 0.2;
    }
  }

  function safeSaveVolume(v) {
    try {
      localStorage.setItem(VOLUME_KEY, String(clamp01(v)));
    } catch {
      // ignore
    }
  }

  function stopCurrentTone() {
    if (!currentTone) return;
    try {
      currentTone.osc.onended = null;
      currentTone.osc.stop();
    } catch {
      // ignore
    }
    try {
      currentTone.osc.disconnect();
    } catch {
      // ignore
    }
    try {
      currentTone.gain.disconnect();
    } catch {
      // ignore
    }
    currentTone = null;
  }
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

    // Limit playback to 1 concurrent sound.
    stopCurrentTone();

    const t0 = ctx.currentTime + 0.01;
    const duration = durationMs / 1000;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);

    const v = clamp01(volume) * clamp01(volumeScalar);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(v, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);

    currentTone = { osc, gain };
    osc.onended = () => {
      if (currentTone?.osc === osc) currentTone = null;
    };
  }

  function playSoundPreset(soundKey) {
    console.log("[pomo:debug] initPomodoro.playSoundPreset", { soundKey });
    // Short tones; no external audio files.
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

  // Inline rows: intent, nudge, reflection (injected next to timer actions).
  const timerCol = toggleBtn?.closest(".card") || panel;
  const actionsRow = toggleBtn?.closest(".actions");
  const timerControls = panel.querySelector(".timer__controls");

  const intentEl = document.createElement("div");
  intentEl.className = "pomo-inline pomo-inline--intent muted small";
  intentEl.hidden = true;
  intentEl.innerHTML =
    'What are you working on? <button type="button" class="linklike" data-pomo-intent="anyway">Focus anyway</button>';

  const nudgeEl = document.createElement("div");
  nudgeEl.className = "pomo-inline pomo-inline--nudge muted small";
  nudgeEl.hidden = true;
  nudgeEl.innerHTML =
    '<span data-pomo-nudge-text></span> <button type="button" class="linklike" data-pomo-nudge="dismiss" aria-label="Dismiss nudge">Dismiss</button>';

  const reflectionEl = document.createElement("div");
  reflectionEl.className = "pomo-reflect";
  reflectionEl.hidden = true;
  reflectionEl.innerHTML = `
    <div class="pomo-reflect__label muted small">How did that session go?</div>
    <div class="pomo-reflect__row" role="group" aria-label="Session reflection">
      <button type="button" class="pill" data-reflect="focused">Focused</button>
      <button type="button" class="pill" data-reflect="partial">Partially</button>
      <button type="button" class="pill" data-reflect="distracted">Distracted</button>
    </div>
  `;

  if (actionsRow) {
    actionsRow.insertAdjacentElement("afterend", intentEl);
    intentEl.insertAdjacentElement("afterend", nudgeEl);
    nudgeEl.insertAdjacentElement("afterend", reflectionEl);
  } else if (timerCol) {
    timerCol.appendChild(intentEl);
    timerCol.appendChild(nudgeEl);
    timerCol.appendChild(reflectionEl);
  }

  function todayKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function safeLoadJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function safeSaveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }

  function safeLoadName() {
    try {
      const raw = (localStorage.getItem(NAME_KEY) || "").trim();
      return raw ? raw.slice(0, 24) : "";
    } catch {
      return "";
    }
  }

  function safeSaveName(name) {
    try {
      const clean = (name || "").toString().trim().slice(0, 24);
      if (!clean) localStorage.removeItem(NAME_KEY);
      else localStorage.setItem(NAME_KEY, clean);
    } catch {
      // ignore
    }
  }

  let userName = safeLoadName();

  // Name modal; value stored in localStorage.
  let nameModal = document.querySelector("[data-modal-root='name']");
  if (!nameModal) {
    nameModal = document.createElement("div");
    nameModal.setAttribute("data-modal-root", "name");
    nameModal.className = "modal";
    nameModal.hidden = true;
    nameModal.innerHTML = `
      <div class="modal__backdrop" data-modal="close" aria-hidden="true"></div>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-label="Personalization">
        <div class="modal__title">What should I call you?</div>
        <input class="field__input" type="text" inputmode="text" placeholder="Enter your name…" maxlength="24" />
        <div class="modal__actions">
          <button type="button" class="btn" data-modal="continue">Continue</button>
          <button type="button" class="btn btn--ghost" data-modal="skip">Skip</button>
        </div>
      </div>
    `;
    document.body.appendChild(nameModal);
  }

  function closeNameModal() {
    closeModalWithA11y(nameModal);
  }

  function openNameModal() {
    userName = safeLoadName();
    if (userName) return;
    openModalWithA11y(nameModal, "input");
  }

  if (nameModal && !nameModal.dataset.bound) {
    nameModal.dataset.bound = "true";
    nameModal.addEventListener("click", (e) => {
      const action = e.target.closest("[data-modal]")?.getAttribute("data-modal");
      if (!action) return;
      if (action === "close" || action === "skip") {
        closeNameModal();
        return;
      }
      if (action === "continue") {
        const input = nameModal.querySelector("input");
        const next = (input?.value || "").trim();
        safeSaveName(next);
        userName = safeLoadName();
        closeNameModal();
        if (userName && nudgeEl) {
          const text = nudgeEl.querySelector("[data-pomo-nudge-text]");
          if (text) text.textContent = `Nice, ${userName}. Let’s get started.`;
          nudgeEl.hidden = false;
        }
      }
    });
    nameModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNameModal();
      if (e.key === "Enter") {
        const btn = nameModal.querySelector('button[data-modal="continue"]');
        btn?.click?.();
      }
    });
  }

  // Reset: confirmation modal, phrase modal, then reset().
  const RESET_PHRASES = [
    "You can do this",
    "Start fresh and keep going",
    "Progress is never wasted",
    "One step at a time",
    "Stay consistent you are improving",
    "Keep showing up it matters",
    "Reset and refocus your energy",
    "You are building something great",
    "Small steps lead to big wins",
    "Try again you are getting better",
  ];

  let resetConfirmModal = document.querySelector("[data-modal-root='resetConfirm']");
  if (!resetConfirmModal) {
    resetConfirmModal = document.createElement("div");
    resetConfirmModal.setAttribute("data-modal-root", "resetConfirm");
    resetConfirmModal.className = "modal";
    resetConfirmModal.hidden = true;
    resetConfirmModal.innerHTML = `
      <div class="modal__backdrop" data-modal="close" aria-hidden="true"></div>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-label="Reset confirmation">
        <div class="modal__title">Do you really want to reset?</div>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-modal="cancel">Cancel</button>
          <button type="button" class="btn" data-modal="confirmReset">Yes, reset</button>
        </div>
      </div>
    `;
    document.body.appendChild(resetConfirmModal);
  }

  let resetPhraseModal = document.querySelector("[data-modal-root='resetPhrase']");
  if (!resetPhraseModal) {
    resetPhraseModal = document.createElement("div");
    resetPhraseModal.setAttribute("data-modal-root", "resetPhrase");
    resetPhraseModal.className = "modal";
    resetPhraseModal.hidden = true;
    resetPhraseModal.innerHTML = `
      <div class="modal__backdrop" aria-hidden="true"></div>
      <div class="modal__panel modal__panel--lite" role="dialog" aria-modal="true" aria-label="Reset message">
        <div class="modal__title muted small">Resetting</div>
        <div class="modal__message" data-reset-phrase></div>
      </div>
    `;
    document.body.appendChild(resetPhraseModal);
  }

  let resetPhraseTimeoutId = null;

  function pickResetPhrase() {
    const idx = Math.floor(Math.random() * RESET_PHRASES.length);
    return RESET_PHRASES[idx] || RESET_PHRASES[0];
  }

  function runResetFlow() {
    closeModalWithA11y(resetConfirmModal);
    const phrase = pickResetPhrase();
    const slot = resetPhraseModal?.querySelector("[data-reset-phrase]");
    if (slot) slot.textContent = phrase;
    openModalWithA11y(resetPhraseModal, null);
    if (resetPhraseTimeoutId) clearTimeout(resetPhraseTimeoutId);
    resetPhraseTimeoutId = setTimeout(() => {
      resetPhraseTimeoutId = null;
      closeModalWithA11y(resetPhraseModal);
      reset();
    }, 2500);
  }

  function openResetConfirm() {
    openModalWithA11y(resetConfirmModal, 'button[data-modal="cancel"]');
  }

  if (resetConfirmModal && !resetConfirmModal.dataset.bound) {
    resetConfirmModal.dataset.bound = "true";
    resetConfirmModal.addEventListener("click", (e) => {
      const action = e.target.closest("[data-modal]")?.getAttribute("data-modal");
      if (!action) return;
      if (action === "close" || action === "cancel") return closeModalWithA11y(resetConfirmModal);
      if (action === "confirmReset") return runResetFlow();
    });
    resetConfirmModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModalWithA11y(resetConfirmModal);
      if (e.key === "Enter") runResetFlow();
    });
  }

  if (resetPhraseModal && !resetPhraseModal.dataset.keybound) {
    resetPhraseModal.dataset.keybound = "true";
    resetPhraseModal.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (resetPhraseTimeoutId) {
        clearTimeout(resetPhraseTimeoutId);
        resetPhraseTimeoutId = null;
      }
      closeModalWithA11y(resetPhraseModal);
      reset();
    });
  }

  // Focus mode: hides secondary UI while the timer runs.
  focusModeEnabled = Boolean(safeLoadJson(FOCUSMODE_KEY, false));
  panel.classList.toggle("pomo-focusmode", focusModeEnabled);
  if (timerControls) {
    const row = document.createElement("div");
    row.className = "pomo-toggles";
    row.innerHTML = `
      <label class="toggle">
        <input class="toggle__input" type="checkbox" ${focusModeEnabled ? "checked" : ""} />
        <span class="toggle__label">Focus mode</span>
      </label>
    `;
    timerControls.insertAdjacentElement("afterend", row);
    const cb = row.querySelector(".toggle__input");
    cb?.addEventListener("change", () => {
      focusModeEnabled = Boolean(cb.checked);
      safeSaveJson(FOCUSMODE_KEY, focusModeEnabled);
      panel.classList.toggle("pomo-focusmode", focusModeEnabled);
    });
  }

  // Top 3 tasks list; persisted in localStorage.
  function normalizeTop3(raw) {
    const fallback = [
      { text: "", done: false },
      { text: "", done: false },
      { text: "", done: false },
    ];
    if (!Array.isArray(raw)) return fallback;
    const out = raw
      .slice(0, 3)
      .map((x) => ({ text: (x?.text || "").toString().slice(0, 80), done: Boolean(x?.done) }));
    while (out.length < 3) out.push({ text: "", done: false });
    return out;
  }

  function renderTop3(container, items) {
    container.innerHTML = "";
    items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "top3__row";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "top3__check";
      check.checked = Boolean(item.done);
      check.setAttribute("aria-label", `Mark task ${idx + 1} done`);

      const input = document.createElement("input");
      input.type = "text";
      input.className = "top3__input";
      input.value = item.text || "";
      input.placeholder = `Task ${idx + 1}`;
      input.maxLength = 80;

      const applyDone = () => {
        row.dataset.done = check.checked ? "true" : "false";
      };
      applyDone();

      const save = () => {
        const next = items.map((x) => ({ ...x }));
        next[idx] = { text: input.value, done: check.checked };
        items.splice(0, items.length, ...normalizeTop3(next));
        safeSaveJson(TOP3_KEY, items);
      };

      check.addEventListener("change", () => {
        applyDone();
        save();
      });
      input.addEventListener("input", save);

      row.appendChild(check);
      row.appendChild(input);
      container.appendChild(row);
    });
  }

  if (sessionForm) {
    const top3Field = document.createElement("div");
    top3Field.className = "field";
    top3Field.innerHTML = `
      <div class="field__label">Top 3 today</div>
      <div class="top3" aria-label="Top 3 tasks"></div>
    `;
    sessionForm.appendChild(top3Field);
    const items = normalizeTop3(safeLoadJson(TOP3_KEY, null));
    const top3El = top3Field.querySelector(".top3");
    if (top3El) renderTop3(top3El, items);
  }

  function computeBestStreakDays(logs) {
    if (!Array.isArray(logs) || !logs.length) return 0;
    const byDay = new Set();
    for (const log of logs) {
      if (!log || typeof log.ts !== "number") continue;
      const d = new Date(log.ts);
      d.setHours(0, 0, 0, 0);
      byDay.add(d.getTime());
    }
    const days = Array.from(byDay).sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    for (let i = 0; i < days.length; i++) {
      if (i === 0 || days[i] - days[i - 1] === 86400000) run += 1;
      else run = 1;
      best = Math.max(best, run);
    }
    return best;
  }

  function maybeShowNudge() {
    const logs = safeLoadLogs();
    const streak = (() => {
      if (!logs.length) return 0;
      const byDay = new Set();
      for (const log of logs) {
        if (!log || typeof log.ts !== "number") continue;
        const d = new Date(log.ts);
        d.setHours(0, 0, 0, 0);
        byDay.add(d.getTime());
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let cursor = today.getTime();
      let s = 0;
      while (byDay.has(cursor)) {
        s += 1;
        cursor -= 86400000;
      }
      return s;
    })();
    const best = computeBestStreakDays(logs);

    const meta = safeLoadJson(NUDGES_KEY, { dismissedDay: null });
    if (meta?.dismissedDay === todayKey()) {
      nudgeEl.hidden = true;
      return;
    }

    const namePrefix = userName ? `${userName}, ` : "";
    let msg = `${namePrefix}start with just one session.`;
    msg = msg[0].toUpperCase() + msg.slice(1);
    if (streak > 0 && best > 0 && streak + 1 >= best) msg = `You’re close to your best streak${userName ? `, ${userName}` : ""}.`;
    if (streak >= best && streak >= 3) msg = `Nice rhythm${userName ? `, ${userName}` : ""}—keep it simple and steady.`;

    const text = nudgeEl.querySelector("[data-pomo-nudge-text]");
    if (text) text.textContent = msg;
    nudgeEl.hidden = false;
  }

  if (nudgeEl) {
    const dismissBtn = nudgeEl.querySelector('button[data-pomo-nudge="dismiss"]');
    dismissBtn?.addEventListener("click", () => {
      safeSaveJson(NUDGES_KEY, { dismissedDay: todayKey() });
      nudgeEl.hidden = true;
    });
  }

  if (intentEl) {
    intentEl.addEventListener("click", (e) => {
      const btn = e.target.closest('button[data-pomo-intent="anyway"]');
      if (!btn) return;
      intentBypassEmptyTask = true;
      intentEl.hidden = true;
      startTicking();
    });
  }

  if (reflectionEl) {
    reflectionEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-reflect]");
      if (!btn) return;
      const val = btn.getAttribute("data-reflect");
      const ts = pendingReflectionTs;
      pendingReflectionTs = null;
      reflectionEl.hidden = true;
      if (!ts) return;

      const logs = safeLoadLogs();
      const idx = logs.findIndex((l) => l && typeof l.ts === "number" && l.ts === ts);
      if (idx >= 0) {
        logs[idx] = { ...logs[idx], reflection: val };
        safeSaveLogs(logs.slice(-500));
        document.dispatchEvent(new CustomEvent("pomoSessionLogged"));
      }
    });
  }

  // Volume slider injected next to sound options.
  volumeScalar = safeLoadVolume();
  if (sessionForm) {
    const field = document.createElement("div");
    field.className = "field";

    const label = document.createElement("div");
    label.className = "field__label";
    label.textContent = "Volume";

    const wrap = document.createElement("div");
    wrap.className = "range";

    const input = document.createElement("input");
    input.className = "range__input";
    input.type = "range";
    input.min = "0";
    input.max = "1";
    input.step = "0.01";
    input.value = String(volumeScalar);
    input.setAttribute("aria-label", "Completion sound volume");

    const value = document.createElement("div");
    value.className = "range__value muted small";
    value.textContent = `${Math.round(volumeScalar * 100)}%`;

    input.addEventListener("input", () => {
      volumeScalar = clamp01(Number(input.value));
      safeSaveVolume(volumeScalar);
      value.textContent = `${Math.round(volumeScalar * 100)}%`;
    });

    wrap.appendChild(input);
    wrap.appendChild(value);
    field.appendChild(label);
    field.appendChild(wrap);

    // After the sound picker field.
    const soundPicker = sessionForm.querySelector(".sound-picker");
    const after = soundPicker?.closest(".field") || soundPicker?.parentElement;
    if (after && after.parentElement) after.parentElement.insertBefore(field, after.nextSibling);
    else sessionForm.appendChild(field);
  }

  // Log a completed focus session.
  function logCompletedSession(minutesOverride) {
    console.log("[pomo:debug] initPomodoro.logCompletedSession", { minutesOverride });
    const logs = safeLoadLogs();
    const minutes =
      typeof minutesOverride === "number" && Number.isFinite(minutesOverride)
        ? Math.max(1, Math.round(minutesOverride))
        : Math.max(1, Math.round(FOCUS_SECONDS / 60));
    const title = activeTitle || "Pomodoro";
    const sounds = Array.isArray(activeSounds) ? activeSounds : [];

    const ts = Date.now();
    logs.push({
      ts,
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
        detail: { title, minutes, sounds, ts },
      })
    );
    return ts;
  }

  function updatePhaseLabels() {
    const next = phase === "break" ? "Break" : "Focus";
    const focusIndex = Math.min(FOCUS_GOAL, focusCompletedCount + (phase === "focus" ? 1 : 0));
    const suffix = phase === "focus" ? ` ${focusIndex}/${FOCUS_GOAL}` : "";

    const extra = phase === "break" && breakSuggestion ? ` • ${breakSuggestion}` : "";
    if (textLabel) textLabel.textContent = `${next}${suffix}${extra}`;
    if (clockLabel) clockLabel.textContent = `${next}${suffix}${extra}`;
  }

  function setPhase(nextPhase, opts = {}) {
    const { keepRemaining = false } = opts;
    console.log("[pomo:debug] initPomodoro.setPhase", { nextPhase, keepRemaining });
    phase = nextPhase;

    if (phase === "focus") totalSeconds = FOCUS_SECONDS;
    else if (phase === "break") {
      totalSeconds = BREAK_SECONDS;
      const suggestions = ["Stretch", "Drink water", "Look away 20s", "Stand up"];
      breakSuggestion = suggestions[focusCompletedCount % suggestions.length] || "";
    }
    else totalSeconds = FOCUS_SECONDS;

    if (!keepRemaining) remainingSeconds = totalSeconds;
    updatePhaseLabels();
    render();
  }

  function handlePhaseComplete() {
    console.log("[pomo:debug] initPomodoro.handlePhaseComplete", { phase, focusCompletedCount });
    if (phase === "focus") {
      focusCompletedCount += 1;
      const loggedTs = logCompletedSession(FOCUS_SECONDS / 60);
      playSelectedSounds(activeSounds);

      if (focusCompletedCount < FOCUS_GOAL) {
        setPhase("break");
        startTicking();
        return;
      }

      // Fourth focus done: show reflection, then reset to initial focus state.
      pendingReflectionTs = loggedTs || null;
      if (reflectionEl) reflectionEl.hidden = false;
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
    panel.classList.add("pomo-running");
    // Refresh session title and sounds when starting a focus block.
    if (phase === "focus") {
      activeTitle = (taskInput?.value || "").trim() || "Pomodoro";
      activeSounds = getSelectedSounds();
      ensureAudio();
    }
    // endAt wall-clock target to limit timer drift.
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
        // Refresh labels after pause mid-phase.
        updatePhaseLabels();
      }
      // Empty task: show intent prompt unless bypassed for this run.
      if (phase === "focus") {
        const title = (taskInput?.value || "").trim();
        if (!title && !intentBypassEmptyTask) {
          intentEl.hidden = false;
          taskInput?.focus?.();
          return;
        }
      }
      intentEl.hidden = true;
      startTicking();
    }
  }

  function reset() {
    console.log("[pomo:debug] initPomodoro.reset");
    stopAll();
    focusCompletedCount = 0;
    intentBypassEmptyTask = false;
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
      // Only one sound checkbox active at a time.
      if (input.checked) {
        for (const other of soundInputs) {
          if (other !== input) other.checked = false;
        }
      }
      localStorage.setItem(SOUNDS_KEY, JSON.stringify(getSelectedSounds()));
      updateSessionPreview();
    });
  }

  panel.addEventListener("change", (e) => {
    console.log("[pomo:debug] initPomodoro panel change");
    const input = e.target.closest('input[name="displayMode"]');
    if (!input) return;
    setDisplayMode(input.value);
  });

  // Delegated handlers on the panel.
  panel.addEventListener("click", (e) => {
    console.log("[pomo:debug] initPomodoro panel click");
    const actionBtn = e.target.closest("button[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.getAttribute("data-action");
    if (action === "toggle") toggleRun();
    if (action === "reset") openResetConfirm();
  });

  setPhase("focus");
  render();
  maybeShowNudge();
  openNameModal();
}

