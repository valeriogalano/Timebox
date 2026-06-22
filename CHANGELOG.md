# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/valeriogalano/TimeBox/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/valeriogalano/TimeBox/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/valeriogalano/TimeBox/releases/tag/v0.4.0
