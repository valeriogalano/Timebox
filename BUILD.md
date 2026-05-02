# TimeBox - Build e Packaging

Questa guida spiega come compilare TimeBox (Electron + Vite + React) e generare pacchetti installabili su macOS, Windows e Linux.

## Prerequisiti

- Node.js 20+ (consigliato LTS)
- npm 10+
- Build tools del sistema operativo:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools (Desktop development with C++)
  - Linux: toolchain C/C++ (`build-essential` su Debian/Ubuntu)

Il progetto usa `better-sqlite3` (modulo nativo): builda sempre sul sistema target.

## Installazione dipendenze

```bash
npm ci
```

## Avvio sviluppo

```bash
npm run dev
```

## Build renderer (frontend)

```bash
npm run build
```

Output: `renderer-dist/`

## Packaging applicazione

Eseguire prima la build renderer, poi `electron-builder`.

### macOS (.dmg)

```bash
npm run build
npx electron-builder --mac dmg
```

Output: `release/TimeBox-<version>-arm64.dmg` (o x64 in base alla macchina)

### Windows (.exe / nsis)

```powershell
npm run build
npx electron-builder --win nsis
```

Output tipico: `release/TimeBox Setup <version>.exe`

### Linux (.AppImage)

```bash
npm run build
npx electron-builder --linux AppImage
```

Output tipico: `release/TimeBox-<version>.AppImage`

## Build per tutte le piattaforme supportate

```bash
npm run build
npx electron-builder -mwl
```

Nota: la cross-compilazione non è sempre affidabile con moduli nativi e firma codice.
Meglio buildare ogni target sul relativo sistema operativo.

## Firma e notarizzazione

- macOS: per distribuzione esterna servono certificato Apple Developer ID e notarizzazione.
- Windows: consigliata firma Authenticode per evitare warning SmartScreen.

La configurazione attuale genera pacchetti locali; firma/notarizzazione dipendono dalle credenziali del tuo ambiente.

## Dove finiscono i file

- Renderer web: `renderer-dist/`
- Artifact installer: `release/`
- Log runtime app installata (macOS): `~/Library/Application Support/TimeBox/logs/timebox.log`

## Troubleshooting rapido

- Schermata bianca dopo installazione:
  - verifica che il pacchetto includa `renderer-dist/`
  - controlla il log runtime (`timebox.log`)
- Errori su `better-sqlite3`:
  - esegui `npm ci` sul sistema target
  - riesegui packaging nello stesso sistema
