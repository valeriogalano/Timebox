# Timebox Technical Guide

Timebox is a macOS-first desktop app for the maintainer's personal capacity planning, timeblocking, time tracking, billing review, and weekly review workflow. Windows and Linux packages are configured where Electron supports the same workflow, but platform-specific integrations must be explicit. It intentionally codifies a subjective process instead of a generic productivity methodology.

The product framing is capacity-first. Billing is a supporting workflow for billable areas, not the center of the app, and new features should make the maintainer's manual planning/review process visible in the GUI rather than turning the app into a generic productivity methodology or an agent-only automation layer.

This is also a vibe coding project: development is iterative and AI-assisted. Keep changes grounded in the existing code, verify behavior, and avoid broad rewrites unless the task explicitly calls for them.

Stack: **Electron 31 + React 18 + Vite 5 + better-sqlite3 12**.

---

## Install and Run

```bash
# First install. Node 25 has no better-sqlite3 prebuilds.
npm install --ignore-scripts
npm run rebuild          # compile better-sqlite3 for Electron 31 headers

# Development
npm start                # Vite dev server on 5173 + Electron

# Production renderer build
npm run build            # Vite -> renderer-dist/, then Electron loads renderer-dist/index.html

# Tests
npm test                 # rebuilds better-sqlite3 for Node, then runs node --test
npm run coverage:components   # copertura dei componenti React (Vitest + v8)
```

Coverage is measured in two halves, because the two suites run on different
runners. `c8` covers the Node side (`cli/`, `db/`, `lib/` and the logic modules
under `src/`) via the `node --test` suites. `npm run coverage:components` covers
`src/components/` and `src/screens/` via Vitest, and writes to
`coverage/components/`. The UI half sits around 10% today: it is low, but it is
measured, so a pull request that lowers it is visible.

Why `--ignore-scripts`: Node 25 is too recent for current `better-sqlite3` prebuilds. `npm run rebuild` uses `electron-rebuild` to download Electron 31 headers and compile the native module correctly. Do not remove this step.

After `npm test`, run `npm run rebuild` again before launching Electron, because the test script rebuilds `better-sqlite3` for Node.js.

---

## Development, CI, and Release Triggers

Local commits do not start builds. Commit freely on feature branches while developing.

GitHub Actions are configured separately from this file:

- `.github/workflows/ci.yml` runs on pull requests and on pushes to `main`. It installs dependencies, rebuilds native modules, runs tests, rebuilds again for Electron, and runs the renderer build.
- `.github/workflows/release.yml` runs only when a tag matching `v*` is pushed. It builds and publishes release artifacts for macOS, Windows, and Linux.

To develop without publishing new app versions:

1. Work on a dedicated feature branch, not directly on `main`.
2. Commit locally as needed.
3. Push the branch when useful; branch pushes do not publish releases.
4. Open a pull request when ready for CI validation.
5. Do not create or push `v*` tags until intentionally releasing a new version.

---

## Project Structure

```text
TimeBox/
  main.js           Electron main process: BrowserWindow, IPC, DB, HTTP server, updates
  preload.js        contextBridge exposing window.api to the renderer
  vite.config.js    base './', output dist/
  index.html        HTML entry, Open Sans font, browser-only window.api mock
  lib/
    todoist-order.js  Todoist task ordering helpers
    updater.js        electron-updater integration
  db/
    schema.js       initDb(dbPath): tables, indexes, migrations, seed data
    queries.js      synchronous better-sqlite3 query layer; init(db) must run first
  cli/
    http-server.js  Local HTTP server used by main.js; isolated tests cover it
    standalone.js   Installable zero-dependency CLI that talks to the HTTP server
    mcp-server.js   Installable zero-dependency MCP server over stdio
    index.js        Developer CLI with direct better-sqlite3 access
    db.js           Opens the developer CLI database
    format.js       Shared formatting and date utilities for CLI commands
    commands/
      day-insights.js
      today.js
      week.js
      projects.js
      clients.js
      status.js
      log.js
    __tests__/
      *.test.js     node:test coverage for commands, HTTP, MCP, and Todoist ordering
  public/
    fonts/          OpenSans-Variable.woff2
  src/
    main.jsx        ReactDOM.createRoot
    App.jsx         App shell, navigation, global state, sidebar
    utils.js        Renderer formatting and date utilities
    screens/
      TodayView.jsx
      WeeklyView.jsx
      Panoramica.jsx
      Dashboard.jsx
      BillingScreen.jsx
      EntriesScreen.jsx
      ClientsScreen.jsx
      RecurringScreen.jsx
      TodoistLog.jsx
      SettingsScreen.jsx
    components/
      PlanningCell.jsx
      ExtraCell.jsx
      WeekendCell.jsx
      TimeCell.jsx
      MultiSlotCell.jsx
      RecurringBlockRow.jsx
      MarkdownText.jsx
```

---

## IPC Architecture

```text
Renderer (React)
  -> window.api.xxx()
     -> ipcRenderer.invoke('db:xxx', ...args)
        -> ipcMain.handle('db:xxx', handler)
           -> db/queries.js
              -> better-sqlite3
```

`window.api` is available only inside Electron. `index.html` defines a mock `window.api` only when the preload has not already injected one. This mock is for browser preview and test workflows; do not remove it.

Important exposed APIs are in `preload.js`: entity CRUD, entries, week overrides, weekly area status, Todoist sync/cache, database file actions, CLI/MCP installation, update status, update checks, and `onDbChanged`.

---

## HTTP Server, CLI, and MCP

```text
cli/standalone.js  ─┐
cli/mcp-server.js  ─┤─ HTTP 127.0.0.1:37373 ─── main.js ─── db/queries.js
curl / scripts     ─┘
```

The HTTP server runs inside Electron on `127.0.0.1:37373`. It starts in `app.whenReady()` after IPC setup.

`cli/standalone.js` and `cli/mcp-server.js` are self-contained scripts using only Node built-ins. They never load `better-sqlite3`, which avoids Node/Electron native ABI mismatch.

### Installable Tools

From Settings -> CLI and MCP:

- Install CLI: creates a wrapper in `~/.local/bin/timebox` on macOS/Linux or `%APPDATA%\Timebox\bin\timebox.cmd` on Windows.
- Install MCP server: creates a wrapper in `~/.local/bin/timebox-mcp` on macOS/Linux or `%APPDATA%\Timebox\bin\timebox-mcp.cmd` on Windows.
- Install Codex MCP config.
- Install Claude Code MCP config.
- Install Claude Desktop MCP config on macOS only.

In development, wrappers point at repository files. In packaged builds, they point at files copied through `package.json -> build.extraResources`. Existing macOS `/usr/local/bin` installs are still detected for compatibility, but new installs use per-user paths.

### HTTP Endpoints

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/ping` | Health check. |
| `GET` | `/today?date=` | `getTodayData(date)`. |
| `GET` | `/day/insights?date=` | Aggregated daily diagnostics for `TodayView`. |
| `GET` | `/week?offset=` | `getWeekData(today, offset)`. |
| `GET` | `/area-statuses?week=` | Weekly area status rows for a Monday `weekKey`. |
| `POST` | `/area-statuses` | Save `{ weekKey, areaId, status }`; every status is stored explicitly. Areas without a row fall back to `clients.defaultStatus`. |
| `GET` | `/projects?area=&client=&search=&all=` | `getProjectsData(...)`. |
| `GET` | `/clients?search=` | `getClientsData(...)`. |
| `GET` | `/areas?search=` | Alias for clients/areas. |
| `GET` | `/status` | `getStatusData(today)`. |
| `POST` | `/log` | `logHours(...)`; supports `billableHours`. |
| `POST` | `/projects` | Create a project. |
| `PATCH` | `/projects/:id` | Update project fields or move area. |
| `DELETE` | `/projects/:id` | Delete a project with no entries. |
| `POST` | `/projects/merge` | Merge entries from one project into another, then delete the source (`deleteSource: false` keeps it). |
| `PATCH` | `/areas/:id` | Rename an area. |
| `PATCH` | `/clients/:id` | Rename an area through legacy naming. |

### MCP Server

`cli/mcp-server.js` implements MCP spec `2024-11-05` with JSON-RPC over stdio.

Tools: `today`, `week`, `projects`, `areas`, `status`, `log_hours`, `find_area`, `find_project`, `rename_area`, `rename_project`, `update_project`, `move_project`, `create_project`, `delete_project`, `merge_project_entries`.

Codex manual configuration:

```bash
codex mcp add timebox -- timebox-mcp
```

---

## SQLite Schema

```sql
clients        (id, name, color, billable, billing, rate, limitType, limitHours, position, defaultStatus)
projects       (id, clientId, name, description, budgetHours, weeklyHours, position, archived)
recurring      (id, clientId, slot, day, hours, position)
entries        (id, projectId, date, hours, billableHours, slot, billed)
week_overrides (id, weekKey, dayIndex, slot, blocksJson)
week_area_status (id, weekKey, areaId, status)
settings       (key, value)
todoist_cache  (dateStr, tasksJson, syncedAt)
```

Startup runs migrations from `db/schema.js`, enables WAL mode, and uses exclusive locking to reduce iCloud Drive conflicts.

There are three database paths, and confusing them is easy — the first launch resolves one of them and then records it, so from the second launch on only `config.json` matters:

| role | path | chosen by |
| --- | --- | --- |
| default, first launch | `app.getPath('documents')/Timebox/timebox.db` | `defaultDbPath` in `main.js`; on macOS this triggers the TCC prompt for Documents |
| user-selected | anything | the picker in Settings, persisted as `config.dbPath` in `app.getPath('userData')/config.json` |
| development | `app.getPath('userData')/timebox-dev.db` | hard-coded whenever `ELECTRON_START_URL` is set, because the unsigned `node_modules` Electron binary has no TCC grant for Documents |

A `timebox.db` sitting in the repository root is **not** the app's database — it is a leftover copy and is gitignored. To find the real one, read `config.json` in the app-data directory, or call the `app:getDbPath` IPC handler.

`initDb` creates schema, indexes and migrations only — it performs no inserts, so a new database stays empty. Demo clients, projects, recurring blocks, sample entries and Todoist cache data come from `seedDemoData` in `db/queries.js`, reachable only through Settings (IPC `db:seedDemoData`); it calls `resetAllData` first, so it replaces whatever the open database contains. Tests that need fixtures must call it themselves.

---

## State Management

### App.jsx

- Loads `clients`, `projects`, and `recurring` on mount.
- Holds navigation state: `screen`, `weekOffset`, and theme.
- Refreshes shared data on `db:changed` events.
- Renders `TodayView`, `WeeklyView`, `Panoramica`, `BillingScreen`, `ClientsScreen`, `RecurringScreen`, `EntriesScreen`, `TodoistLog`, and `SettingsScreen`.

### WeeklyView.jsx

- Loads `weekEntries`, `weekOverrides`, project totals, and Todoist cache when the week changes.
- Stores overrides in a nested map:

```js
{ [weekKey]: { [dayIndex]: { am: [...blocks], pm: [...blocks] } } }
```

- Saves edits optimistically through `window.api`.
- Loads and saves per-week area status as sparse rows; missing row means `active`.

### Dashboard, Billing, Entries, TodoistLog

- These screens load their own entry/cache ranges when opened.
- Billing respects `billableHours` when present and `billed` state on entries.
- TodoistLog shows all cached rows grouped by date with the latest sync timestamp.

---

## Behaviors Not to Break

### Planned Blocks vs. Overrides

`getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot)` in `WeeklyView.jsx`:

- uses a week override when one exists for the week/day/slot;
- otherwise falls back to the recurring template.

Editing the weekly view must not mutate the `recurring` table.

### Empty Week Overrides

When the last block is removed from a slot, the code deletes the `week_overrides` row instead of saving an empty array. Missing row means "use the recurring template".

### Extra Blocks

Extra blocks are computed from entries whose project area is not present in planned AM or PM blocks for that day. They are not edited directly.

### saveEntry and deleteEntry

`saveEntry` in `WeeklyView.jsx` handles upsert behavior:

- `hours === 0` deletes the entry.
- Existing `projectId + date + slot` updates the row.
- New rows use `crypto.randomUUID()`.

There is one entry per `projectId + date + slot`; the database enforces this with a unique index on `entries(projectId, date, slot)`.

### Billable Hours and Billed State

`entries.billed` is stored as `INTEGER` 0/1 and normalized to boolean in queries. `entries.billableHours` can override billable time for billing/reporting while leaving actual tracked hours unchanged.

### Reset to Template

`resetWeekToTemplate()` removes current-week overrides locally and calls `deleteWeekOverride` for every weekday AM/PM slot.

### Drag and Drop

`WeeklyView.jsx` tracks:

- `dragging`: `{blockId, fromDay, fromSlot, clientId, hours}`
- `dragOver`: `{day, slot}`

`handleDrop(toDay, toSlot)` updates source and destination slots in one state change and saves both slots.

### Recurring Freeze

Recurring template edits call `freezeWeeksBeforeRecurringChange` first. Past weeks without explicit overrides are materialized as overrides before the template changes.

---

## Utilities

`src/utils.js`:

| Function | Behavior |
|---|---|
| `fmtH(h)` | `2.5 -> "2h 30m"`, `3 -> "3h"`, `0 -> "0h"`, negative values keep a leading `-`. |
| `toHHMM(h)` | `2.5 -> "2:30"`, `0 -> ""`. |
| `parseHHMM(str, threshold?)` | Accepts `2:30`, `2.5`, `2,5`, and empty string. A bare number greater than the threshold is read as minutes (`90` -> `1.5`); the threshold defaults to the configured one (`src/hours-threshold.js`, setting `hoursMinutesThreshold`, default 9) and is passed explicitly in tests. A value containing `:` is always explicit and never converted. |
| `getMondayOfWeek(date)` | Monday for the containing ISO-style week. |
| `addDays(date, n)` | Returns a new date. |
| `fmt(date)` | Returns `YYYY-MM-DD`. |
| `getToday()` | Returns today's date with time cleared, calculated on every call. |

---

## Component Notes

### PlanningCell

Receives planned blocks, slot entries, Todoist task allocations, sync state, day state, and block-edit callbacks. It renders progressive fill, overflow, Todoist overlays, drag opacity, and a floating add-block popover.

Todoist tasks are allocated sequentially across blocks for the same area. A task can be split when it exceeds the first block's remaining capacity.

### TimeCell

Inline `hh:mm` editor:

- click starts editing;
- `Tab`/`Enter` commits;
- `Escape` cancels;
- saving `0` deletes the entry.

### MultiSlotCell

Used by the recurring screen. It wraps recurring block rows and manages the inline add-block popover.

### MarkdownText

Dependency-free inline Markdown renderer used for Todoist task text. Supports bold, italic, code, strikethrough, and links rendered as text.

---

## Todoist Integration

1. The renderer calls `window.api.syncTodoist(projects, dates, debug)`.
2. `main.js` decrypts the token from `safeStorage`.
3. Todoist REST API v1 returns open tasks and projects with cursor pagination.
4. Tasks are filtered by due date.
5. Todoist projects are matched to Timebox projects by name.
6. Task durations are converted to hours and assigned to AM/PM slots.
7. Results are sorted with `lib/todoist-order.js`, saved in `todoist_cache`, and returned as `{ byDate }`.

The weekly view syncs only today and future dates. Past cached tasks are still visible in TodoistLog.

### Explicit Todoist Mapping Decision

Do not add a manual Todoist-project-to-Timebox-project mapping layer unless the maintainer reports concrete recurring sync friction.

The rejected R4 idea was to add a persistent mapping between Todoist project IDs and Timebox project IDs, with a UI for maintaining the relationship and sync logic that overrides name matching. It is technically feasible, but it is not implemented because it adds model, migration, settings UI, and long-term maintenance for a workflow that is currently served well enough by matching project names.

Why this stays out for now:

- The app is personal and capacity-first; adding a mapping console makes Todoist sync feel like an integration admin surface.
- Name matching is transparent: if Todoist and Timebox project names match, sync works; if not, diagnostics show the mismatch.
- The current mismatch tools already make sync problems visible without introducing another data model.
- Extra mapping metadata would need lifecycle handling for renamed, archived, deleted, or imported Todoist projects.

Reopen this decision only when real usage shows repeated ambiguity or broken matching that cannot be solved by keeping project names aligned.

---

## Update Behavior

Update handling is split by platform in `main.js` (`app.whenReady`):

- **macOS (`darwin`)** uses `lib/update-notifier.js`. Squirrel.Mac refuses any update that is not signed with a valid Apple Developer ID, so an unsigned/ad-hoc build can never auto-update in place. The notifier checks the latest GitHub release via `api.github.com`, compares it with `app.getVersion()` (`compareVersions` tolerates a leading `v` and missing components), and shows a native dialog offering to open the download page. Installation stays manual.
- **Windows (NSIS) and Linux (AppImage)** use `lib/updater.js` with `electron-updater`, which works without code signing. `autoDownload` is `false`: the app prompts before downloading and again before restarting to install. Both updaters expose the same IPC channels (`app:getUpdateStatus`, `app:checkForUpdates`, `app:installUpdate`), so `preload.js` and the renderer stay platform-agnostic; on the notifier path `installUpdate` opens the release page instead of installing.
- Both paths skip entirely when `!app.isPackaged` (development).

---

## Adding Features

### New Field on an Existing Entity

1. Add the column in `db/schema.js` with an `ALTER TABLE` migration and update `CREATE TABLE` for empty DBs.
2. Update `db/queries.js` inserts, updates, and normalization.
3. Add or update IPC handlers in `main.js` only if the existing channel does not carry the field.
4. Update `preload.js` only for new channels.
5. Update the browser mock in `index.html`.
6. Add or adjust tests when behavior changes in CLI, HTTP, MCP, or shared query logic.

### New Screen

1. Create `src/screens/NewScreen.jsx`.
2. Add a `NAV_ITEMS` entry in `src/App.jsx`.
3. Add conditional rendering in App's content area.
4. Add a 15x15 inline SVG icon in `App.jsx`, matching the existing pattern.

### New Query

1. Add the function in `db/queries.js`.
2. Add an IPC channel in `main.js`.
3. Expose it in `preload.js`.
4. Add a mock method in `index.html`.

---

## Known Gotchas

- `clients.billable`, `projects.archived`, and `entries.billed` are SQLite integers, not booleans. Normalize in `queries.js`.
- `billableHours` is optional. `null` means billable time equals tracked time for billable areas.
- The standalone CLI and MCP server require the app to be open.
- The developer CLI in `cli/index.js` uses `better-sqlite3` directly and can hit ABI mismatch after `npm run rebuild`.
- `crypto.randomUUID()` is available in Electron and modern Node; do not add `uuid`.
- Vite's CJS deprecation warning is harmless for this project.
