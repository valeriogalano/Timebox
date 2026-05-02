# Timebox Liquid Glass Icon Layers

Questa cartella contiene la versione a layer dell'icona Timebox, pronta per il flusso macOS/iOS moderno:

- `background.svg`: base shape (sfondo)
- `foreground.svg`: simbolo (quattro tile)

## Import in Icon Composer (Xcode 16+)

1. Apri Icon Composer e crea una nuova icona app.
2. Trascina `background.svg` nel layer di base (`Background`).
3. Trascina `foreground.svg` nel layer simbolo (`Foreground`).
4. Verifica preview nelle varianti `Default`, `Dark`, `Tinted`, `Clear`.
5. Esporta in `.icon` e assegnala al target app in Xcode.

## Nota per questo progetto Electron

Electron usa ancora `build/icon.png` (singolo raster) tramite `main.js`.
Questi layer sono la conversione "Liquid Glass-ready" da usare nella pipeline Xcode/macOS.
