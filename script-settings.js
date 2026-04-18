function initSettings() {
  console.log("[pomo:debug] initSettings");
  const panel = document.querySelector('#panel-settings[data-panel="settings"]');
  if (!panel) return;
  if (panel.dataset.settingsInit === "true") return;
  panel.dataset.settingsInit = "true";

  const NAME_KEY = "pomoName";
  const LOGS_KEY = "pomoLogs";

  const nameInput = panel.querySelector("#settings-name");
  const statusEl = panel.querySelector("#settings-name-status");
  const saveBtn = panel.querySelector('button[data-action="saveName"]');
  const clearBtn = panel.querySelector('button[data-action="clearName"]');
  const exportBtn = panel.querySelector('button[data-action="exportLogs"]');
  const importBtn = panel.querySelector('button[data-action="importLogs"]');
  const importFileInput = panel.querySelector("#settings-import-logs");
  const dataStatusEl = panel.querySelector("#settings-data-status");
  const resetAllBtn = panel.querySelector('button[data-action="resetAll"]');

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

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
  }

  function setDataStatus(text) {
    if (!dataStatusEl) return;
    dataStatusEl.textContent = text || "";
  }

  function normalizeImportedLogs(parsed) {
    if (!Array.isArray(parsed)) {
      return { error: "The file must be a JSON array of session objects." };
    }
    const rows = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      if (typeof item.ts !== "number" || !Number.isFinite(item.ts)) continue;
      const title = typeof item.title === "string" ? item.title.slice(0, 80) : "Pomodoro";
      const minutes =
        typeof item.minutes === "number" && Number.isFinite(item.minutes)
          ? Math.max(0, Math.round(item.minutes))
          : 25;
      const sounds = Array.isArray(item.sounds) ? item.sounds.filter((s) => typeof s === "string") : [];
      const type = item.type === "break" ? "break" : "focus";
      rows.push({ ts: item.ts, title, minutes, sounds, type });
    }
    if (!rows.length) {
      return { error: "No valid sessions found. Each entry needs a numeric ts (timestamp)." };
    }
    rows.sort((a, b) => a.ts - b.ts);
    return { logs: rows.slice(-500) };
  }

  if (nameInput) nameInput.value = safeLoadName();

  saveBtn?.addEventListener("click", () => {
    safeSaveName(nameInput?.value || "");
    if (nameInput) nameInput.value = safeLoadName();
    setStatus("Saved");
    document.dispatchEvent(new CustomEvent("pomoNameUpdated"));
  });

  clearBtn?.addEventListener("click", () => {
    safeSaveName("");
    if (nameInput) nameInput.value = "";
    setStatus("Cleared");
    document.dispatchEvent(new CustomEvent("pomoNameUpdated"));
  });

  exportBtn?.addEventListener("click", () => {
    try {
      const raw = localStorage.getItem(LOGS_KEY) || "[]";
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pomo-logs-${new Date().toISOString().slice(0, 10)}.json`;
      a.rel = "noopener";
      a.click();
      URL.revokeObjectURL(url);
      setDataStatus("Download started.");
    } catch {
      setDataStatus("Could not export logs.");
    }
  });

  importBtn?.addEventListener("click", () => {
    importFileInput?.click();
  });

  importFileInput?.addEventListener("change", () => {
    const file = importFileInput.files?.[0];
    importFileInput.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed = JSON.parse(text);
        const result = normalizeImportedLogs(parsed);
        if (result.error) {
          setDataStatus(result.error);
          return;
        }
        if (
          !window.confirm(
            "Replace all current session logs with this file? You cannot undo this (export first if you need a backup)."
          )
        ) {
          setDataStatus("Import canceled.");
          return;
        }
        localStorage.setItem(LOGS_KEY, JSON.stringify(result.logs));
        setDataStatus(`Imported ${result.logs.length} session(s).`);
        document.dispatchEvent(new CustomEvent("pomoSessionLogged"));
      } catch {
        setDataStatus("Could not read that file. Use a JSON export from this app.");
      }
    };
    reader.onerror = () => setDataStatus("Could not read the file.");
    reader.readAsText(file);
  });

  let confirmModal = document.querySelector("[data-modal-root='resetAllConfirm']");
  if (!confirmModal) {
    confirmModal = document.createElement("div");
    confirmModal.setAttribute("data-modal-root", "resetAllConfirm");
    confirmModal.className = "modal";
    confirmModal.hidden = true;
    confirmModal.innerHTML = `
      <div class="modal__backdrop" data-modal="close" aria-hidden="true"></div>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-label="Reset all data confirmation">
        <div class="modal__title">Reset all saved data?</div>
        <div class="muted small">This clears your name, logs, and settings.</div>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-modal="cancel">Cancel</button>
          <button type="button" class="btn" data-modal="confirm">Yes, reset</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);
  }

  let progressModal = document.querySelector("[data-modal-root='resetAllProgress']");
  if (!progressModal) {
    progressModal = document.createElement("div");
    progressModal.setAttribute("data-modal-root", "resetAllProgress");
    progressModal.className = "modal";
    progressModal.hidden = true;
    progressModal.innerHTML = `
      <div class="modal__backdrop" aria-hidden="true"></div>
      <div class="modal__panel modal__panel--lite" role="dialog" aria-modal="true" aria-label="Resetting data">
        <div class="modal__title muted small">Resetting</div>
        <div class="modal__message">Starting fresh</div>
      </div>
    `;
    document.body.appendChild(progressModal);
  }

  function runResetAll() {
    closeModalWithA11y(confirmModal);
    openModalWithA11y(progressModal, null);
    setTimeout(() => {
      closeModalWithA11y(progressModal);
      try {
        localStorage.clear();
      } catch {
        // ignore
      }
      location.reload();
    }, 2500);
  }

  resetAllBtn?.addEventListener("click", () => openModalWithA11y(confirmModal, 'button[data-modal="cancel"]'));

  if (confirmModal && !confirmModal.dataset.bound) {
    confirmModal.dataset.bound = "true";
    confirmModal.addEventListener("click", (e) => {
      const action = e.target.closest("[data-modal]")?.getAttribute("data-modal");
      if (!action) return;
      if (action === "close" || action === "cancel") return closeModalWithA11y(confirmModal);
      if (action === "confirm") return runResetAll();
    });
    confirmModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModalWithA11y(confirmModal);
      if (e.key === "Enter") runResetAll();
    });
  }
}

