# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation
- Documented that converting a Todoist task's due datetime to local time before the am/pm split is intentional, and that ordering by the parsed timestamp is already timezone-independent — closing out the open question on possible timezone bugs in slot/order logic.
- Documented the local HTTP API's lack of authentication as an accepted risk for single-user local software, with a pointer to revisit it if exposure ever widens beyond loopback.
### Added
- Added a per-day override indicator (orange dot) in the planning column header: days that deviate from the recurring template now show a dot distinct from the week-level "↩ Ripristina template" button.
### Added
- Added an "Aggiornamenti" section to Settings with live auto-update status and "Controlla aggiornamenti" / "Installa e riavvia" buttons.
### Added
- Added write tools to the MCP server: `get_recurring`, `set_recurring_slot`, `get_week_overrides`, `set_week_override`, `clear_week_override`. Claude can now read and update the weekly recurring template and week-specific overrides directly, without opening the UI.
- Added corresponding HTTP endpoints: `GET/POST/DELETE /recurring` and `GET/POST/DELETE /overrides`.

### Fixed
- Aligned the AM/PM cutoff used by Todoist sync and CLI log defaults to noon, so 12:00-12:59 tasks are consistently treated as PM.
- Allowed the local HTTP `/log` endpoint to accept `hours: 0`, so CLI/MCP clients can delete existing entries consistently with the direct log command.
- Fixed `fmtH`/`toHHMM` rounding minutes up to 60 without carrying the extra minute into the hour (e.g. `2h 60m` instead of `3h`), in both the renderer (`src/utils.js`) and the CLI (`cli/format.js`).

- Stopped project/area deletion from leaving orphaned time entries: `deleteProject` now removes the project's entries in the same transaction, so they no longer keep counting in week/day totals with an unresolved area.
- Extended the CLI/HTTP/MCP weekly summary (`getWeekData`, `/week`, `timebox week`, `getStatusData`'s `weekTotal`) from Monday-Friday to the full Monday-Sunday week, so hours logged on Saturday/Sunday are no longer silently excluded from weekly totals. The `friday` field in the week payload is now `sunday`. The renderer's weekly view already included the weekend.
- Stopped the Todoist "tasks to do" tooltip from appearing on hover in planning blocks that already have tracked hours, since pending tasks are no longer actionable once work has been recorded.
- Wired `mainWindow` into `setupAutoUpdater` so auto-update state changes are now propagated to the renderer via `auto-update-state` IPC events; previously the renderer had no way to know an update was available or downloaded.

## [0.5.2] - 2026-06-24

### Fixed
- Rebuilt the macOS release packaging so the app bundle receives a complete ad-hoc code signature during `electron-builder` packaging.
- Disabled macOS signing identity auto-discovery for GitHub builds, preventing partial or invalid local-development signatures from being applied to release bundles.

### Documentation
- Documented the personal macOS installation flow for non-notarized builds, including removing Gatekeeper quarantine with `xattr -dr com.apple.quarantine /Applications/Timebox.app`.

### Changed
- Removed older GitHub Releases (`v0.4.0`, `v0.5.0`, and `v0.5.1`) so the only downloadable release is the verified `v0.5.2` build. The Git tags remain available for source history and comparisons.

## [0.5.1] - 2026-06-24

### Changed
- Superseded by `0.5.2`; its GitHub Release assets were removed because the macOS package could still be rejected by Gatekeeper as damaged.

## [0.5.0] - 2026-06-22

### Added
- MCP tool to summarize the daily plan (`feat: add MCP daily summary tool`)
- MCP tool to surface imported Todoist tasks for today (`feat: add MCP tool for imported Todoist tasks`)
- MCP tool to detect daily plan/actual mismatches (`feat: add MCP daily mismatch tool`)
- MCP tool to report free capacity for the day (`feat: add MCP free capacity tool`)
- MCP tool to list ready blocks for the day (`feat(mcp): add ready blocks daily tool`)
- Cross-platform app path handling, generalized for OSes beyond macOS (`feat: generalize cross-platform app paths`)

### Fixed
- Timesheet totals now align with the visible planning data (`fix: align timesheet totals with visible planning`)
- Past recurring weeks are now frozen instead of being recalculated (`fix: freeze past recurring weeks`)

### Documentation
- Documented the MCP daily planning tools
- Clarified CI and release triggers across project documentation
- Aligned and cleaned up project documentation, removed external project reference, added agent project instructions

## [0.4.0] - 2026-06-15

First documented release. Electron + React + SQLite time-tracking app with project/client management, weekly timesheets, recurring schedules, and Todoist integration.

[Unreleased]: https://github.com/valeriogalano/TimeBox/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/valeriogalano/TimeBox/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/valeriogalano/TimeBox/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/valeriogalano/TimeBox/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/valeriogalano/TimeBox/tree/v0.4.0
