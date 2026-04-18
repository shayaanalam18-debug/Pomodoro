# Pomodoro Research & Development

Single-page site: Pomodoro background, a browser-local timer app, and a progress dashboard (week or month view).

- Five top-level tabs: Intro, Research, Pomodoro App, Progress Tracker, Resources, Settings
- Pomodoro timer with Text and Clock display modes
- Progress Tracker with charts (line + bar) driven by stored session logs

## Run locally

From the project folder, with Python 3:

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173` in a browser.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Structure: tabs, panels, markup |
| `styles.css` | Layout, components, timer, charts, tooltip |
| `script-modal.js` | Modal focus / keyboard handling |
| `script-tabs.js` | Tab navigation |
| `script-pomodoro.js` | Timer, sounds, session logging |
| `script-progress.js` | Progress charts and KPIs |
| `script-settings.js` | Name, export/import logs, reset |
| `script-main.js` | Startup order |
| `script.js` | Legacy bundle (not loaded by `index.html` if split scripts are used) |

Keyboard: Left/Right arrows move between tabs; Home/End jump to first/last; Enter/Space activates the focused tab.

## Pomodoro timer

One shared timer state; switching display mode only toggles visible UI.

### Pomodoro panel selectors

- Display mode: `input[name="displayMode"]` — `text` or `clock`
- Text: `.timer--text[data-display="text"]`
- Clock: `.timer--clock[data-display="clock"]`
- `button[data-action="toggle"]` — Start/Pause
- `button[data-action="reset"]` — Reset

### Behavior (split scripts / `script-pomodoro.js`)

- `initPomodoro()` runs after load and when the Pomodoro tab is opened (lazy init).
- Timing uses `endAt = Date.now() + remainingSeconds * 1000` and recomputes from `Date.now()` on each tick.
- Display mode is persisted under `localStorage` key `pomoDisplayMode`.
- Data stays in the browser; it is not synced to a server.

### Clock mode ring

Clock mode uses an SVG circle; progress is updated with stroke dash and hue in JS (see `setProgress` in `script-pomodoro.js`). The README previously described a `conic-gradient` ring; the current implementation matches `index.html` + `script-pomodoro.js`.

## Progress Tracker

- Range: `input[name="progressRange"]` — `week` or `month`
- KPIs: `#kpi-focus`, `#kpi-sessions`, `#kpi-streak` (and optional focus score)
- Line chart: `#chart-line` (SVG path + points)
- Bars: `#chart-bars` (div-based, `--h` height)
- Tooltip: `#progress-tooltip`

Hover points/bars for values; changing week/month re-renders series.

### Implementation

- Line: SVG `path` `d` from points; draw animation via `stroke-dasharray` / `stroke-dashoffset`.
- Bars: div columns; height from CSS variable `--h` with transitions.

## Debugging

`console.log("[pomo:debug]", …)` appears on init and main flows; omitted on hot paths (timer tick, hover, scroll/resize) to limit console noise.

## Customization

- Focus length: `FOCUS_SECONDS` in `script-pomodoro.js` (or `script.js` if using the monolithic file).
- Progress demo: `pomoProgressDemo` in `localStorage` toggles sample chart data.
