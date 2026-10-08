# Timebox Technical Guide

Timebox is a macOS-first desktop app for the maintainer's personal capacity planning, timeblocking, time tracking, billing review, and weekly review workflow. Windows and Linux packages are configured where Electron supports the same workflow, but platform-specific integrations must be explicit. It intentionally codifies a subjective process instead of a generic productivity methodology.

The product framing is capacity-first. Billing is a supporting workflow for billable areas, not the center of the app, and new features should make the maintainer's manual planning/review process visible in the GUI rather than turning the app into a generic productivity methodology or an agent-only automation layer.

This is also a vibe coding project: development is iterative and AI-assisted. Keep changes grounded in the existing code, verify behavior, and avoid broad rewrites unless the task explicitly calls for them.

Stack: **Electron 44 + React 18 + Vite 8 + better-sqlite3 13**.

---

## Install and Run

```bash
# First install. Nothing to compile: see the note on better-sqlite3 below.
npm install

# Development
npm start                # Vite dev server on 5173 + Electron

# Production renderer build
npm run build            # Vite -> renderer-dist/, then Electron loads renderer-dist/index.html

# Tests
npm test                 # node --test, then Vitest
npm run coverage:components   # copertura dei componenti React (Vitest + v8)
```

Coverage is measured in two halves, because the two suites run on different
runners. `c8` covers the Node side (`cli/`, `db/`, `lib/` and the logic modules
under `src/`) via the `node --test` suites. `npm run coverage:components` covers
`src/components/` and `src/screens/` via Vitest, and writes to
`coverage/components/`. There is no script for the Node half; run it directly:

```bash
npx c8 --reporter=text-summary node --test cli/__tests__/*.test.js src/__tests__/*.test.js
npm run coverage:components
```

As of October 2026 the Node half is at about 95% of lines and the UI half at about
35% of statements, 38% of branches and 33% of functions. Those UI figures are the
ones Vitest 5 reports: it maps V8 coverage through the AST. When the move was made,
the same code and tests read 44%, 74% and 41% under Vitest 2 and 32%, 33% and 30%
under Vitest 5, so numbers taken before the move are not comparable with the ones
after it. The UI half is still low, but it is measured, so a pull request
that lowers it is visible. Compare statements, branches and functions, not only one
of them: when a screen gets its first test the file enters the denominator, and the
branch and function percentages of the whole UI half can drop even though nothing
that was covered stopped being covered. Add tests until all three are at or above
the base branch.

There is no native build step. `better-sqlite3` 13 is an N-API addon that ships prebuilt binaries inside its package (`prebuilds/<platform>-<arch>.node`), and one binary loads in both Node and Electron: the tests, `npm start` and the packaged app all use the prebuilt one. Until version 12 each runtime needed its own ABI, which is why this project had `npm run rebuild`, a `postinstall` hook and a rebuild inside `npm test`; they were removed in October 2026. If an old checkout left a `node_modules/better-sqlite3/build` folder behind, it is ignored: `prebuilds/` is looked up first. `npm install --ignore-scripts` also works and is what CI uses; the only install script in the tree belongs to a dependency of electron-builder.

Electron 44 needs at least `better-sqlite3` 13: version 12 does not compile against its headers.

---

## Checking the UI Without Electron

The renderer can be checked in a plain browser, which is the way to verify a UI change
when Electron cannot be launched (an agent session, CI, a machine without a display).

- **Demo data.** Run `npx vite` and open `http://localhost:5173/`. Without the preload,
  `index.html` installs the mock `window.api`, with in-memory writes and no network.
  `?theme=light` or `?theme=dark` forces the theme.
- **Real data, read-only.** Copy the database file and its `-wal` to a temporary
  directory (the real path is in `config.json`, see *SQLite Schema*), dump the tables to
  JSON with `sqlite3 -json`, leaving `todoist_token_enc` out of `settings`, and put a
  small proxy in front of Vite that adds a `<script>` just before `</body>`. That script
  replaces the read methods of the mock (`getClients`, `getProjects`, `getRecurring`,
  `getEntries`, `getProjectTotals`, `getProjectBillableTotals`, `getSetting`,
  `getWeekAreaStatuses`, `getWeekOverrides`, `getWeekOverridesRange`, `getTodoistCache`,
  `getAllTodoistCache`, `getTodoistImports`) with ones that answer from the dump. A
  classic script placed there runs before the module entry, so the app only ever sees
  the patched API. Writes still go to the mock and never reach the database. Delete the
  copy and the dump when done.
- **Giorno diagnostics.** `getDayInsights` is computed in the main process. With the
  installed app open, the proxy can forward it to `GET /day/insights?date=` on
  `127.0.0.1:37373`; otherwise the panels show the mock's demo data.

Two limits. This checks the renderer, not the IPC layer, the preload or packaging. And
the installed app can be an older release than `main`: a bug seen there may already be
fixed, so check `CHANGELOG.md` under *Unreleased* before chasing it.

---

## Development, CI, and Release Triggers

Local commits do not start builds. Commit freely on feature branches while developing.

GitHub Actions are configured separately from this file:

- `.github/workflows/ci.yml` runs on pull requests and on pushes to `main`. It installs dependencies, runs the tests and runs the renderer build.
- `.github/workflows/package-check.yml` runs on pull requests that touch `package.json`, the lockfile or `build/`. It packages the app on macOS, Windows and Linux without publishing. `build/after-pack.js` fails the build unless the package contains exactly one `better-sqlite3` binary, the one for that platform (`build.files` in `package.json` filters the others out).
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
  vite.config.mjs   base './', output dist/
  index.html        HTML entry, Open Sans font, browser-only window.api mock
  lib/
    todoist-order.js  Todoist task ordering helpers
    updater.js        electron-updater integration
    home-network.js   Finds the computer's addresses on the local network (macOS)
    mobile-server.js  LAN listener for the mobile page: static files and two token-protected routes
    mobile-access.js  Opens and closes that listener: switched on + token + a local network
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
      entries.js
      clients.js
      status.js
      log.js
    __tests__/
      *.test.js     node:test coverage for commands, HTTP, MCP, and Todoist ordering
  mobile/           The mobile page served by lib/mobile-server.js (plain HTML/CSS/JS, no build step)
  public/
    fonts/          OpenSans-Variable.woff2
  src/
    main.jsx        ReactDOM.createRoot
    App.jsx         App shell, navigation, global state, sidebar
    utils.js        Renderer formatting and date utilities
    screens/
      DayScreen.jsx
      WeeklyView.jsx
      ProgressScreen.jsx
      BillingScreen.jsx
      EntriesScreen.jsx
      AreasScreen.jsx
      RecurringScreen.jsx
      TodoistImportScreen.jsx
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

`cli/standalone.js` and `cli/mcp-server.js` are self-contained scripts using only Node built-ins. They never load `better-sqlite3`: they are copied out of the app as single files and must run with whatever Node the user has.

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
| `GET` | `/day/insights?date=` | Aggregated daily diagnostics for `DayScreen`. |
| `GET` | `/week?offset=` | `getWeekData(today, offset)`. |
| `GET` | `/area-statuses?week=` | Weekly area status rows for a Monday `weekKey`. |
| `POST` | `/area-statuses` | Save `{ weekKey, areaId, status }`; every status is stored explicitly. Areas without a row fall back to `clients.defaultStatus`. |
| `GET` | `/projects?area=&client=&search=&all=` | `getProjectsData(...)`. |
| `GET` | `/entries?from=&to=&area=&project=` | `getEntriesData(...)`: single entries in a date range plus totals by area and project. `from` is required, `to` defaults to today; a malformed date is a 400. |
| `GET` | `/clients?search=` | `getClientsData(...)`. |
| `GET` | `/areas?search=` | Alias for clients/areas. |
| `GET` | `/status` | `getStatusData(today)`. |
| `POST` | `/log` | `logHours(...)`; supports `billableHours`. |
| `POST` | `/projects` | Create a project. |
| `PATCH` | `/projects/:id` | Update project fields or move area. |
| `DELETE` | `/projects/:id` | Delete a project with no entries. |
| `POST` | `/projects/merge` | Merge entries from one project into another, then delete the source (`deleteSource: false` keeps it). |
| `PATCH` | `/areas/:id` | Rename an area and/or change its color. `color` accepts a Todoist palette key (e.g. `lavender`) or a hex from that palette (case-insensitive); anything else is a 400. |
| `PATCH` | `/clients/:id` | Rename an area through legacy naming. |

### Mobile Page (Local Network)

```text
iPhone (Safari / Home screen) ── HTTP <LAN address>:37374 ── lib/mobile-server.js ── cli/commands/mobile.js ── db/queries.js
```

A second listener, off by default, macOS only. It exists so hours can be logged from a phone; analysis and planning stay on the Mac. It is deliberately not the loopback API on another address: that one has no authentication and exposes deletes and merges, so it stays on `127.0.0.1`.

- `lib/mobile-server.js` serves the files under `mobile/` and two routes, both behind a bearer token: `GET /api/day?date=` and `PUT /api/hours` (`{ projectId, date, clock: "H:MM" }`). Do not add routes here without a reason that belongs to the phone; anything added is reachable from the network.
- `lib/mobile-access.js` decides when it is open: switched on, a token exists, and the computer is on a local network. It does **not** recognise the home network: while on, the page is reachable on any network. This was a deliberate step back from "home only". On macOS an app cannot read the router's MAC address (`arp` returns "no entry" when a non-Apple program is in the process chain) nor the Wi-Fi name, and the router's UPnP id and TLS certificate were not usable either. Do not reintroduce `arp`-based detection: it works from a terminal and fails inside the app.
- `lib/home-network.js` only finds where to listen: the computer's addresses in the router's subnet, from `route -n get default`. Never `0.0.0.0`.
- Because nothing closes the page automatically, its switch is in the top bar (`src/components/MobileSwitch.jsx`), visible from every screen, filled when on. Settings -> iPhone has the same switch plus the link and the token. The two stay in step through the `MOBILE_CHANGED` window event.
- The page works by project id. It changes worked hours only: `saveMobileHours` keeps the stored `billableHours` and `billed`, and writes through `planDayEntrySave`, the same rule `DayScreen` uses.
- `mobile/` is plain files with no bundler, under a CSP that forbids inline script and style. Colours are set through the CSSOM (`el.style`), text through `textContent`.
- Settings keys: `mobile_enabled`, `mobile_token_enc` (encrypted with `safeStorage`, like the Todoist token).
- The accepted risks (plain HTTP, reachable on any network while on) are written in `SECURITY.md`. Read it before changing any of this.

### MCP Server

`cli/mcp-server.js` implements MCP spec `2024-11-05` with JSON-RPC over stdio.

Tools: `today`, `week`, `projects`, `entries`, `areas`, `status`, `log_hours`, `find_area`, `find_project`, `rename_area`, `update_area`, `rename_project`, `update_project`, `move_project`, `create_project`, `delete_project`, `merge_project_entries`.

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
- Renders `DayScreen`, `WeeklyView`, `ProgressScreen`, `BillingScreen`, `AreasScreen`, `RecurringScreen`, `EntriesScreen`, `TodoistImportScreen`, and `SettingsScreen`.

### WeeklyView.jsx

- Loads `weekEntries`, `weekOverrides`, project totals, and Todoist cache when the week changes.
- Stores overrides in a nested map:

```js
{ [weekKey]: { [dayIndex]: { am: [...blocks], pm: [...blocks] } } }
```

- Saves edits optimistically through `window.api`.
- Loads and saves per-week area status as sparse rows; missing row means `active`.

### ProgressScreen, BillingScreen, EntriesScreen, TodoistImportScreen

- These screens load their own entry/cache ranges when opened.
- Billing respects `billableHours` when present and `billed` state on entries.
- TodoistImportScreen shows all cached rows grouped by date with the latest sync timestamp.

---

## Behaviors Not to Break

### Planned Blocks vs. Overrides

`getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot)` in `WeeklyView.jsx`:

- uses a week override when one exists for the week/day/slot;
- otherwise falls back to the recurring template.

Editing the weekly view must not mutate the `recurring` table.

### Slots Belong to the Plan, Not to Tracked Hours

AM, PM and Sera are a property of planned blocks. A tracked entry still stores a `slot` (the unique index is `projectId + date + slot`), but it is picked automatically by `resolveEntrySlot`, cannot be chosen in the UI and says nothing about when the work happened. Never show it and never compare planned against tracked through it.

Tracked hours meet slots in one place only: `fillPlannedBlocks` (`src/dayPlanning.js`, twin in `lib/domain.js`) spreads an area's hours for the day over its blocks in slot order. Per-slot tracked figures (`slotLogged` in `computeDayPlanning`, `slots[slot].trackedByArea` and `trackedHours` in `getDaySummaryData`) come from that fill; hours beyond the plan are extra and belong to no slot.

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

### Limits Count Both Worked and Billable Hours

Every cap (area limit, project budget, project weekly limit) is measured on two counts: worked hours (`entries.hours`) and billable hours (`billableHours`, falling back to worked). They can only differ in areas with `billing === 'hourly'`; elsewhere billable hours are ignored. `capUsage` returns both counts plus `worst` (the higher one) and `kind` (`'lavorate'`, `'fatt.'`, or `null` when they coincide). Thresholds, bars and alerts always use `worst`, and any number shown while the counts differ carries its label — a bare number means worked hours.

The logic lives in `src/cap-usage.js` for the renderer and in `capUsage` in `lib/domain.js` for the CLI; the two copies must stay in step. All-time totals come from `getProjectTotals` (worked) and `getProjectBillableTotals` (billable), loaded together by `loadProjectTotals()`. Do not compare a cap against `e.hours` or `projectTotals` directly: go through `usageMaps`. An area's usage is computed by summing each count over its projects first and picking the worse afterwards, not by summing the projects' worst values.

In UI text, tracked hours are "ore lavorate" (never "ore reali") and billable hours are "ore fatturabili", abbreviated "fatt.".

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
| `fmtH(h)` | `2.5 -> "2h 30m"`, `3 -> "3h"`, `0 -> "0h"`, negative values keep a leading `-`. The only format hours are written in, on every screen and in the value a field opens on. |
| `parseHHMM(str, threshold?)` | Reads what a hours field can contain: the display format (`1h 30m`, `2h`, `45m`) and the typing shortcuts `2:30`, `2.5`, `2,5`; empty string is 0. A bare number greater than the threshold is read as minutes (`90` -> `1.5`); the threshold defaults to the configured one (`src/hours-threshold.js`, setting `hoursMinutesThreshold`, default 9) and is passed explicitly in tests. A value containing `:`, `h` or `m` is explicit and never converted. |
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

Inline hours editor (shows and opens on `fmtH`, accepts what `parseHHMM` reads):

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
3. Todoist REST API v1 returns open tasks and projects with cursor pagination. A failed page of either call makes `todoist:sync` return `{ error, status }` instead of matching against a partial/empty list — a REST error used to be swallowed, leaving every task falsely `matchStatus: 'unmatched'`.
3b. New Todoist projects are imported automatically (`q.importTodoistProjects`) before matching, so a project created since the last manual import is matched on this same sync. Inbox and any project that has children are skipped (`isTodoistContainer`) — they are organizational containers, never something hours get logged against. If any were added, every window gets a `db:changed` `'structure'` notification so the renderer's project list picks them up without a restart.
4. Tasks are filtered by due date.
5. Todoist projects are matched to Timebox projects by name, against the up-to-date project list from the DB. A task whose Todoist project has no Timebox match is still cached (`projectId: null`, `matchStatus: 'unmatched'`) instead of being dropped, so it shows up as unmapped in the mismatches panel/tool. Tasks without a due time or without a duration are skipped either way, by design.
6. Task durations are converted to hours and assigned to AM/PM slots.
7. Results are sorted with `lib/todoist-order.js`, saved in `todoist_cache`, and returned as `{ byDate }`.

The weekly view syncs only today and future dates. Past cached tasks are still visible in TodoistImportScreen.

### Missing-from-Todoist Warning

`todoist:importProjects` (Settings → CLI/MCP → "Importa progetti", not the weekly-view sync) also runs `q.findProjectsMissingFromTodoist(todoistProjects)` after importing: it lists active Timebox projects whose name isn't among the current Todoist projects. Since Todoist's REST API only lists active projects, this covers archived, deleted, and renamed alike, indistinguishably. Returned as `missingInTodoist` alongside `added`; `SettingsScreen` shows it as a plain list next to the import result. Nothing is archived automatically — the maintainer decides. Kept off the frequent weekly-view sync on purpose, so it stays a deliberate check rather than a recurring interruption.

### Explicit Todoist Mapping Decision

Do not add a manual Todoist-project-to-Timebox-project mapping layer unless the maintainer reports concrete recurring sync friction.

The rejected R4 idea was to add a persistent mapping between Todoist project IDs and Timebox project IDs, with a UI for maintaining the relationship and sync logic that overrides name matching. It is technically feasible, but it is not implemented because it adds model, migration, settings UI, and long-term maintenance for a workflow that is currently served well enough by matching project names.

Why this stays out for now:

- The app is personal and capacity-first; adding a mapping console makes Todoist sync feel like an integration admin surface.
- Name matching is transparent: if Todoist and Timebox project names match, sync works; if not, diagnostics show the mismatch.
- The current mismatch tools already make sync problems visible without introducing another data model.
- Extra mapping metadata would need lifecycle handling for renamed, archived, deleted, or imported Todoist projects.

Reopen this decision only when real usage shows repeated ambiguity or broken matching that cannot be solved by keeping project names aligned.

Task-to-project matching stays name-based, as above. What changed is *where a newly auto-created project lands*: `getOrCreateTodoistClient` first looks for a single non-generic work area whose color equals the Todoist project's color; only when that lookup is empty or ambiguous does it fall back to the generic `Todoist - <Color>` area. This is not a mapping layer — there is no persisted Todoist-project-to-area link, just a same-sync color lookup — but it means a color already reused for a real work area gives new Todoist projects real capacity (recurring template, budgets) instead of landing in a generic area the template never covers.

---

## Update Behavior

Update handling is split by platform in `main.js` (`app.whenReady`):

- **macOS (`darwin`)** uses `lib/update-notifier.js`. Squirrel.Mac refuses any update that is not signed with a valid Apple Developer ID, so an unsigned/ad-hoc build can never auto-update in place. The notifier checks the latest GitHub release via `api.github.com`, compares it with `app.getVersion()` (`compareVersions` tolerates a leading `v` and missing components), and shows a native dialog offering to open the download page. Installation stays manual.
- **Windows (NSIS) and Linux (AppImage)** use `lib/updater.js` with `electron-updater`, which works without code signing. `autoDownload` is `false`: the app prompts before downloading and again before restarting to install. Both updaters expose the same IPC channels (`app:getUpdateStatus`, `app:checkForUpdates`, `app:installUpdate`), so `preload.js` and the renderer stay platform-agnostic; on the notifier path `installUpdate` opens the release page instead of installing.
- Both paths skip entirely when `!app.isPackaged` (development).

---

## Adding Features

### Extract the Logic Before Changing a Screen

The screens are large and barely covered by tests (`WeeklyView.jsx` is over 1500 lines), and the same rule has ended up copied across several of them more than once. There is no plan to refactor the whole app. Instead, every change that touches a rule inside a screen moves that rule out first:

1. Put the logic in a plain module under `src/` with no React and no `window.api` (see `src/cap-usage.js`, `src/progress-insights.js`, `src/dayPlanning.js`), and cover it with a `node --test` suite in `src/__tests__/`.
2. Before writing it, grep for the same condition or calculation elsewhere: other screens, `cli/commands/`, `lib/domain.js`. If it is repeated, every copy moves to the shared module in the same change, not only the one the task names.
3. The screen keeps only loading, state and rendering, and calls the module.
4. When the CLI needs the same rule, its CommonJS twin goes in `lib/domain.js`, with a comment in each copy pointing at the other.

Do this only for the logic the change actually touches. A feature is not a licence to restructure the rest of the file.

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
- Only areas with `billing === 'hourly'` bill hours. The € badge, the billable-hours override and the billed state apply there only; a `fixed` area has a fee but no hours to invoice. Use `isHourly(client)` (`src/utils.js`, twin in `lib/domain.js`) instead of testing `billing !== 'none'`. Outside hourly areas those fields are hidden, never erased: saving an entry keeps the stored `billableHours` and `billed` (`billingOnSave` in `src/utils.js`), so they come back intact if the area becomes hourly again and an already-billed entry does not reappear as unbilled.
- The standalone CLI and MCP server require the app to be open.
- The developer CLI in `cli/index.js` uses `better-sqlite3` directly, on the same prebuilt binary as the app.
- `crypto.randomUUID()` is available in Electron and modern Node; do not add `uuid`.
- The Vite config is `vite.config.mjs`, not `.js`: `package.json` has no `"type": "module"` because the main process is CommonJS, and Vite 8 warns when an ESM config is loaded as CommonJS.
