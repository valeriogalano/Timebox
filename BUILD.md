# Timebox - Build and Packaging

This guide explains how to build Timebox (Electron + Vite + React) and produce installable packages for macOS, Windows, and Linux.

Timebox is personal workflow software built for the maintainer's own timeblocking and time tracking process. It is also a vibe coding project, so keep packaging instructions grounded in the actual scripts and generated artifacts.

## Requirements

- Node.js 20+ (LTS recommended)
- npm 10+
- Operating-system build tools:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools with Desktop development with C++
  - Linux: C/C++ toolchain, for example `build-essential` on Debian/Ubuntu

The project uses `better-sqlite3`, a native module. Build on the target operating system whenever possible.

## Install Dependencies

```bash
npm ci --ignore-scripts
npm run rebuild
```

`better-sqlite3` may not have prebuilt binaries for recent Node versions. `npm run rebuild` compiles it against Electron 31 headers.

## Development

```bash
npm run dev
```

This starts the Vite dev server and Electron together.

## Renderer Build

```bash
npm run build
```

Output: `renderer-dist/`

## Application Packaging

Build the renderer first, then run `electron-builder`.

### macOS (.dmg and .zip)

```bash
npm run dist:mac
```

Output: `release/Timebox-<version>-mac-<arch>.dmg` and a `.zip` artifact.

The `.zip` target is required for macOS auto-update metadata.

### Windows (.exe / NSIS)

```powershell
npm run dist:win
```

Typical output: `release/Timebox Setup <version>.exe`

### Linux (.AppImage)

```bash
npm run dist:linux
```

Typical output: `release/Timebox-<version>.AppImage`

## Build All Configured Targets

```bash
npm run dist
```

Cross-compilation is not always reliable with native modules and code signing. Prefer building each target on its own operating system.

## Signing and Notarization

- macOS: external distribution requires an Apple Developer ID certificate and notarization.
- Windows: Authenticode signing is recommended to reduce SmartScreen warnings.

The current configuration can generate local packages. Signing and notarization depend on credentials available in the build environment.

## GitHub Releases and Auto-Update

Releases are published by `.github/workflows/release.yml` when a `v*` tag is pushed.

Before creating a tag:

1. Update `version` in `package.json`.
2. Run `npm install --package-lock-only --ignore-scripts` if the lockfile needs metadata updates.
3. Run `npm test`.
4. Run `npm run build`.
5. Create and push a semver tag, for example `v0.4.1`.

The workflow uses `GITHUB_TOKEN` with `contents: write` and `electron-builder` with GitHub as the publish provider. Installer artifacts and `latest*.yml` metadata are uploaded to the GitHub Release and used by `electron-updater`.

For a future Codeberg mirror, either keep GitHub as the update provider or switch to a `generic` provider with artifacts and metadata served from a stable HTTPS URL.

## Output Locations

- Renderer web build: `renderer-dist/`
- Installer artifacts: `release/`
- Installed app runtime log on macOS: `~/Library/Application Support/Timebox/logs/timebox.log`

## Quick Troubleshooting

Blank screen after installation:

- verify that the package includes `renderer-dist/`;
- inspect the runtime log at `timebox.log`.

`better-sqlite3` errors:

- run `npm ci` on the target operating system;
- package again on that same operating system.
