# Timebox

> **Personal workflow software.** Timebox is built for the way **I** do timeblocking, time tracking, billing follow-up, and weekly capacity planning as a freelancer. It codifies a subjective, personal process; it is not trying to be a generic productivity system.
>
> **Vibe coding project.** This project is developed through iterative, AI-assisted coding: the human steers intent and product decisions, while AI agents write and revise much of the implementation. It works and has tests, but expect fast evolution and rough edges.

Timebox is a local-first desktop app for freelance work planning. It is macOS-first in daily use, with packaging scripts and platform-aware local tooling for Windows and Linux where Electron supports the workflow. It combines a weekly timeblocking board, per-project time tracking, billable-hour review, budget alerts, Todoist task sync, a local HTTP API, a standalone CLI, and an MCP server for coding agents.

**Stack:** Electron 31 · React 18 · Vite 5 · better-sqlite3 12

---

## Contents

- [Install and Run](#install-and-run)
- [Core Concepts](#core-concepts)
- [Main Screens](#main-screens)
- [Todoist Integration](#todoist-integration)
- [Local Data and Privacy](#local-data-and-privacy)
- [Database Schema](#database-schema)
- [HTTP API](#http-api)
- [CLI](#cli)
- [MCP Server](#mcp-server)
- [Build and Packaging](#build-and-packaging)
- [Development Notes](#development-notes)

---

## Install and Run

**Requirements:** Node.js 20+ and npm 10+.

```bash
# First install. Node 25 has no better-sqlite3 prebuilds.
npm install --ignore-scripts
npm run rebuild

# Development
npm start

# Production renderer build
npm run build
```

`npm run rebuild` compiles `better-sqlite3` against Electron 31 headers. Do not skip it after installing dependencies if you want the Electron app to open correctly.

The app database is created automatically in Electron's per-user app-data directory. Typical defaults are:

```text
macOS:   ~/Library/Application Support/Timebox/timebox.db
Windows: %APPDATA%\Timebox\timebox.db
Linux:   ~/.config/Timebox/timebox.db
```

When the database is empty, Timebox seeds demo areas, projects, recurring blocks, entries, and cached Todoist rows so the interface can be explored immediately.

---

## Core Concepts

- **Areas:** the app's top-level buckets. In the UI they behave like clients, but they can also represent retainers, internal work, or any personal work area.
- **Projects:** work streams inside an area. Projects can have a total budget, a weekly limit, a description, an order, and an archived state.
- **Recurring blocks:** the default weekly timeblocking template, defined Monday-Friday and split into AM/PM slots.
- **Week overrides:** per-week replacements for recurring blocks. Editing a block in the weekly view changes that week only.
- **Entries:** logged work, one project/date record managed by application logic, with slot, hours, optional billable-hours override, and billed status.
- **Todoist cache:** local task snapshots grouped by due date and used to overlay planned Todoist work onto Timebox blocks.

---

## Main Screens

### Weekly Timesheet

The primary screen combines planning and tracking:

- A weekly grid with AM, PM, and Extra rows.
- Planned area blocks that fill as hours are logged.
- Extra blocks for work logged against areas not planned that day.
- Inline `hh:mm` editing for project entries.
- A green `€` billed badge and hover toggle for billable entries.
- Weekly navigation, current-day highlighting, and keyboard shortcuts.
- Budget and capacity alert banners.
- Drag and drop for moving planned blocks between days and slots.
- A "reset to template" action that deletes the current week's overrides.
- Todoist overlays for today and future days only.

### Dashboard

The dashboard summarizes weekly workload, billable value, area status, and project budget usage. It compares planned capacity against logged work and highlights overload or underload.

### Billing

The billing screen reviews billable entries by month, quarter, or custom range. It groups entries by area and project, distinguishes billed from unbilled work, supports single-row and bulk billed toggles, and respects the `billableHours` override when present.

### Entries

The entries screen is a tabular log of tracked work. It supports date, area, and project filters; inline editing; billed-state changes; deletion; and live totals for the active filter.

### Areas

The areas screen manages areas and their projects:

- Area name, color, billing type, hourly rate, and hour limits.
- Project name, description, total budget, weekly limit, ordering, and archive state.
- Drag-and-drop ordering for areas and projects.
- Moving projects between areas.
- Project archive/restore without deleting historical entries.

### Recurring

The recurring screen edits the weekly template. Changes automatically freeze previous weeks that do not yet have overrides, preserving historical planning state.

### Todoist Log

The Todoist log shows cached Todoist tasks grouped by date, including matched Timebox project, slot, estimated hours, completion state, and the latest sync timestamp.

### Settings

Settings cover:

- Appearance: light, dark, or system theme.
- Todoist: API token storage, debug logging, and project import.
- CLI and MCP installation for local tools and agents.
- Database path, selecting an existing `.db`, creating a new database, and saving a database copy.
- Data reset and demo-data seeding.
- Update status and update installation in packaged builds.

---

## Todoist Integration

Timebox reads open Todoist tasks through the Todoist REST API v1.

1. Save a Todoist API token in Settings.
2. From the weekly view, run the Todoist sync action.
3. Timebox fetches open tasks with due dates matching today or future days in the visible week.
4. Todoist projects are matched to Timebox projects by name.
5. Task duration is converted into Timebox hours.
6. Results are cached in `todoist_cache`, one row per date.
7. Matched tasks appear as blue overlays on planned blocks; leftover task time appears in Extra.

Todoist tasks are shown only for today and future days in the weekly view. Past cached data remains available in the Todoist log.

---

## Local Data and Privacy

Timebox is local-first:

- The SQLite database stays on the user's machine unless the user copies it elsewhere.
- Todoist tokens are encrypted with Electron `safeStorage`.
- The HTTP bridge binds to `127.0.0.1:37373` and exists only while the app is open.
- The CLI and MCP server talk only to that local HTTP bridge.
- Todoist sync stores only the task data needed by Timebox in the local cache.

Do not publish personal databases, exports, screenshots, Todoist tokens, or real client data in issues, releases, or support requests.

---

## Database Schema

```sql
clients        (id, name, color, billable, billing, rate, limitType, limitHours, position)
projects       (id, clientId, name, description, budgetHours, weeklyHours, position, archived)
recurring      (id, clientId, slot, day, hours, position)
entries        (id, projectId, date, hours, billableHours, slot, billed)
week_overrides (id, weekKey, dayIndex, slot, blocksJson)
settings       (key, value)
todoist_cache  (dateStr, tasksJson, syncedAt)
```

The database uses WAL mode and an exclusive lock to reduce conflicts with iCloud Drive sync. Migrations run at startup from `db/schema.js`.

---

## HTTP API

While the app is open, a local API is available at `http://127.0.0.1:37373`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/ping` | Health check. |
| `GET` | `/today?date=YYYY-MM-DD` | Logged hours for one day. |
| `GET` | `/week?offset=N` | Weekly summary; `0` is current week, `-1` is last week. |
| `GET` | `/projects?area=&client=&search=&all=1` | Project list with budgets and logged totals. |
| `GET` | `/clients?search=` | Area/client list. |
| `GET` | `/areas?search=` | Alias for `/clients`. |
| `GET` | `/status` | Today, week, and budget-alert overview. |
| `POST` | `/log` | Log hours: `{ project, hours, slot, date, add, billableHours }`. |
| `POST` | `/projects` | Create a project in an area. |
| `PATCH` | `/projects/:id` | Update project name, area, description, budget, or weekly limit. |
| `DELETE` | `/projects/:id` | Delete a project with no entries. |
| `POST` | `/projects/merge` | Merge entries from one project into another, then delete the source project. |
| `PATCH` | `/areas/:id` | Rename an area. |
| `PATCH` | `/clients/:id` | Alias for renaming an area. |

```bash
curl http://127.0.0.1:37373/ping
curl http://127.0.0.1:37373/week?offset=-1
curl -X POST http://127.0.0.1:37373/log \
  -H 'Content-Type: application/json' \
  -d '{"project":"website","hours":"2:30","slot":"pm","billableHours":"2"}'
```

---

## CLI

The installable CLI is `cli/standalone.js`. It has no npm runtime dependencies and requires the app to be open.

Install it from **Settings -> CLI and MCP -> Install CLI**. In development the generated command points to the repository file; in packaged builds it points to the bundled `timebox` resource.

The app installs commands in a user-writable directory:

```text
macOS/Linux: ~/.local/bin
Windows:     %APPDATA%\Timebox\bin
```

Add that directory to `PATH` if your shell cannot find `timebox` after installation. Existing macOS installs in `/usr/local/bin` are still detected, but new installs use the per-user directory.

| Command | Description |
|---|---|
| `timebox today [--date YYYY-MM-DD]` | Logged hours for a day. |
| `timebox week [--offset N]` | Weekly summary. |
| `timebox projects [--area <name>] [--client <name>] [--all]` | Project list. |
| `timebox areas` | Area list. |
| `timebox clients` | Alias for areas in older workflows. |
| `timebox status` | Today, week, and alerts. |
| `timebox log <project> <hours>` | Log or replace hours. |

All commands support `--json`. `timebox log` also supports `--slot`, `--date`, `--add`, and `--billable`.

```bash
timebox today
timebox week --offset -1
timebox log "website" 2:30 --slot pm
timebox log "website" 1 --add
timebox projects --json
```

Use `TIMEBOX_PORT=37373` to target a non-default local port.

---

## MCP Server

The MCP server is `cli/mcp-server.js`. It speaks JSON-RPC over stdio, requires the Timebox app to be open, and communicates only with the local HTTP API.

Install it from **Settings -> CLI and MCP**. The app can install:

- the `timebox-mcp` executable;
- a Codex MCP config;
- a Claude Code MCP config;
- a Claude Desktop MCP config on macOS.

Codex and Claude Code are configured with the absolute path to the installed `timebox-mcp` command. Claude Desktop automatic config currently targets the macOS config file; on Windows and Linux, use your client-specific MCP configuration and point it at the installed command path shown in Settings.

Manual Codex configuration:

```bash
codex mcp add timebox -- timebox-mcp
```

Manual Claude Code configuration:

```bash
claude mcp add -s user timebox -- timebox-mcp
```

Exposed tools:

| Tool | Purpose |
|---|---|
| `today` | Logged hours for a day. |
| `day_summary` | Daily plan/tracking summary with planned blocks, tracked work, residual capacity, and extra work. |
| `day_free_capacity` | Daily free-capacity analysis after planned blocks, tracked hours, and imported Todoist tasks. |
| `day_ready_blocks` | Blocks that still need enough ready Todoist intention, grouped by area/project. |
| `todoist_imported_tasks` | Imported Todoist tasks for a day, with match status and Timebox mapping. |
| `day_mismatches` | Operational mismatches between Timebox planning and imported Todoist tasks. |
| `week` | Weekly summary. |
| `projects` | List projects. |
| `areas` | List areas. |
| `status` | Quick status and alerts. |
| `log_hours` | Log hours on a project. |
| `find_area` | Search areas by name. |
| `find_project` | Search projects by name or description. |
| `rename_area` | Rename an area. |
| `rename_project` | Rename a project. |
| `update_project` | Update project metadata. |
| `move_project` | Move a project to another area. |
| `create_project` | Create a project. |
| `delete_project` | Delete a project with no entries. |
| `merge_project_entries` | Move entries into another project and delete the source project. |
| `get_recurring` | List all recurring template blocks (day, slot, area, hours). |
| `set_recurring_slot` | Replace all recurring blocks for one day+slot (e.g. Mon AM). |
| `get_week_overrides` | List overrides for a specific week (weekKey = Monday ISO date). |
| `set_week_override` | Set an override for one slot of one day of a specific week. |
| `clear_week_override` | Remove an override, reverting that slot to the recurring template. |

### Daily planning tools

These tools are the MCP-oriented daily layer on top of the weekly board and Todoist cache. They are read-only diagnostics except for `log_hours`.

| Tool | Input | Output |
|---|---|---|
| `today` | `{ date? }` | Logged entries for one day, grouped by AM/PM, with total tracked and billable hours. |
| `day_summary` | `{ date? }` | Planned capacity, tracked hours, residual capacity, per-slot block source (`template` or `override`), and extra work by area. |
| `day_free_capacity` | `{ date? }` | Split between capacity still reserved to planned areas and capacity that is truly free after tracked work and imported Todoist tasks. |
| `day_ready_blocks` | `{ date? }` | AM/PM blocks that still lack enough ready Todoist work, grouped by area and then by Timebox project. |
| `todoist_imported_tasks` | `{ date? }` | Imported tasks with Todoist project, matched Timebox project, area, slot, due date, estimate, and match status. |
| `day_mismatches` | `{ date? }` | Unmapped tasks, tasks outside planned areas, tasks over block capacity, and blocks with insufficient ready-task coverage. |

All `date` inputs use `YYYY-MM-DD` and default to today when omitted.

### Output semantics

- `day_summary` reports each slot as `AM [template]` or `PM [override]` to show whether the plan came from the recurring template or from a week-specific override.
- `todoist_imported_tasks` and the Todoist-related sections of `day_free_capacity` / `day_mismatches` work from the cached tasks imported into Timebox for that date, not directly from a live Todoist call.
- `Residual` means planned capacity minus tracked hours for the day.
- `Available after tracked + tasks` subtracts both tracked work and imported Todoist estimates from planned capacity.
- `Reserved without tasks` is capacity still assigned to planned areas that do not yet have enough matching Todoist intention.
- `Actually free (unallocated)` is capacity not reserved by planned blocks after considering tracked work and imported tasks.
- `day_mismatches` is the main diagnostic tool when planning and imported task data disagree.

### Example MCP calls

```text
day_summary({ "date": "2026-06-17" })
day_free_capacity({ "date": "2026-06-17" })
day_ready_blocks({ "date": "2026-06-17" })
todoist_imported_tasks({ "date": "2026-06-17" })
day_mismatches({ "date": "2026-06-17" })
log_hours({ "project": "website", "hours": "2:30", "slot": "pm", "date": "2026-06-17" })
```

### Example workflows

1. Review the plan source and residual capacity with `day_summary`.
2. Check whether the remaining time is really free or still reserved with `day_free_capacity`.
3. Inspect missing next actions with `day_ready_blocks`.
4. Audit imported Todoist data with `todoist_imported_tasks`.
5. Use `day_mismatches` when tasks do not fit the planned blocks cleanly.

---

## Build and Packaging

See [BUILD.md](BUILD.md) for packaging details.

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Artifacts are generated with `electron-builder`. GitHub Releases are configured as the `electron-updater` provider. macOS packages are intended for personal installation without Apple notarization; if Gatekeeper reports the app as damaged after installing it in `/Applications`, remove the download quarantine with `xattr -dr com.apple.quarantine /Applications/Timebox.app`. Windows packages should be Authenticode-signed for smoother installation; Linux AppImage builds are unsigned local artifacts unless the release workflow adds distribution-specific signing.

Local commits do not build or publish anything. The CI workflow runs on pull requests and pushes to `main`; the release workflow runs only when a `v*` tag is pushed. For regular development, work on a feature branch and avoid creating version tags until a release is intentional.

---

## Development Notes

- `window.api` exists only in Electron and is exposed by `preload.js`.
- `index.html` includes a browser-only mock `window.api` for quick Vite previews and browser-based tests. Do not remove it.
- `cli/index.js` is the developer CLI that accesses SQLite directly through `better-sqlite3`.
- `cli/standalone.js` and `cli/mcp-server.js` avoid the Node/Electron ABI problem by using only built-in Node modules and the HTTP bridge.
- `npm test` rebuilds `better-sqlite3` for Node.js before running `node --test cli/__tests__/*.test.js`.
- After running tests, run `npm run rebuild` again before opening the Electron app if the native module was rebuilt for Node.

```bash
npm test
npm run rebuild
```
