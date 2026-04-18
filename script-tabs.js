function focusPanelFromTab(tabEl) {
  const panelId = tabEl?.getAttribute("aria-controls");
  if (!panelId) return;
  const panel = document.querySelector(`#${CSS.escape(panelId)}`);
  panel?.focus?.({ preventScroll: true });
}

let tabSwitchGeneration = 0;

function setActiveTab(nextTabEl) {
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

  const nextId = nextTabEl?.dataset?.tab;
  if (!nextId) return;

  const stickyCta = document.querySelector("#start-focusing-sticky");
  if (stickyCta) stickyCta.hidden = nextId === "pomodoro";

  for (const tab of tabs) {
    const selected = tab === nextTabEl;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  }

  for (const panel of panels) {
    const isTarget = panel.dataset.panel === nextId;
    panel.hidden = !isTarget;
  }

  const gen = ++tabSwitchGeneration;
  requestAnimationFrame(() => {
    if (gen !== tabSwitchGeneration) return;
    if (nextId === "pomodoro") initPomodoro();
    if (nextId === "progress") initProgress();
    if (nextId === "settings") initSettings();
  });
}

function focusTabByIndex(tabs, idx) {
  const clamped = ((idx % tabs.length) + tabs.length) % tabs.length;
  tabs[clamped].focus({ preventScroll: true });
}

function initTabs() {
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  if (tabs.length === 0) return;

  tablist.addEventListener("click", (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    setActiveTab(tab);
    focusPanelFromTab(tab);
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="startFocusing"]');
    if (!btn) return;
    const pomoTab = document.querySelector('[role="tab"][data-tab="pomodoro"]');
    if (!pomoTab) return;
    setActiveTab(pomoTab);
    focusPanelFromTab(pomoTab);
  });

  tablist.addEventListener("keydown", (e) => {
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
        focusPanelFromTab(tab);
        break;
      }
      default:
        break;
    }
  });
}

