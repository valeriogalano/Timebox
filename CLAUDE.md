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
  main.js           ← Electron main process: BrowserWindow, ipcMain, avvio DB
  preload.js        ← contextBridge: espone window.api al renderer
  vite.config.js    ← base: './', output: dist/
  index.html        ← entry HTML + @font-face Open Sans + mock window.api (dev browser)
  db/
    schema.js       ← initDb(dbPath): CREATE TABLE, indici, seed al primo avvio
    queries.js      ← tutte le query sync (better-sqlite3); init(db) va chiamato prima
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
    components/
      PlanningCell.jsx
      ExtraCell.jsx
      WeekendCell.jsx
      TimeCell.jsx
      MultiSlotCell.jsx
      RecurringBlockRow.jsx
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

## Schema SQLite

```sql
clients      (id, name, color, billing, rate, limitType, limitHours, carryover)
projects     (id, clientId, name, budgetHours)
recurring    (id, clientId, slot, day, hours)
entries      (id, projectId, date, hours, slot, billed)
week_overrides (id, weekKey, dayIndex, slot, blocksJson)
```

Il DB viene creato in `app.getPath('userData')/timebox.db`.
Al primo avvio (tabella `clients` vuota) vengono inseriti automaticamente 4 clienti,
6 progetti, 13 blocchi ricorrenti e alcune entries di esempio.

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
Props: `slot, dayIndex, blocks, clients, projects, slotEntries, isToday, isFuture,
isWeekend, editable, onAddBlock, onUpdateBlock, onRemoveBlock, onDragStart, draggingId`

- `blocks`: array di `{id, clientId, hours}` — i blocchi **pianificati** per questo slot
- `slotEntries`: entries già filtrate per questo slot specifico (am o pm)
- Il fill progressivo (da basso) è `min(1, logged/planned) * 100%`
- L'overflow bar appare solo se `logged > planned`
- Il blocco in drag ha `opacity: 0.35` mentre viene trascinato

### TimeCell
Props: `hours, billed, isFuture, isWeekend, isToday, clientColor, onSave, onToggleBilled`

- Click → editing inline con input `hh:mm`
- Tab/Enter → commit, Escape → annulla
- `onSave(parsedHours)` viene chiamato anche con `0` per cancellare

### MultiSlotCell (RecurringScreen)
Wrapper per N `RecurringBlockRow`. Il pulsante `+ blocco` apre un popover inline
con select cliente + input ore. Click fuori → chiude il popover.

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

- **`carryover` nel DB è `INTEGER` (0/1)**, non `BOOLEAN`. `queries.js` normalizza
  in `normalizeClient()` → `boolean`. Non salvare `true/false` direttamente via SQL.

- **`billed` nel DB è `INTEGER` (0/1)**. Stessa normalizzazione in `normalizeEntry()`.

- **Week override con 0 blocchi**: quando si rimuove l'ultimo blocco da uno slot,
  `removeBlockFromSlot` elimina la riga dal DB (`deleteWeekOverride`) invece di
  salvare un array vuoto. Questo mantiene la semantica "assente = usa ricorrente".

- **`crypto.randomUUID()`** è disponibile in Electron (Chromium 92+) e Node 15+.
  Non serve il pacchetto `uuid`.

- **Vite CJS deprecation warning**: il warning `The CJS build of Vite's Node API is
  deprecated` appare in console ma non causa problemi. Irrilevante in produzione.
