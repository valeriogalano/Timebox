# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.5] - 2026-07-22

### Added
- Andamento · Settimana: sulla settimana in corso la card Carico mostra il consuntivo fino al giorno corrente (esclude eventuali entry datate in avanti) e una proiezione fine settimana con due indicatori: "a piano" (consuntivo + ore pianificate dei giorni restanti, override o template) e "a ritmo" (consuntivo / giorni trascorsi × 7), entrambi con Δ vs capacità. Le settimane passate restano puro consuntivo.

### Changed
- Giorno (già "Oggi"): la vista ora permette di cambiare il giorno visualizzato con i pulsanti ‹ › e il pulsante "Oggi" per tornare a oggi, esattamente come Settimana. Lo spostamento riallinea blocchi, override, timesheet e Todoist del giorno. Le scorciatoie ⌘← / ⌘→ e ⌘T ora navigano i giorni quando la schermata Giorno è attiva.
- Sidebar: comprimendola ora scompare completamente invece di ridursi a striscia di icone; il controllo per riaprirla si sposta nella topbar accanto ai semafori di macOS (stile Todoist).

### Fixed
- Giorno: i titoli dei task Todoist nel pannello dei mismatch e nel dialog di importazione dei completati ora renderizzano il markdown invece di mostrarlo grezzo (**, *, ~~, backtick), coerenti con il tooltip dei blocchi.

## [0.9.4] - 2026-07-21

### Fixed
- Andamento: lo stato (sovraccarico/sottocarico/in linea) di "Per area · consuntivo" ha ora una colonna dedicata invece di condividere la cella con il Δ, per una lettura più immediata.
- Oggi/Settimana: il tooltip dei task Todoist di un blocco resta visibile anche quando ci sono già ore tracciate, purché resti quota Todoist non coperta (prima spariva non appena veniva loggata qualunque ora).

## [0.9.3] - 2026-07-20

### Added
- Ricorrenza: la sezione "Override ripetuti" è collassabile (elemento nativo `<details>`) con badge del conteggio nell'intestazione.

### Changed
- Ricorrenza: gli "Override ripetuti" sono ordinati e raggruppati per giorno in ordine di lettura settimanale (giorno → fascia → più corretti prima); rimosso il giorno ridondante dalle singole righe.
- Ricorrenza: la barra di capacità dello slot è ora in fondo alla cella, coerente con le viste Settimana e Oggi.
- Navigazione: la settimana selezionata si mantiene passando tra Settimana e Andamento (prima Andamento aveva uno stato indipendente che si azzerava).

### Fixed
- Andamento: il sovraccarico (e "oltre tetto") usa una freccia verso l'alto invece che verso destra, coerente con la freccia verso il basso del sottocarico.

## [0.9.2] - 2026-07-17

### Added
- Andamento: help contestuale "?" su ogni lente e su ogni blocco, con la spiegazione di come vengono calcolati i numeri.
- Andamento · Trend: blocco "Da decidere" basato sulla persistenza multi-settimana (un'area compare solo se fuori piano in ≥3 delle ultime 8 settimane chiuse), con indicatore di gravità N/8 e aree ordinate per gravità. Logica pura in `panoramica-insights.js` con test.
- Andamento · In prospettiva: totale in due KPI (Carico proiettato vs capacità, Valore proiettato con "perso oltre i tetti"); aree con tetto ordinate per gravità in cima, aree senza tetto smorzate in fondo.
- Andamento · Settimana: nuovo blocco "Per area · consuntivo" (pianificato / tracciato / extra / Δ per area), che copre il passo di chiusura settimanale del metodo di pianificazione.
- Settimana: stato area settimanale (attiva / minima / chiusa) mostrato sui blocchi.
- Deep-link dallo specchietto capacità di Settimana → Andamento · Settimana.

### Changed
- Andamento riorganizzato in tre lenti: **Settimana** (consuntivo della settimana chiusa), **Trend** (ritmo sulle ultime 8 settimane) e **In prospettiva** (proiezione a ritmo template su 2/4 settimane). Sostituisce le precedenti "Nel tempo" e "Retrospettiva".
- Finestra dei trend unificata a 8 settimane (prima 6 vs 8 tra i due grafici).
- Card "Carico della settimana" incorpora lo stato (modellata sullo specchietto capacità di Settimana), da tre card a due.
- Titolo di pagina allineato al contenuto su tutte le pagine.
- Introduce unit tests for renderer pure logic (utils, slot-capacity, dayPlanning modules) using Node.js native `--test` runner.
- Scope src/ to ESM via nested package.json for test compatibility.
- Add test:renderer npm script for running renderer unit tests.
- Fix extensionless import in dayPlanning.js.
- Add Vitest + jsdom + React Testing Library integration for component tests (MarkdownText, SlotCapacityBar, TodoistLabels). Component tests use `*.test.jsx` scope to remain separate from pure-logic `*.test.js` suites. Add test:components npm script and wire into npm test.

### Fixed
- Andamento · In prospettiva: verdetti coerenti — senza tetto nessun over/under fasullo, il tetto settimanale rileva davvero lo sforo (prima sempre "entro tetto"), il tetto globale resta fisso. Logica pura `areaProjection` con test.
- Andamento · Trend: etichetta del valore della settimana corrente su una riga (prima andava a capo sovrapponendosi all'asse).

### Removed
- Andamento: la tacca verticale ridondante dalle barre (per-area di In prospettiva e barra capacità), sempre a fine barra.
- Andamento: blocco "Ricavo · sintesi" (duplicato del Fatturabile della Retrospettiva e del Rendiconto).
- Andamento · In prospettiva: orizzonte "1 settimana" (degenere: nessun accumulo).

## [0.9.0] - 2026-07-15

### Added
- Nuovo sistema di **segnali neutri** (al posto di verde/arancio/rosso) esteso a tutta l'app: tema, settimana, oggi, andamento, ricorrenza, rendiconto, registro e dashboard.
- **Drill-down cliccabile** sul badge Δ template nella vista Settimana, con "Override ripetuti" nella vista Ricorrenza.
- **Stepper inline ±15min** per le ore tracciate nella vista Oggi.
- **Gauge "Carico di oggi"** live nella vista Oggi, con glifo di stato area nei blocchi di pianificazione.
- Vista **Andamento** con **3 lenti**: "Nel tempo", "Retrospettiva" e "In prospettiva", con pianificato storicizzato invece del template corrente.
- Tints area adattivi per tema chiaro/scuro nella vista Oggi (REDLINE §0/§4).
- Deep-link per sviluppo (`?screen=` / `?theme=`) e outline drop neutri nei componenti condivisi.
- Freeze automatico delle settimane passate su ogni modifica alle ricorrenze.

### Fixed
- Separati mismatch reali da capacità inutilizzata nella vista Oggi.
- Isolato DB dev/prod con icona test dedicata in bianco e nero.
- Rimossi colori residui dal sistema signals; azioni distruttive segnalate con icona esplicita.
- Test area-statuses reso stabile escludendo il giorno corrente.

### Changed
- Allineati controlli Todoist/pianificazione al redesign 2.0.

### Removed
- Rimosso placeholder "Tempo per obiettivo" in Andamento.

## [0.8.0] - 2026-07-09

### Added
- Added a third daily time slot, **Sera** (evening, from 18:00), alongside Mattina (<13:00) and Pomeriggio (13:00–18:00). The weekly planning grid, recurring template, Oggi view, Todoist import log and MCP tools now support planning and tracking evening blocks. Existing AM/PM data is unchanged.

### Fixed
- Weekly planning day header now shows both the "today" and "modified vs template" dots when a day is both, instead of hiding the modified marker on the current day.

## [0.7.1] - 2026-07-09

### Added
- Added a single-day planning column to the Oggi view.

### Fixed
- Synced the Today view refresh button state with Todoist sync.
- Moved the Oggi menu item below Timesheet and dropped the redundant timesheet button.
- Stopped showing "download in corso" on macOS for unsigned builds, which can never auto-update in place.

## [0.7.0] - 2026-07-06

### Added
- Added AM/PM slot capacity bars to the weekly planning grid and recurring template grid, with overflow highlighting and a configurable slot capacity target in Settings (default: 4h).

### Fixed
- Kept renderer date/time utility helpers compatible with the Vite dev server by defining them as native ESM, preventing a black screen caused by loading the CommonJS domain module directly in the browser.

## [0.6.0] - 2026-06-27

### Added
- Added a cross-platform update notifier: on macOS (where `electron-updater`/Squirrel.Mac requires an Apple Developer ID), the app now checks the latest GitHub release and shows a native dialog to open the download page instead of failing silently (`lib/update-notifier.js`). On Windows/Linux the existing `electron-updater` path is used but now asks for confirmation before downloading and again before restarting to install.
- Added a per-day override indicator (orange dot) in the planning column header: days that deviate from the recurring template now show a dot distinct from the week-level "↩ Ripristina template" button.
- Added an "Aggiornamenti" section to Settings with live auto-update status and "Controlla aggiornamenti" / "Installa e riavvia" buttons.
- Added write tools to the MCP server: `get_recurring`, `set_recurring_slot`, `get_week_overrides`, `set_week_override`, `clear_week_override`. Claude can now read and update the weekly recurring template and week-specific overrides directly, without opening the UI.
- Added corresponding HTTP endpoints: `GET/POST/DELETE /recurring` and `GET/POST/DELETE /overrides`.
- Added an "Importa completati" action to the weekly view that fetches completed Todoist tasks, lets you review/edit the hours per task before confirming, and merges them into the matching project/date entry. A `todoist_imports` ledger tracks already-imported task IDs so re-running the import never double-counts hours; tasks left with no time are simply skipped and stay available for the next import.

### Fixed
- Aligned the AM/PM cutoff used by Todoist sync and CLI log defaults to noon, so 12:00-12:59 tasks are consistently treated as PM.
- Allowed the local HTTP `/log` endpoint to accept `hours: 0`, so CLI/MCP clients can delete existing entries consistently with the direct log command.
- Fixed `fmtH`/`toHHMM` rounding minutes up to 60 without carrying the extra minute into the hour (e.g. `2h 60m` instead of `3h`), in both the renderer (`src/utils.js`) and the CLI (`cli/format.js`).
- Stopped project/area deletion from leaving orphaned time entries: `deleteProject` now removes the project's entries in the same transaction, so they no longer keep counting in week/day totals with an unresolved area.
- Extended the CLI/HTTP/MCP weekly summary from Monday-Friday to the full Monday-Sunday week, so hours logged on Saturday/Sunday are no longer silently excluded from weekly totals. The `friday` field in the week payload is now `sunday`.
- Stopped the Todoist "tasks to do" tooltip from appearing on hover in planning blocks that already have tracked hours.
- Wired `mainWindow` into the auto-updater so state changes (available, downloading, downloaded) are propagated to the renderer via IPC events.

### Documentation
- Documented that converting a Todoist task's due datetime to local time before the am/pm split is intentional.
- Documented the local HTTP API's lack of authentication as an accepted risk for single-user local software.

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

[Unreleased]: https://github.com/valeriogalano/TimeBox/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/valeriogalano/TimeBox/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/valeriogalano/TimeBox/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/valeriogalano/TimeBox/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/valeriogalano/TimeBox/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/valeriogalano/TimeBox/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/valeriogalano/TimeBox/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/valeriogalano/TimeBox/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/valeriogalano/TimeBox/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/valeriogalano/TimeBox/tree/v0.4.0
