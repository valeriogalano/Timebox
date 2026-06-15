# Timebox Liquid Glass Icon Layers

This directory contains the layered Timebox icon prepared for the modern macOS/iOS icon workflow:

- `background.svg`: base shape;
- `foreground.svg`: symbol layer with the four tiles.

## Import in Icon Composer (Xcode 16+)

1. Open Icon Composer and create a new app icon.
2. Drag `background.svg` into the base `Background` layer.
3. Drag `foreground.svg` into the symbol `Foreground` layer.
4. Check the `Default`, `Dark`, `Tinted`, and `Clear` previews.
5. Export an `.icon` file and assign it to the app target in Xcode.

## Note for This Electron Project

Electron still uses `build/icon.png` as a single raster icon through the app packaging configuration. These layers are the Liquid Glass-ready source assets for a future Xcode/macOS icon pipeline.
