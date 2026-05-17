# Timebox — Guida tecnica

App desktop macOS per la gestione del tempo lavorativo freelance.
Stack: **Electron 31 + React 18 + Vite 5 + better-sqlite3 12**.

---

## Installazione e avvio

```bash
# Prima installazione (Node 25 non ha prebuilt per better-sqlite3)
npm install --ignore-scripts
npm run rebuild          # compila better-sqlite3 per le header di Electron 31

# Sviluppo
npm start                # Vite dev server (5173) + Electron in parallelo

# Build produzione
npm run build            # Vite → dist/, poi Electron carica dist/index.html
```

> **Perché `--ignore-scripts`?** Node 25 è troppo recente per i prebuilt di better-sqlite3.
> `npm run rebuild` usa `electron-rebuild` che scarica le header di Electron (≈ Node 20)
> e compila correttamente. Non rimuovere questo step.

---

## Struttura del progetto

```
TimeBox/
  main.js           ← Electron main process: BrowserWindow, ipcMain, avvio DB, HTTP server
  preload.js        ← contextBridge: espone window.api al renderer
  vite.config.js    ← base: './', output: dist/
  index.html        ← entry HTML + @font-face Open Sans + mock window.api (dev browser)
  db/
    schema.js       ← initDb(dbPath): CREATE TABLE, indici, seed al primo avvio
    queries.js      ← tutte le query sync (better-sqlite3); init(db) va chiamato prima
  cli/
    http-server.js  ← HTTP server (porta 37373) usato da main.js; testabile in isolamento
    standalone.js   ← CLI installabile: zero dipendenze, parla solo con l'HTTP server
    mcp-server.js   ← MCP server installabile: JSON-RPC su stdio, parla con l'HTTP server
    index.js        ← CLI sviluppatore: accesso diretto al DB via better-sqlite3
    db.js           ← apre il DB per la dev CLI (chiama initDb per le migrazioni)
    format.js       ← fmtH, fmt, getToday, getMondayOfWeek, ecc. (condiviso da commands/)
    commands/
      today.js      ← getTodayData(date)
      week.js       ← getWeekData(today, offset)
      projects.js   ← getProjectsData({clientFilter, includeArchived})
      clients.js    ← getClientsData()
      status.js     ← getStatusData(today)
      log.js        ← logHours({projectName, hoursStr, slot, date, add}), findProject(name)
    __tests__/
      helpers.js          ← createTestDb(): DB in-memory con dati seed
      clients.test.js
      log.test.js
      projects.test.js
      status.test.js
      today.test.js
      week.test.js
      http-server.test.js ← 10 test HTTP con server su porta casuale
      mcp-server.test.js  ← test MCP via child_process stdio
  public/
    fonts/          ← OpenSans-Variable.woff2 (variable font, pesi 100–900)
  src/
    main.jsx        ← ReactDOM.createRoot
    App.jsx         ← shell: sidebar + topbar + routing + carica clients/projects/recurring
    utils.js        ← fmtH, toHHMM, parseHHMM, date utils, getToday(), DAY_SHORT, MONTHS_IT
    screens/
      WeeklyView.jsx
      Dashboard.jsx
      ClientsScreen.jsx
      RecurringScreen.jsx
      TodoistLog.jsx  ← elenco task Todoist in cache, raggruppati per giorno
      SettingsScreen.jsx ← Aspetto, Todoist, CLI e MCP, Database, Dati
    components/
      PlanningCell.jsx
      ExtraCell.jsx
      WeekendCell.jsx
      TimeCell.jsx
      MultiSlotCell.jsx
      RecurringBlockRow.jsx
      MarkdownText.jsx ← renderer inline Markdown (bold, italic, code, strikethrough, link)
```

---

## Architettura IPC

```
Renderer (React)
  └─ window.api.xxx()          ← esposto da preload.js via contextBridge
       └─ ipcRenderer.invoke('db:xxx', ...args)
            └─ ipcMain.handle('db:xxx', handler)   ← main.js
                 └─ queries.js                      ← better-sqlite3 (sync)
```

`window.api` non è disponibile in un browser normale: esiste solo nell'Electron renderer.
`index.html` contiene un mock `window.api` con dati statici che si attiva solo se
`window.api` è `undefined` — usato esclusivamente per preview/test nel browser.

---

## HTTP Server e CLI/MCP

### Architettura

```
cli/standalone.js  ─┐
cli/mcp-server.js  ─┤─ HTTP 127.0.0.1:37373 ─── main.js ─── db/queries.js
curl / script      ─┘
```

L'HTTP server gira dentro il processo Electron (`main.js`) sulla porta `37373`,
accessibile solo in locale. Viene avviato in `app.whenReady()` dopo `setupIpc()`.

`cli/standalone.js` e `cli/mcp-server.js` sono script **self-contained** (zero
dipendenze npm, solo moduli Node built-in) e parlano esclusivamente con l'HTTP server.
Se l'app è chiusa, entrambi restituiscono un errore leggibile.

### Installazione (app distribuita)

Dalle Impostazioni → **CLI e MCP**:
- **Installa CLI** → crea symlink `/usr/local/bin/timebox → cli/standalone.js`
  (in dev) o `Contents/Resources/timebox` (packaged)
- **Installa MCP Server** → crea symlink `/usr/local/bin/timebox-mcp → cli/mcp-server.js`
  (in dev) o `Contents/Resources/timebox-mcp` (packaged)

In sviluppo (`app.isPackaged === false`) i symlink puntano ai file del repo.
In produzione puntano ai file in `extraResources` (vedi `package.json` → `build.extraResources`).

### IPC handler nuovi (main.js)

| Handler | Comportamento |
|---------|--------------|
| `app:getHttpPort` | Ritorna `37373` |
| `app:checkCliInstalled` | `fs.accessSync('/usr/local/bin/timebox')` |
| `app:installCli` | Symlink + chmod |
| `app:checkMcpServerInstalled` | `fs.accessSync('/usr/local/bin/timebox-mcp')` |
| `app:installMcpServer` | Symlink + chmod |

### Endpoint HTTP

| Metodo | Path | Funzione |
|--------|------|----------|
| GET | `/ping` | health check |
| GET | `/today?date=` | `getTodayData(date)` |
| GET | `/week?offset=` | `getWeekData(today, offset)` |
| GET | `/projects?client=&all=` | `getProjectsData({...})` |
| GET | `/clients` | `getClientsData()` |
| GET | `/status` | `getStatusData(today)` |
| POST | `/log` | `logHours({...})` |

### MCP Server (cli/mcp-server.js)

Implementa MCP spec `2024-11-05` via JSON-RPC 2.0 su stdio (readline).
Tool esposti: `today`, `week`, `projects`, `clients`, `status`, `log_hours`.

Configurazione per Claude Code (`.claude/settings.json`):
```json
{ "mcpServers": { "timebox": { "command": "timebox-mcp" } } }
```

oppure: `claude mcp add timebox timebox-mcp`

### Nota ABI (dev CLI vs app)

`cli/index.js` (dev CLI) usa `better-sqlite3` direttamente → ABI mismatch con
Node 26 dopo `npm run rebuild`. Per usarla: `npm rebuild better-sqlite3` (poi
rieseguire `npm run rebuild` per tornare a Electron). La standalone CLI e il MCP
server non hanno questo problema perché non usano `better-sqlite3`.

---

## Schema SQLite

```sql
clients        (id, name, color, billable, billing, rate, limitType, limitHours, position)
projects       (id, clientId, name, budgetHours, weeklyHours, position, archived)
recurring      (id, clientId, slot, day, hours, position)
entries        (id, projectId, date, hours, slot, billed)
week_overrides (id, weekKey, dayIndex, slot, blocksJson)
settings       (key, value)
todoist_cache  (dateStr, tasksJson, syncedAt)
```

Il DB viene creato in `app.getPath('userData')/timebox.db`.
Al primo avvio (tabella `clients` vuota) vengono inseriti automaticamente 4 clienti,
6 progetti, 13 blocchi ricorrenti e alcune entries di esempio.

`todoist_cache`: una riga per giorno (`dateStr` = ISO date). `tasksJson` contiene
l'array di task `{id, projectId, content, hours, slot, completed}`. `syncedAt` è
l'ISO timestamp dell'ultima sync. La cache viene popolata da `syncTodoist` in `main.js`
e consultata da `WeeklyView.jsx` e `TodoistLog.jsx`.

### week_overrides

Ogni riga rappresenta un singolo slot di un singolo giorno di una singola settimana:
- `weekKey`: stringa ISO del lunedì della settimana (es. `"2026-04-27"`)
- `dayIndex`: 0 = lunedì … 4 = venerdì
- `slot`: `"am"` o `"pm"`
- `blocksJson`: array JSON `[{id, clientId, hours}, ...]`

Una riga presente **sostituisce completamente** il template ricorrente per quel slot.
Riga assente → si usa il template ricorrente.

---

## Gestione dello stato

### App.jsx — stato globale
- `clients`, `projects`, `recurring`: caricati al mount, passati come props
- `screen`, `weekOffset`: navigazione

### WeeklyView.jsx — stato locale
- `weekEntries`: ricaricato ogni volta che cambia `weekKey` (lunedì della settimana)
- `weekOverrides`: ricaricato da DB su cambio `weekKey`, ricostruito come mappa:
  ```js
  { [weekKey]: { [dayIndex]: { am: [...blocks], pm: [...blocks] } } }
  ```
- Ogni modifica: aggiorna stato locale (ottimistico) **e** salva su DB via `window.api`

### Dashboard.jsx — stato locale
- `entries`: caricato da `1 gennaio` a oggi quando `screen === 'dashboard'`
- Viene ricaricato ogni volta che si apre la schermata Dashboard

### TodoistLog.jsx — stato locale
- `rows`: caricato via `window.api.getAllTodoistCache()` al mount
- Raggruppa i task per giorno (più recenti in cima)
- Mostra `lastSync` globale = max `syncedAt` tra tutte le righe

---

## Comportamenti chiave da non rompere

### 1. Blocchi pianificati vs. override
`getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot)` in `WeeklyView.jsx`:
- Se esiste un override per `(weekKey, dayIndex, slot)` → usa quello
- Altrimenti → usa il template ricorrente filtrato da `recurring`

Non confondere i due livelli. Modificare un blocco nella WeeklyView crea/aggiorna un
override e **non tocca** la tabella `recurring`.

### 2. Extra blocks (lavoro non pianificato)
Calcolati automaticamente in `WeeklyView.jsx` per ogni giorno:
- Cerca entries il cui `projectId` appartiene a un cliente **non** presente nei blocchi
  pianificati (AM + PM) di quel giorno
- Non sono editabili direttamente; scompaiono se si aggiunge un blocco pianificato
  per quel cliente

### 3. saveEntry / deleteEntry
La funzione `saveEntry` in `WeeklyView.jsx` gestisce upsert:
- `hours === 0` → cancella l'entry dal DB e dallo stato
- entry già esistente (stessa coppia `projectId + date`) → aggiorna
- entry nuova → inserisce con `crypto.randomUUID()`

Una sola entry per combinazione `(projectId, date)` — vincolo applicato via logica
applicativa, non via UNIQUE sul DB.

### 4. Billed toggle
Il flag `billed` viene salvato su ogni `saveEntry`. Il badge `€` verde in `TimeCell`
appare solo se `billed === true`. Il pulsante `€` in hover chiama `onToggleBilled`
che togola e salva.

### 5. Ripristina template
`resetWeekToTemplate()` in `WeeklyView.jsx`:
- Rimuove tutti gli override per `weekKey` dallo stato locale
- Chiama `deleteWeekOverride` per ogni `(dayIndex, slot)` 0–4 × am/pm (10 chiamate)

### 6. Drag & drop
- Stato `dragging`: `{blockId, fromDay, fromSlot, clientId, hours}`
- Stato `dragOver`: `{day, slot}` — usato solo per il feedback visivo (outline blu)
- `handleDrop(toDay, toSlot)`: aggiorna entrambi gli slot (source + dest) in un
  singolo `setWeekOverrides` e salva entrambi su DB

---

## Utilities (src/utils.js)

| Funzione | Comportamento |
|---|---|
| `fmtH(h)` | `2.5` → `"2h 30m"`, `3` → `"3h"`, `0` → `"0h"`, negativo → `"-1h"` |
| `toHHMM(h)` | `2.5` → `"2:30"`, `0` → `""` |
| `parseHHMM(str)` | `"2:30"` → `2.5`, `"2.5"` → `2.5`, `"2,5"` → `2.5`, `""` → `0` |
| `getMondayOfWeek(date)` | lunedì della settimana contenente `date` (ISO: lun = 1) |
| `addDays(date, n)` | restituisce un nuovo `Date` |
| `fmt(date)` | `date.toISOString().slice(0,10)` → `"2026-04-27"` |
| `getToday()` | `new Date()` con ora azzerata — calcolato ad ogni chiamata, sempre aggiornato |

---

## Componenti

### PlanningCell
Props: `slot, dayIndex, blocks, clients, projects, slotEntries, todoistTasks,
hasTodoistSync, isToday, isFuture, isWeekend, editable, onAddBlock, onUpdateBlock,
onRemoveBlock, onDragStart, draggingId`

- `blocks`: array di `{id, clientId, hours}` — i blocchi **pianificati** per questo slot
- `slotEntries`: entries già filtrate per questo slot specifico (am o pm)
- `todoistTasks`: task Todoist del giorno per questo slot (visibili solo se `isToday || isFuture`)
- `hasTodoistSync`: `true` se esiste almeno una riga in cache per la settimana corrente
- Il fill progressivo (da basso) è `min(1, logged/planned) * 100%`
- L'overflow bar appare solo se `logged > planned`
- Il blocco in drag ha `opacity: 0.35` mentre viene trascinato
- I task Todoist sono distribuiti sequenzialmente tra i blocchi dello stesso cliente;
  un task può essere spezzato tra blocchi contigui se supera la capacità del primo
- Il popup "+ blocco" fluttua sopra il pulsante (`position: absolute, bottom: calc(100% + 4px)`)
  e si togola con lo stesso pulsante; non sposta il layout sottostante

### TimeCell
Props: `hours, billed, isFuture, isWeekend, isToday, clientColor, onSave, onToggleBilled`

- Click → editing inline con input `hh:mm`
- Tab/Enter → commit, Escape → annulla
- `onSave(parsedHours)` viene chiamato anche con `0` per cancellare

### MultiSlotCell (RecurringScreen)
Wrapper per N `RecurringBlockRow`. Il pulsante `+ blocco` apre un popover inline
con select cliente + input ore. Click fuori → chiude il popover.

### MarkdownText
Props: `text, style`

Renderer inline Markdown senza dipendenze esterne. Supporta: `**bold**`, `*italic*`,
`` `code` ``, `~~strikethrough~~`, `[link text](url)` (mostra solo il testo, no href).
Usato nei tooltip dei task Todoist in `PlanningCell` e `ExtraCell`.

---

## Integrazione Todoist

### Flusso sync
1. Il renderer chiama `window.api.syncTodoist(projects, dates, debug)`
2. `main.js` recupera il token da `safeStorage`, chiama la Todoist REST API v1
3. Scarica tutti i task aperti con paginazione (`cursor`-based)
4. Filtra per `due.date` presente nell'insieme `dates`
5. Fa match del progetto Todoist → progetto Timebox per nome
6. Salva i risultati in `todoist_cache` (una riga per giorno)
7. Ritorna `{ byDate: { [dateStr]: [...tasks] } }`

### Visibilità nel Timesheet (WeeklyView)
- Le barre Todoist e i blocchi orfani appaiono **solo su oggi e giorni futuri**
- Su giorni passati i dati restano in cache ma non vengono mostrati
- La sync non include task con `due.date` < oggi (filtro lato renderer prima di chiamare la API)

### Task orfani (ExtraCell)
`leftoverTasks(tasks, capacity)` in `WeeklyView.jsx` calcola i task non assorbiti
dai blocchi pianificati e li passa a `ExtraCell` come blocchi aggiuntivi.

---

## Dev mock (index.html)

Lo script inline in `index.html` crea un `window.api` fittizio **solo se `window.api`
non è già definito**. Poiché il preload di Electron lo inietta prima del caricamento
della pagina, il mock non si attiva mai nell'app reale.

Non rimuovere il mock: serve per:
- Preview rapida nel browser durante lo sviluppo (`http://localhost:5173`)
- Test Playwright / CI senza Electron

---

## Aggiungere funzionalità

### Nuovo campo su un'entità esistente
1. Aggiungere la colonna in `db/schema.js` con `ALTER TABLE … ADD COLUMN` (o nella
   `CREATE TABLE IF NOT EXISTS`, ma solo per DB vuoti)
2. Aggiornare la query `INSERT … ON CONFLICT … DO UPDATE` in `db/queries.js`
3. Aggiornare il canale IPC in `main.js` se necessario (di solito non serve)
4. Aggiornare il mock in `index.html`

### Nuova schermata
1. Creare `src/screens/NuovaSchermata.jsx`
2. Aggiungere una voce in `NAV_ITEMS` in `App.jsx`
3. Aggiungere il rendering condizionale nel blocco "Content" di `App.jsx`
4. Aggiungere l'icona SVG `15×15` inline in `App.jsx`

### Nuova query DB
1. Aggiungere la funzione in `db/queries.js`
2. Aggiungere il canale `ipcMain.handle('db:xxx', ...)` in `main.js`
3. Aggiungere `window.api.xxx` in `preload.js`
4. Aggiungere il metodo stub nel mock di `index.html`

---

## Gotcha noti

- **`billable` nel DB è `INTEGER` (0/1)**, non `BOOLEAN`. `queries.js` normalizza
  in `normalizeClient()` → `boolean`. Non salvare `true/false` direttamente via SQL.

- **`billed` nel DB è `INTEGER` (0/1)**. Stessa normalizzazione in `normalizeEntry()`.

- **Week override con 0 blocchi**: quando si rimuove l'ultimo blocco da uno slot,
  `removeBlockFromSlot` elimina la riga dal DB (`deleteWeekOverride`) invece di
  salvare un array vuoto. Questo mantiene la semantica "assente = usa ricorrente".

- **`crypto.randomUUID()`** è disponibile in Electron (Chromium 92+) e Node 15+.
  Non serve il pacchetto `uuid`.

- **Vite CJS deprecation warning**: il warning `The CJS build of Vite's Node API is
  deprecated` appare in console ma non causa problemi. Irrilevante in produzione.
