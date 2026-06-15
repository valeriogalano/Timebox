# Timebox - Build e Packaging

Questa guida spiega come compilare Timebox (Electron + Vite + React) e generare pacchetti installabili su macOS, Windows e Linux.

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
npm ci --ignore-scripts
npm run rebuild
```

`better-sqlite3` è un modulo nativo. Con Node recenti i prebuilt possono non essere
disponibili: `npm run rebuild` compila il modulo contro le header di Electron 31.

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
npm run dist:mac
```

Output: `release/Timebox-<version>-mac-<arch>.dmg` e `zip`.

Il target `zip` è necessario per i metadata di auto-update macOS.

### Windows (.exe / nsis)

```powershell
npm run dist:win
```

Output tipico: `release/Timebox Setup <version>.exe`

### Linux (.AppImage)

```bash
npm run dist:linux
```

Output tipico: `release/Timebox-<version>.AppImage`

## Build per tutte le piattaforme supportate

```bash
npm run dist
```

Nota: la cross-compilazione non è sempre affidabile con moduli nativi e firma codice.
Meglio buildare ogni target sul relativo sistema operativo.

## Firma e notarizzazione

- macOS: per distribuzione esterna servono certificato Apple Developer ID e notarizzazione.
- Windows: consigliata firma Authenticode per evitare warning SmartScreen.

La configurazione attuale genera pacchetti locali; firma/notarizzazione dipendono dalle credenziali del tuo ambiente.

## Release GitHub e auto-update

Le release sono pubblicate da `.github/workflows/release.yml` quando viene pushato un
tag `v*`.

Prima di creare un tag:

1. Aggiorna `version` in `package.json`.
2. Esegui `npm install --package-lock-only --ignore-scripts` se il lockfile deve recepire i metadata.
3. Esegui `npm test`.
4. Esegui `npm run build`.
5. Crea e pusha il tag semver, ad esempio `v0.4.1`.

Il workflow usa `GITHUB_TOKEN` con permesso `contents: write` e `electron-builder`
con publish provider GitHub. Gli artifact e i metadata `latest*.yml` vengono caricati
nella GitHub Release e usati da `electron-updater`.

Per un futuro mirror Codeberg, mantenere GitHub come provider update oppure passare
a provider `generic` con artifact e metadata serviti da un URL HTTPS stabile.

## Dove finiscono i file

- Renderer web: `renderer-dist/`
- Artifact installer: `release/`
- Log runtime app installata (macOS): `~/Library/Application Support/Timebox/logs/timebox.log`

## Troubleshooting rapido

- Schermata bianca dopo installazione:
  - verifica che il pacchetto includa `renderer-dist/`
  - controlla il log runtime (`timebox.log`)
- Errori su `better-sqlite3`:
  - esegui `npm ci` sul sistema target
  - riesegui packaging nello stesso sistema
