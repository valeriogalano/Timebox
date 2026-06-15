# Timebox

App desktop macOS per la gestione del tempo lavorativo freelance. Permette di pianificare la settimana per blocchi, tracciare le ore per progetto, monitorare budget e fatturazione, e sincronizzare i task da Todoist.

**Stack:** Electron 31 · React 18 · Vite 5 · better-sqlite3 12

---

## Indice

- [Installazione e avvio](#installazione-e-avvio)
- [Funzionalità principali](#funzionalità-principali)
  - [Timesheet settimanale](#timesheet-settimanale)
  - [Dashboard](#dashboard)
  - [Rendiconto](#rendiconto)
  - [Registro ore](#registro-ore)
  - [Aree (clienti)](#aree-clienti)
  - [Ricorrenza](#ricorrenza)
  - [Task Todoist](#task-todoist)
  - [Impostazioni](#impostazioni)
- [Integrazione Todoist](#integrazione-todoist)
- [Temi](#temi)
- [Privacy e dati locali](#privacy-e-dati-locali)
- [Struttura dati](#struttura-dati)
- [Build e packaging](#build-e-packaging)
- [Release e auto-update](#release-e-auto-update)

---

## Installazione e avvio

**Prerequisiti:** Node.js 20+ (consigliato LTS), npm 10+

```bash
# Prima installazione — Node 25 non ha prebuilt per better-sqlite3
npm install --ignore-scripts
npm run rebuild          # compila better-sqlite3 per Electron 31

# Avvio in sviluppo
npm start                # Vite dev server (porta 5173) + Electron in parallelo
```

> `npm run rebuild` usa `electron-rebuild` e scarica le header di Electron (≈ Node 20).
> Non saltare questo passaggio: senza di esso il modulo SQLite non si avvia.

Il database viene creato automaticamente al primo avvio in:

- **macOS:** `~/Library/Application Support/Timebox/timebox.db`

Al primo avvio con il database vuoto vengono inseriti dati di esempio (clienti, progetti, ore, task Todoist in cache) per permettere di esplorare l'app subito.

---

## Funzionalità principali

L'interfaccia è divisa in una **sidebar di navigazione** a sinistra e un'area di contenuto principale. La sidebar mostra anche un riepilogo delle ore del mese corrente per ogni area (client), con il totale in cima.

---

### Timesheet settimanale

La schermata principale. Mostra l'intera settimana lavorativa (lunedì–domenica) su una griglia unificata con due sezioni:

**Sezione pianificazione (in alto)**

La griglia è organizzata in colonne giornaliere e tre righe:

| Riga | Contenuto |
|---|---|
| **Mattina** (fino alle 13:00) | Blocchi di ore pianificate per client — slot AM |
| **Pomeriggio** | Blocchi di ore pianificate per client — slot PM |
| **Extra** | Lavoro non pianificato o eccedente i blocchi |

Ogni cella di pianificazione mostra i **blocchi client** come barre colorate che si riempiono progressivamente man mano che si registrano ore. Il riempimento è sequenziale: AM prima, PM dopo. Se le ore registrate superano la capienza del blocco, appare una barra di overflow arancione.

Nella riga "Bilancio" (sotto Extra) viene mostrato, per ogni giorno, il confronto `ore registrate / ore pianificate` con l'eventuale eccedenza extra.

**Sezione timesheet (in basso)**

Una griglia per inserire le ore giornaliere per ogni progetto, raggruppati per area (client). Ogni cella supporta:

- Click per entrare in modalità editing inline con input `hh:mm`
- `Tab` / `Enter` per confermare, `Esc` per annullare
- Badge `€` verde per segnare un'ora come fatturata (solo client fatturabili)
- Indicatori di allerta (triangolo arancione/rosso) se il progetto supera il budget settimanale o totale

A destra della griglia una colonna "Tot" riepiloga le ore settimanali per progetto, colorate in base agli alert. Un'ulteriore colonna riassume il riepilogo settimanale per area.

**Navigazione settimanale**

- Frecce `‹` e `›` per spostarsi tra le settimane
- Pulsante "Oggi" per tornare alla settimana corrente
- La settimana corrente ha la colonna di oggi evidenziata in verde
- La tastiera `Tab` (quando non si è in una cella editing) porta il focus alla prima cella della colonna di oggi

**Riepilogo settimanale**

In testa alla pagina vengono mostrate quattro pill:
- **Pianificate** — ore totali pianificate nella settimana
- **Tracciate** — ore totali registrate
- **Delta** — differenza (verde se positivo, rosso se negativo)
- **Extra** — ore extra non pianificate (arancione, appare solo se > 0)

**Alert banner**

Se durante la settimana si superano limiti configurati, appaiono banner arancione/rosso in cima alla pagina:
- Limite settimanale di un progetto
- Budget totale di un progetto
- Limite settimanale di un'area
- Limite globale di un'area

I banner possono essere chiusi con ×. Si ripristinano automaticamente quando si cambia settimana.

**Drag & drop blocchi**

I blocchi di pianificazione possono essere spostati tra slot (AM ↔ PM) e tra giorni trascinandoli. La cella di destinazione si evidenzia con un bordo blu tratteggiato. Lo spostamento aggiorna immediatamente lo stato locale e salva su database in modo ottimistico.

**Override e ripristino template**

Ogni modifica ai blocchi di una settimana crea un **override** specifico per quella settimana, lasciando intatto il template ricorrente. Se la settimana ha override attivi, appare il pulsante **↩ Ripristina template** che elimina tutti gli override e torna al template standard.

**Sincronizzazione Todoist**

Il pulsante "Aggiorna da Todoist" recupera i task con scadenza oggi e nei giorni futuri e li mostra sovrapposti ai blocchi nella sezione pianificazione (come barre azzurre). L'orario dell'ultima sync è mostrato accanto al pulsante.

---

### Dashboard

Vista di analisi settimanale con navigazione tra settimane. Mostra:

**Tre KPI card:**

| Card | Contenuto |
|---|---|
| **Carico della settimana** | Ore svolte / capacità pianificata con barra progressiva e delta |
| **Fatturabile a consumo** | Importo (€) delle ore fatturabili svolte, proiezione a fine settimana |
| **Stato** | In linea / Sottocarico / Sovraccarico in base alla percentuale di capacità |

**Grafico andamento (ultime 8 settimane)**

Grafico a barre a doppio canale (pianificato grigio + svolto colorato) con linea tratteggiata della capacità. La settimana corrente è evidenziata in verde con l'etichetta delle ore svolte.

**Stato aree**

Una card per ogni area (client) con:
- Barra di avanzamento rispetto alle ore pianificate nella settimana
- Barra del limite (settimanale o globale, se configurato)
- Importo fatturabile con proiezione (per aree a tariffa oraria)
- Badge tipo fatturazione (Nessun compenso / Compenso fisso / Compenso a ore)
- Bordo sinistro verde quando vicino alla capacità, rosso quando si supera

**Budget progetti**

Sezione visibile solo se ci sono progetti con budget totale o limite settimanale configurato. Mostra l'avanzamento percentuale con barre per ogni vincolo configurato.

---

### Rendiconto

Schermata per gestire la fatturazione delle ore registrate. Navigazione per:
- **Mese** — mese precedente/successivo con frecce
- **Trimestre** — Q1–Q4 con frecce
- **Personalizzato** — date di inizio e fine libere

**KPI card in cima:**

| Card | Contenuto |
|---|---|
| **Da fatturare** | Ore non ancora segnate come fatturate (arancione) + importo €  |
| **Fatturate** | Ore già fatturate (verde) + importo € |
| **Totale ore** | Somma di tutte le ore fatturabili del periodo + importo € |

**Sezioni per client:**

Ogni area fatturabile è mostrata come un pannello espandibile con:
- Intestazione con riepilogo ore fatturate / da fatturare / totale €
- Pulsante "Segna tutte fatturate" / "Rimuovi fatturazione" bulk
- Sottosezioni per progetto con le stesse informazioni
- Elenco di ogni singola registrazione con data, slot (AM/PM), ore, importo e checkbox €

Il toggle fatturazione (€) su ogni riga è sincronizzato con il badge € del timesheet.

---

### Registro ore

Elenco tabellare di tutte le registrazioni. Funzionalità:

- Filtro per intervallo di date (default: mese corrente fino a oggi)
- Filtro per area e per progetto (i filtri si concatenano)
- Editing inline di ogni riga: data, ore (formato `hh:mm`), progetto, stato fatturazione
- Eliminazione singola riga con richiesta di conferma
- Ricalcolo automatico del totale ore del filtro corrente

Le modifiche aggiornano il riepilogo mensile nella sidebar.

---

### Aree (clienti)

Gestione delle aree di lavoro (clienti). Ogni area ha:

- **Nome** e **colore** (20 colori predefiniti)
- **Tipo fatturazione:**
  - `Nessun compenso` — nessun conteggio economico
  - `Compenso a ore` — tariffa oraria in €
  - `Compenso fisso` — importo fisso (non calcolato nelle KPI)
- **Limite ore** — facoltativo:
  - `Settimanale` — limite di ore per settimana
  - `Globale (cumulativo)` — limite totale dall'inizio
- **Progetti** — lista di progetti dell'area con budget totale, limite settimanale, archiviazione

**Operazioni sui blocchi:**
- Aggiunta, modifica, eliminazione di aree e progetti
- Drag & drop per riordinare aree e progetti
- Archiviazione/ripristino di un progetto (nasconde dal timesheet senza eliminare le ore)
- Spostamento di un progetto tra aree diverse

---

### Ricorrenza

Definisce il **template settimanale**: la struttura di blocchi che si ripete ogni settimana se non vengono creati override.

La griglia mostra lunedì–venerdì × AM/PM. Ogni cella può contenere più blocchi client con le rispettive ore. Le operazioni disponibili su ogni blocco:

- Modifica ore (click sull'importo)
- Duplica blocco
- Elimina (con conferma)
- Drag & drop per riordinare blocchi nello stesso slot o spostarli tra slot e giorni

**Freeze automatico:** ogni modifica al template esegue automaticamente il freeze delle settimane precedenti ancora senza override, trasformandole in override espliciti che preservano lo stato storico.

---

### Task Todoist

Log di tutti i task Todoist presenti in cache, raggruppati per giorno (i più recenti in cima). Mostra:

- Data e giorno della settimana
- Per ogni task: titolo (con rendering Markdown inline), progetto Timebox abbinato, slot (AM/PM) e ore stimate
- Timestamp dell'ultima sincronizzazione globale

La cache viene popolata dalla sincronizzazione nel Timesheet e persiste tra i riavvii dell'app. Utile per verificare quali task sono stati abbinati ai progetti e con quante ore.

---

### Impostazioni

**Aspetto**
- Scelta del tema: Chiaro, Scuro, o Sistema (segue macOS)

**Todoist**
- Inserimento e salvataggio del token API Todoist (cifrato nel Keychain macOS)
- Toggle log di debug (registra ogni task recuperato e il risultato del match)
- Importazione automatica dei progetti Todoist come progetti Timebox sotto un'area "Todoist"

**Database**
- Percorso del file database corrente
- Selezione di un file `.db` esistente per cambiare database (utile per avere profili separati)
- Creazione di un nuovo database vuoto
- Salva copia del database corrente in un percorso a scelta

**Dati**
- Carica dati di prova — inserisce clienti, progetti e ore di esempio (sovrascrive tutto)
- Cancella tutti i dati — reset completo con conferma

---

## Integrazione Todoist

Timebox si integra con Todoist via REST API v1 per leggere i task pianificati.

### Configurazione

1. Vai su [todoist.com/app/settings/integrations/developer](https://todoist.com/app/settings/integrations/developer)
2. Copia il token personale API
3. In Timebox → Impostazioni → Todoist, incolla e salva il token
4. (Facoltativo) Usa "Importa progetti" per creare automaticamente i progetti Timebox corrispondenti ai progetti Todoist

### Flusso di sincronizzazione

1. Dal Timesheet, premi "Aggiorna da Todoist"
2. Timebox scarica tutti i task aperti con `due.date` uguale a oggi o a un giorno futuro della settimana corrente
3. Per ogni task, cerca un progetto Timebox con lo stesso nome del progetto Todoist
4. Calcola le ore dal campo `duration` del task (o usa un default)
5. Salva i risultati in cache (`todoist_cache`) — una riga per giorno
6. I task abbinati appaiono sovrapposti ai blocchi pianificati nella griglia

### Visibilità

- I task Todoist sono visibili **solo su oggi e giorni futuri** nella griglia del Timesheet
- I task vengono distribuiti sequenzialmente tra i blocchi dello stesso client; se un task supera la capienza del blocco, la parte residua appare nella sezione Extra come "task orfano"
- I giorni passati mantengono i dati in cache ma non li mostrano nel Timesheet

---

## Temi

Timebox supporta tre modalità di visualizzazione, selezionabili in Impostazioni → Aspetto:

| Tema | Descrizione |
|---|---|
| **Chiaro** | Interfaccia su sfondo bianco |
| **Scuro** | Interfaccia su sfondo scuro (default) |
| **Sistema** | Segue automaticamente le impostazioni di macOS |

La preferenza viene salvata in `localStorage` e applicata all'avvio successivo.

---

## Privacy e dati locali

Timebox è local-first:

- Il database SQLite resta sul Mac dell'utente, nel percorso configurato in Impostazioni.
- Il token Todoist viene salvato cifrato tramite Electron `safeStorage`.
- Il server HTTP per CLI/MCP è disponibile solo su `127.0.0.1:37373` e solo mentre l'app è aperta.
- La sincronizzazione Todoist legge i task aperti via API Todoist e salva in cache locale solo i task abbinati ai progetti Timebox.

Non includere database personali, esportazioni CSV o screenshot reali nelle issue o nelle release pubbliche.

---

## Struttura dati

Il database SQLite contiene le seguenti tabelle:

| Tabella | Contenuto |
|---|---|
| `clients` | Aree di lavoro con colore, tipo fatturazione, tariffa, limiti |
| `projects` | Progetti collegati a un'area, con descrizione, budget totale e limite settimanale |
| `recurring` | Template ricorrente: blocchi client per slot e giorno della settimana |
| `entries` | Ore registrate: progetto, data, ore, slot, stato fatturazione |
| `week_overrides` | Override settimanali: sostituiscono il template per una settimana specifica |
| `settings` | Coppie chiave/valore per configurazioni persistenti |
| `todoist_cache` | Task Todoist per data (uno JSON per giorno), con timestamp di sync |

---

## Build e packaging

Vedi [BUILD.md](BUILD.md) per le istruzioni complete su packaging per macOS (.dmg), Windows (.exe) e Linux (.AppImage).

```bash
# Build renderer + packaging locale
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Il log di runtime dell'app installata si trova in:
- **macOS:** `~/Library/Application Support/Timebox/logs/timebox.log`

---

## Release e auto-update

Le release pubbliche usano tag semver (`v0.4.1`, `v0.5.0`, ...). La versione in `package.json` deve combaciare con il tag.

Gli artifact sono generati da GitHub Actions su runner nativi:

- macOS: `dmg` e `zip`
- Windows: `nsis`
- Linux: `AppImage`

L'auto-update usa `electron-updater` con GitHub Releases come provider. Il check parte solo nell'app packaged; in sviluppo viene saltato e scritto nel log. Per macOS production servono firma Developer ID e notarizzazione, altrimenti gli artifact sono build di test e l'esperienza update non è adeguata per utenti finali.

---

## MCP Server

Timebox include un server MCP (Model Context Protocol) per l'integrazione con Codex, Claude Code e Claude Desktop.

> **Richiede l'app aperta.** Il server MCP comunica con l'HTTP server locale (porta 37373).

### Installazione

1. Apri Timebox
2. Vai in **Impostazioni → CLI e MCP → Installa MCP Server…**
3. Il comando `timebox-mcp` sarà disponibile in `/usr/local/bin`

### Configurazione Codex

Via CLI:

```bash
codex mcp add timebox -- timebox-mcp
```

### Configurazione Claude Code

Via CLI:

```bash
claude mcp add -s user timebox -- timebox-mcp
```

### Tool disponibili

| Tool | Descrizione |
|------|-------------|
| `today` | Ore loggate oggi per slot AM/PM |
| `week` | Riepilogo settimanale giorno per giorno |
| `projects` | Lista progetti con budget e ore loggate |
| `clients` | Lista clienti con tipo fatturazione |
| `status` | Overview rapida: oggi, settimana, alert budget |
| `log_hours` | Registra ore su un progetto |

### Configurazione Claude Desktop

Aggiungi a `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "timebox": {
      "command": "timebox-mcp"
    }
  }
}
```

---

## HTTP API

Mentre l'app è aperta, un server HTTP locale è disponibile su `127.0.0.1:37373`.

| Metodo | Endpoint | Query / Body | Descrizione |
|--------|----------|-------------|-------------|
| GET | `/ping` | — | Health check → `{ ok: true }` |
| GET | `/today` | `?date=YYYY-MM-DD` | Ore di oggi per slot AM/PM |
| GET | `/week` | `?offset=N` | Riepilogo settimanale (offset 0 = corrente, -1 = scorsa) |
| GET | `/projects` | `?client=X&all=1` | Lista progetti (con ore loggate) |
| GET | `/clients` | — | Lista clienti |
| GET | `/status` | — | Overview rapida: oggi, settimana, alert |
| POST | `/log` | `{ project, hours, slot?, date?, add? }` | Registra ore su un progetto |

```bash
# Esempi curl
curl http://127.0.0.1:37373/ping
curl http://127.0.0.1:37373/today
curl http://127.0.0.1:37373/week?offset=-1
curl -X POST http://127.0.0.1:37373/log \
  -H 'Content-Type: application/json' \
  -d '{"project":"website","hours":"2:30","slot":"pm"}'
```

Il server è disponibile solo in locale e solo mentre l'app è aperta.

---

## CLI

Timebox include una CLI installabile per accedere ai dati da terminale — utile per script, automazioni e integrazione con Claude Code.

> **Richiede l'app aperta.** La CLI comunica con l'HTTP server locale (porta 37373).

### Installazione

1. Apri Timebox
2. Vai in **Impostazioni → CLI e MCP → Installa…**
3. Il comando `timebox` sarà disponibile in `/usr/local/bin`

### Comandi

| Comando | Descrizione |
|---------|-------------|
| `timebox clients` | Lista clienti con tariffazione |
| `timebox projects [--client <nome>] [--all]` | Lista progetti con budget e ore loggate |
| `timebox today [--date YYYY-MM-DD]` | Ore loggate oggi per slot AM/PM |
| `timebox week [--offset N]` | Riepilogo settimanale (--offset -1 = settimana scorsa) |
| `timebox status` | Overview rapida: oggi, settimana, alert budget |
| `timebox log <progetto> <ore> [opzioni]` | Registra ore su un progetto |

### Esempi

```bash
# Vedere le ore di oggi
timebox today

# Riepilogo della settimana scorsa
timebox week --offset -1

# Loggare 2h 30m sul progetto "Website Redesign" (slot PM)
timebox log "website" 2:30 --slot pm

# Aggiungere 1h alle ore già presenti per oggi
timebox log "website" 1 --add

# Cancellare un'entry (0 ore)
timebox log "website" 0

# Output JSON (per script o integrazione con Claude Code)
timebox today --json
timebox projects --json
```

Il flag `--json` è disponibile su tutti i comandi e produce JSON puro su stdout.

### Variabile d'ambiente

```bash
TIMEBOX_PORT=37373 timebox clients   # porta alternativa (default: 37373)
```

### Note sullo sviluppo

La CLI per sviluppatori (accesso diretto al DB) è in `cli/index.js`:

```bash
npm link          # rende `timebox` disponibile globalmente (usa cli/index.js)
node cli/index.js today
```

`better-sqlite3` richiede una versione compilata compatibile con il runtime usato:
- **Electron (app):** `npm run rebuild`
- **Node.js (tests/CLI dev):** `npm rebuild better-sqlite3`

`npm test` effettua automaticamente il rebuild per Node.js prima di eseguire i test. Dopo aver eseguito i test, riesegui `npm run rebuild` se hai bisogno che l'app Electron funzioni.
