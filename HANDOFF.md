# Handoff - Timebox v4 approved tasks

Data handoff: 2026-07-05

## Stato repo

- Repo: `/Users/valeriogalano/PhpstormProjects/TimeBox`
- Branch corrente: `feat/timebox-v4-approved-tasks`
- Worktree al momento del handoff: pulito
- Stack: Electron 31, React 18, Vite 5, better-sqlite3 12

## Commit prodotti

```text
ae9a6b3 docs: align Timebox product framing
1429c40 feat: show weekly template divergence
07d3a2b feat: add daily planning insights view
7a13a14 fix: place today view third in sidebar
```

## Task chiusi

- R5 - Riallineare il framing del prodotto: completato e chiuso in Todoist.
- R2 - Indicatore magnitudine settimana <-> template: completato e chiuso in Todoist.
- R1 - Vista "Oggi" in GUI che riusa la diagnostica MCP: completato, provato manualmente da Valerio, ritoccato per mettere `Oggi` come terza voce del menu, chiuso in Todoist.

## Verifiche eseguite

Ultimo giro dopo il fix ordine menu:

```bash
npm run build
npm test      # 112/112
npm run rebuild
```

Nota: dopo `npm test`, `npm run rebuild` e' stato eseguito come richiesto da `AGENTS.md`, quindi `better-sqlite3` e' tornato compilato per Electron.

## Modifiche principali

### R5 - Framing capacity-first

File:

- `README.md`
- `AGENTS.md`

Esito:

- Timebox e' descritto come app personale capacity-first.
- Billing resta workflow di supporto per aree billable, non centro del prodotto.

### R2 - Divergenza dal template

File:

- `src/screens/WeeklyView.jsx`

Esito:

- La Weekly View mostra un badge `Delta template` quando la settimana ha override.
- Il badge riassume delta ore e numero slot divergenti.
- Il tooltip contiene il breakdown per giorno/slot.
- Il confronto aggrega per area, non per ID blocco, per evitare falsi positivi da riordino o rigenerazione ID.

### R1 - Schermata Oggi

File principali:

- `cli/commands/day-insights.js`
- `cli/http-server.js`
- `main.js`
- `preload.js`
- `src/App.jsx`
- `src/screens/TodayView.jsx`
- `index.html`
- `cli/__tests__/http-server.test.js`
- `README.md`
- `AGENTS.md`

Esito:

- Nuova schermata `Oggi`, terza voce del menu dopo `Timesheet` e `Dashboard`.
- Nuovo aggregato dati `getDayInsightsData(date)`.
- Nuovo endpoint HTTP `GET /day/insights?date=YYYY-MM-DD`.
- Nuovo IPC/preload `window.api.getDayInsights(date)`.
- La schermata mostra:
  - capacita' libera;
  - blocchi senza prossima azione;
  - mismatch dopo sync Todoist;
  - bottone `Timesheet` verso la settimana corrente.

## Todoist - task Timebox rimasti aperti

Task rimandati dalla decisione R1-R5:

- `6gxM98G8w36cPQrP` - R3 - Stato area per-settimana (attiva / minima / chiusa)
  - Decisione: rimandare.
  - Motivo: concetto utile ma invasivo; richiede nuovo modello dati, migrazione, UI.
- `6gxM97xfRjQpxPHw` - R4 - Mapping Todoist->progetto esplicito
  - Decisione: rimandare.
  - Motivo: interesse basso per ora; riprendere solo se il sync Todoist crea attrito reale.

Altri task backlog/prodotto aperti:

- `6gw8GJG9rqpC7JG8` - Esegui lo spike di fattibilita' di Todoist Planning Insights
- `6gwVMj6mpJ3q2Gww` - Refactoring e code cleaning Timebox
- `6gjqpWCjW72RGC4P` - Gestire le cifre e le ore fisse a pacchetti?
- `6gwrWx7fRV6G73hP` - In Ricorrenza e timesheet sarebbe comodo poter "ingrigliare" i blocchi
- `6gxg9XqfRRmvw9cw` - Rivedi analisi di Simone Pizzi
- `6h246mhMFh5gjVHP` - Una volta importati i tempi da Todoist, servirebbe un log modificabile
- `6h2VFfWGVF8J5vhw` - Parsing valori > 12 come minuti in timesheet/cmd+l

## Note Obsidian aggiornate

Nota principale:

```text
1.Progetti/Timebox/2026-06-26 🔍 Analisi feature Timebox vs Pianificazione v4.md
```

Aggiornamenti:

- `Riassunto` aggiornato con R1/R2/R5 completate.
- `Decision log` aggiornato con:
  - implementazione R5/R2/R1;
  - chiusura R1 dopo prova manuale;
  - commit `7a13a14`.

## Raccomandazione prossima sessione

Non partire da R3/R4 salvo decisione esplicita nuova: sono stati rimandati.

La prossima sessione puo' scegliere uno di questi filoni:

1. Preparare PR/merge del branch `feat/timebox-v4-approved-tasks`.
2. Lavorare su un task backlog piccolo e non bloccato.
3. Fare lo spike `Todoist Planning Insights`, che e' un track separato e piu' lungo.
4. Riprendere il refactoring solo se sono stati chiusi i bug/gate indicati nel suo piano.

## Prompt per nuova sessione

### Prompt

```text
Sei Codex nel repo Timebox.

Contesto:
- Repo: /Users/valeriogalano/PhpstormProjects/TimeBox
- Branch corrente atteso: feat/timebox-v4-approved-tasks
- Stack: Electron 31 + React 18 + Vite 5 + better-sqlite3 12
- Leggi prima AGENTS.md e HANDOFF.md.
- Rispetta project-workflow, git-workflow, todoist-workflow e obsidian-workflow quando tocchi repo, Todoist o note.

Stato gia' completato:
- R5 completata: README/AGENTS riallineati al framing capacity-first.
- R2 completata: badge Delta template nella Weekly View.
- R1 completata: schermata Oggi, endpoint /day/insights, IPC getDayInsights, Oggi come terza voce del menu.
- Task Todoist R1/R2/R5 chiusi.
- Verifiche gia' passate: npm run build, npm test (112/112), npm run rebuild.

Commit rilevanti:
- ae9a6b3 docs: align Timebox product framing
- 1429c40 feat: show weekly template divergence
- 07d3a2b feat: add daily planning insights view
- 7a13a14 fix: place today view third in sidebar

Task rimandati:
- R3 Stato area per-settimana: rimandato, non implementare senza nuova decisione esplicita.
- R4 Mapping Todoist->progetto esplicito: rimandato, interesse basso per ora, riprendere solo se il sync Todoist crea attrito reale.

Obiettivo della nuova sessione:
1. Controlla git status e conferma lo stato del branch.
2. Se l'obiettivo e' preparare il merge, verifica diff e test, poi proponi/crea PR secondo git-workflow.
3. Se invece si sceglie un nuovo task, prendi un solo task alla volta dal progetto Todoist Timebox, valuta se e' bloccato, aggiorna Obsidian/Todoist, implementa su branch dedicato se serve, esegui test e fai commit convenzionale.
4. Fermati se serve una prova manuale della GUI o una decisione di Valerio.

Output atteso:
- Stato iniziale letto da git/Todoist/Obsidian.
- Task scelto e motivazione.
- Modifiche fatte con file principali.
- Verifiche eseguite.
- Commit prodotti.
- Eventuali blocchi o prove manuali richieste.
```

### Modello consigliato

Modello bilanciato general-purpose.

Perche': il lavoro e' tecnico ma ordinario: lettura repo, piccoli interventi React/Node, uso di Todoist/Obsidian/Git e verifica test.

### Effort consigliato

Medium.

Perche': serve seguire un workflow multi-step con stato esterno e guardrail, ma non richiede ragionamento eccezionalmente profondo salvo riprendere R3/R4 o il refactoring.
