# Pomodoro Research & Development

This is a single-page site with some background on Pomodoro research; a localized app that stores your data on your browser; and a progress tracker to track your progress over a week or month:

- There are 5 Top **tab navigation** (Intro, Research, Pomodoro App, Progress Tracker, Resources)
- A working **Pomodoro timer** with **Text** and **Clock** display modes
- A **Progress Tracker** dashboard with **interactive, animated charts** to motivate you to continue using this pomodoro timer

## Run locally

If you are on a unix system, and have python 3 installed; use the following command from your project source folder to visualize the app during development:

```bash
python3 -m http.server 5173
```

Then open the following in a browser to access the app running in port 5173:

- `http://localhost:5173`

## Files
This app is bare bones (Html, CSS, javascript) and is not large enough yet to require splitting into too many files. Here are the files I have currently in the project (except this README.md)

- `index.html`: Page structure (tabs + panels + UI markup)
- `styles.css`: Styling (top tabs, cards, timer UI, charts, tooltip)
- `script.js`: Behavior (tabs logic, pomodoro timer logic, progress charts)

Keyboard controls are supported (who needs a mouse):

- Left/Right arrows: move focus between tabs
- Home/End: jump to first/last tab
- Enter/Space: activate focused tab

## Pomodoro timer

The timer runs as **one shared background state**. Switching display modes only hides/shows UI.

### UI elements (Pomodoro panel)

- Display mode radios: `input[name="displayMode"]` (`text` or `clock`)
- Text display: `.timer--text[data-display="text"]`
- Clock display: `.timer--clock[data-display="clock"]`
- Buttons:
  - Start/Pause: `button[data-action="toggle"]`
  - Reset: `button[data-action="reset"]`

### How it works (`script.js`)

- `initPomodoro()` is called on load and also lazily when the Pomodoro tab is opened.
- Timer accuracy: it uses an `endAt = Date.now() + remainingSeconds*1000` target and recalculates remaining time from `Date.now()` on each tick.
- Display mode persistence: The data from app runs is stored locally in browser storage in variable `localStorage` using key `pomoDisplayMode`.
- Your data is not shared among browsers on the device; or across devices.

### Clock mode “radian ring”

Clock mode is a CSS `conic-gradient` ring:

- `--p` is progress \(0 → 1\) = elapsed fraction
- `--h` is hue \(120 → 0\) so the ring shifts green → yellow → red as time elapses

The JS updates these on each tick via:

- `ring.style.setProperty("--p", ...)`
- `ring.style.setProperty("--h", ...)`

## Progress Tracker charts

The Progress tab is a dashboard with:

- Week/Month toggle: `input[name="progressRange"]`
- KPI cards: `#kpi-focus`, `#kpi-sessions`, `#kpi-streak`
- Line chart (SVG): `#chart-line`
- Bar chart (div-based): `#chart-bars`
- Tooltip: `#progress-tooltip`

### Interactions

- Hover chart points/bars to show a floating tooltip with exact values.
- Switching Week/Month re-renders charts and replays animations.

### Chart implementation notes

- Line chart:
  - Builds an SVG path `d` from data points
  - Animates draw-in using `stroke-dasharray` + `stroke-dashoffset`
  - Points are separate SVG circles with pointer events for tooltips
- Bar chart:
  - Renders bars as divs
  - Animates height using a CSS variable `--h` with transitions

## Debugging
- console.log statements have been used in the javascript code to track event firings based on actions performed.

## Customization possibilities

- **Pomodoro duration**: change `FOCUS_SECONDS` in `script.js`.
- **Progress data**: replace the `DATA` object in `initProgress()` with real tracked data.
- **Look & feel**: tweak CSS variables in `:root` in `styles.css`.

