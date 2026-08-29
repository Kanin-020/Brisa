# Brisa

**Compiler and manager for native PC ports** in the style of EmuDeck, based on manifests.

## About

### What it is

**Brisa** is a **compiler and manager for native PC ports** in the style of EmuDeck, built on **manifests** (JSON files).

| Game | Project | Link |
|--------|----------|--------|
| The Legend of Zelda: Ocarina of Time | Ship of Harkinian (SoH) | [GitHub](https://github.com/HarbourMasters/Shipwright) |
| The Legend of Zelda: Majora's Mask | 2Ship2Harkinian (2S2H) | [GitHub](https://github.com/HarbourMasters/2ship2harkinian) |
| The Legend of Zelda: Twilight Princess | Dusklight | [GitHub](https://github.com/TwilitRealm/dusklight) |
| The Legend of Zelda: The Minish Cap | Project Picori | [GitHub](https://github.com/999sian/tmc) |
| Star Fox 64 | Starship | [Github](https://github.com/harbourmasters/starship) |
| Super Mario 64 |  Ghostship | [Github](https://github.com/HarbourMasters/Ghostship) |
| Super Mario 64 |  sm64coopdx | [Github](https://github.com/coop-deluxe/sm64coopdx) |
| Mario Kart 64 | SpaghettiKart | [Github](https://github.com/HarbourMasters/SpaghettiKart) |
| Banjo Kazooie | Lighthouse | [Github](https://github.com/HarbourMasters/Lighthouse) |

The project is trivially extensible to any port that publishes GitHub releases.

Special thanks to each of the decompilation teams — without them this project would not be possible. Don't forget to give a star to each of the listed repositories.

### Features

| # | Requirement | How it works |
|---|-----------|--------------|
| 1 | **A single ROM directory** | All ROMs live in `roms/`. When installing a port, Brisa creates the **symlink** with the exact name the game expects (`oot.z64`, `mm.z64`, `tp.iso`, `baserom.gba`) inside its folder. **Multi-ROM** ports (SoH: base + Master Quest) link one ROM per requirement automatically. |
| 2 | **Automatic scan on open** | `brisa status` (and the web GUI) scan `roms/`, compute **SHA1** (with caching), read the **Game ID** of GameCube discs (dusklight), match each ROM to its port by name *and* by hash, and tell you which ports you can install. |
| 3 | **Semi-centralized mods** | Mods live in `mods/<game>/<mod>`. Brisa creates symlinks to `ports/<port>/mods/<mod>`, exactly where the port reads them. Adding/removing a mod = creating/deleting a folder in `mods/`. |
| 4 | **Auto update** | Checks the latest GitHub release of each installed port and updates it (`update`, GUI button). The **app itself** also self-updates: it detects the latest AppImage on GitHub, downloads it, replaces itself and relaunches on its own (`self-update` or the GUI button). |
| 5 | **Manifests** | Each port is a JSON file in `manifests/`. To add a new port you only need: the GitHub repo, the name/hash patterns of its ROM and its per-platform asset patterns. |
| 6 | **i18n web GUI** | Local web interface with a **Español / English** language switcher (plus any language you add to `src/web/lang/`). |

## Installation

### Releases

Download the artifact from the **Releases** tab of the repository:

- **Linux** → `Brisa-<version>-x86_64.AppImage` (no installation required).
- **Windows** → `Brisa-<version>-win.zip` (portable, unzip and run).

The AppImage is **both a desktop app and a CLI**, depending on how you launch it:

- **Double-click** (or `./Brisa-*.AppImage` with no arguments) → opens the native window (GUI).
- **From the terminal with arguments** → behaves as a CLI (see [Usage → CLI](#usage)).

### User folder

All data is stored in the **user folder**: `User Folder/Brisa` (Linux: `~/Brisa`). It is the data root shared by the GUI and the CLI, and contains:

| Folder | Contents |
|---|---|
| `roms/` | All your ROMs (a single directory). |
| `mods/` | Semi-centralized mods per game. |
| `ports/` | Installed ports (binaries + executables). |
| `image/` | Brisa's own AppImage (copy made on its first execution) + the `image/imagen` helper used by the Steam launchers. |
| `manifests/` | Port manifests (local + `remote/`). |
| `cache/` | Hashes, downloads and install state. |
| `config.json` | Configuration (paths, `registryUrl`, port). |

### Folder structure

```
brisa/
├── roms/              ← ALL your ROMs live here (single directory)
│   └── oot.z64
├── mods/              ← semi-centralized mods
│   └── soh/
│       └── My Mod/    ← automatic symlink → ports/soh/mods/My Mod
├── ports/             ← installed ports (binaries + executables)
│   └── soh/
│       ├── soh.appimage
│       ├── oot.z64    ← symlink to roms/oot.z64
│       └── mods/      ← symlinks to mods/soh/*
├── image/             ← Brisa's AppImage (copy) + image/imagen helper
├── manifests/         ← port manifests (local + remote/)
├── cache/             ← hashes, downloads, install state
└── config.json        ← configuration (paths, registryUrl, port)
```

## Usage

### GUI

The native (Electron) interface opens with a **double-click** on the AppImage, or from the terminal with:

```bash
brisa serve          # web GUI in the browser → http://localhost:7380
```

It shows real-time ROM, port, mod and update status, and lets you install, update, uninstall and launch ports with one click.

### CLI

The CLI is available in two ways:

- **Directly from the AppImage** (nothing to install):

  ```bash
  ./Brisa-0.1.0-x86_64.AppImage status        # scan ROMs, ports, mods and updates
  ./Brisa-0.1.0-x86_64.AppImage install soh   # install a port
  ./Brisa-0.1.0-x86_64.AppImage --help         # list all commands
  ```

- **As a global command** (development, requires Node.js):

  ```bash
  npm link               # exposes the `brisa` command globally
  brisa status
  ```

### Commands

| Command | Description |
|---|---|
| `brisa status` | Full scan: ROMs, ports, mods, updates. |
| `brisa scan` | Scan only and list ROM↔port matches. |
| `brisa install <id> [--force]` | Download + install + link ROM and mods. |
| `brisa uninstall <id>` | Remove the port and its state (keeps files marked in `preserve`). |
| `brisa launch <id> [--wait]` | Run an installed port by id (e.g. `soh`). `--wait` waits for the game to exit (useful from Steam). |
| `brisa srm-config [--out <dir>]` | Generate one `.sh` launcher per installed port (using Brisa's CLI: `update` + `launch` the port) to add them to Steam as non-Steam games. |
| `brisa update [id] [--check]` | Update installed ports to the latest release. |
| `brisa self-update [--check]` | Update the Brisa app itself (Linux AppImage): downloads the latest release, installs it and relaunches on its own. |
| `brisa mods <id>` | List centralized mods of a port. |
| `brisa mods-link <id>` | Link all mods of the port. |
| `brisa mods-unlink <id> [mod]` | Unlink mods. |
| `brisa registry` | Download remote manifests from `registryUrl`. |
| `brisa hash <file>` | Compute the SHA1 (to fill manifests). |
| `brisa config` / `config-set <k> <v>` | View/edit configuration. |
| `brisa serve` | Local web GUI. |
| `brisa manifest-test <pattern>` | Debug a glob pattern. |

### Quick start

```bash
# 1) Put your ROMs in roms/
cp "Ocarina of Time.z64" roms/

# 2) Scan: detects ROMs, hashes and which ports can be installed
brisa status

# 3) Install a port (downloads the release for your platform,
#    extracts it to ports/soh/ and creates the ROM symlink)
brisa install soh

# 4) Mods: create folders in mods/soh/ and link them
mkdir -p "mods/soh/My Mod"
brisa mods-link soh

# 5) Update all installed ports
brisa update

# 6) Web interface (local GUI)
brisa serve          # → http://localhost:7380
```

## Steam launchers (Steam ROM Manager)

`brisa srm-config` generates **one `.sh` launcher per installed port** so you can add them to Steam as **non-Steam games** (or use them as the executable of a Glob parser in Steam ROM Manager).

The launchers are generated **inside the Brisa user folder**, next to the rest of the data (`roms/`, `mods/`, `ports/`, …):

```bash
brisa srm-config                          # creates <Brisa root>/launchers/ (next to roms/, mods/, …)
brisa srm-config --out ~/launchers        # choose another output folder
```

Example output (`launchers/`):

```
launchers/
├── The Legend of Zelda Ocarina of Time.sh
├── The Legend of Zelda Majora's Mask.sh
└── …
```

Each launcher cleans the Steam variables and runs **Brisa's own CLI** (its AppImage copied in `image/`) to update and launch the port:

```sh
unset LD_PRELOAD
unset STEAM_COMPAT_DATA_PATH
unset STEAM_COMPAT_CLIENT_INSTALL_PATH
unset STEAM_RUNTIME
"/home/user/Brisa/image/Brisa-0.3.3-x86_64.AppImage" update soh || exit 1
"/home/user/Brisa/image/Brisa-0.3.3-x86_64.AppImage" launch soh --wait || exit 1
```

- The launcher references **Brisa's AppImage in `image/` directly** (the name includes the version; if the copy is missing — e.g. in development — the `image/imagen` helper is used as a fallback).
- **`update <port>`** runs `brisa update <port>`: checks GitHub for a newer port version and, if there is one, downloads and installs it before playing.
- **`launch <port> --wait`** runs `brisa launch <port> --wait`: starts the game and keeps the process alive until it exits, so Steam shows it as "running".
- **Brisa's AppImage is copied to `image/` on its first execution** (Linux AppImage only; the original file is not touched, and stale copies from previous versions are cleaned). If you delete the copy, it is recreated the next time you run Brisa.

> **Why the `unset` lines matter**: when Steam launches a game it inherits variables (`LD_PRELOAD`, `STEAM_COMPAT_*`, `STEAM_RUNTIME`) that **crash native binaries**. Steam does not run shortcuts through a shell, so those `unset` commands can only live in a script — that is exactly what the launcher is for.

### How to use them

1. **Steam → Add a Game → Add a Non-Steam Game… → Browse** and select the `.sh` files (`brisa srm-config` already marks them executable).
2. Steam shows each launcher with its game title; rename it if you prefer.
3. On launch, the launcher checks/updates the port (`update`) and starts it (`launch --wait`) with the ROM that is already symlinked in the port folder (`oot.z64`, `baserom.gba`, …).
4. Launchers are **created automatically when a port is installed** (and removed when it is uninstalled). If any is missing for an installed port (e.g. you deleted the `launchers/` folder), it is **recreated automatically** the next time you run Brisa; `brisa srm-config` regenerates everything from scratch.

> One launcher per installed port: if a port supports several ROM variants (e.g. SoH base + Master Quest), all variants run the same launcher with whatever ROM is linked in the port folder.

## Publishing a release (CI/CD)

GitHub Actions builds and publishes the releases for you — no need to build on your PC:

1. Go to **Actions → Release → Run workflow**.
2. `version`: leave empty to bump the patch from the last tag (`0.3.8` → `0.3.9`), or type an exact version (`1.2.3` or `v1.2.3`).
3. Optionally mark `prerelease` or add extra notes.

The workflow: runs the tests, bumps `package.json`, generates `CHANGELOG.md` from conventional commits (`feat:`, `fix:`, …), creates the tag, builds the **Linux AppImage** and the **Windows installer** on native runners, and publishes the **release with the changelog as its notes**.

Local helpers:

- `node scripts/bump-version.mjs [version]` — set/bump the version (dry-run with `--dry-run`).
- `npm run changelog` — print the changelog locally; `node scripts/changelog.mjs <version> --write` updates `CHANGELOG.md`.

The **GUI shows the release notes**: when a new version of Brisa or of a port is available, the **📝** button opens the changelog of that release.

## Development

### Requirements

- **Node.js ≥ 18.17** (uses native `fetch`).
- Linux, Windows, macOS, Steam Deck or Android (Termux).
- The original game ROMs (obtain them legally, from your own cartridges/discs).

### Building

```bash
npm install
npm run build           # compiles TypeScript to dist/ and copies the web UI
npm run typecheck       # type-checks without emitting
npm run desktop         # build + run the desktop app (Electron)
npm run package:linux   # build + generate the AppImage in release/
npm run package:windows # build + generate the portable Windows .zip
npm link                # optional: exposes the `brisa` command globally
```

### How it works under the hood

1. **Scan**: walks `roms/`, computes SHA1 with a size+mtime cache, and for each manifest looks up its ROM by name (patterns), Game ID (GameCube discs) and/or exact hash.
2. **Install**: queries the GitHub API (`/releases/latest`), picks the asset by `platform.key` (`linux-x64`, `windows-arm64`, `android`, …), downloads it to `cache/downloads/`, extracts it to `ports/<id>/` and creates the symlink `ports/<id>/<dest> → roms/<file>` for **each** requirement with a present ROM (multi-ROM: `oot.z64` + `oot-mq.z64`).
3. **Mods**: `mods/<gameDir>/<mod>` is linked to `ports/<id>/<dir>/<mod>`. They are re-linked automatically after install/update.
4. **Updates**: compares the installed release tag with the latest on GitHub. On `update` it downloads the new version, makes an atomic backup and re-links ROM and mods. **Saves and configs inside the port are kept**: every file the new release does not ship is restored, and files matched by the manifest `preserve` patterns win over the release defaults.
5. **Registry auto-update**: `registryUrl` allows adding new ports without touching code, JSON only.

For more detail on the code structure and conventions, see [Brisa Architecture](ARCHITECTURE.md).

## Creating a manifest

### JSON

Create `manifests/<id>.json`. It is just **hash, URL and name association**:

```jsonc
{
  "id": "myport",                    // unique identifier
  "name": "My Port",
  "game": "Original game name",
  "description": "Native port based on the decompilation.",
  "repo": "user/repo",               // GitHub release
  "roms": [                          // required ROMs (can be several = multi-ROM)
    {
      "id": "rom1",
      "name": "Game (Region)",
      "patterns": ["*.z64", "*.n64"],// accepted names
      "sha1": [],                    // optional: ["hex..."] for exact hash match
      "dest": "game.z64",            // name the port expects (symlink)
      "required": true               // optional (default true): false = optional secondary ROM
    }
  ],

  "assets": {                        // per-platform asset pattern
    "linux-x64":   { "pattern": "MyPort-*-linux-x86_64.zip", "type": "zip",     "executable": "myport" },
    "windows-x64": { "pattern": "MyPort-*-win64.zip",        "type": "zip",     "executable": "myport.exe" },
    "macos-arm64": { "pattern": "MyPort-*-macos-arm64.zip",  "type": "zip",     "executable": "MyPort.app/Contents/MacOS/MyPort" },
    "android":     { "pattern": "MyPort-*.apk",              "type": "apk",     "executable": null }
  },

  "mods": { "dir": "mods", "gameDir": "myport" },

  "preserve": ["saves/**", "settings.json"]  // optional: user data that survives updates
}
```

### Assets

`assets` fields:

| Field | Value |
|---|---|
| `pattern` | Glob matching the asset name in the release (e.g. `MyPort-*-Linux.zip`). |
| `type` | `zip`, `tar.gz`, `appimage` or `apk`. |
| `executable` | Path of the executable inside the extracted package (`null` for AppImage/APK, which run as-is). |

### Registry

Optional remote registry to distribute updatable manifests:

```bash
brisa config-set registryUrl https://raw.githubusercontent.com/your/repo/main/manifests/index.json
brisa registry
```

`index.json` is an array of `{ "id": "...", "url": "https://.../<id>.json" }`. Remote manifests are saved in `manifests/remote/` and take priority over local ones with the same `id`.

### Hashes

To verify a ROM's hash use `brisa hash roms/yourrom.z64` and paste the result into `sha1`. When `sha1` is present, the scanner prioritizes **exact hash match** over name — perfect when the same filename could serve two different ports (like `oot.z64` and `mm.z64`).

### Preserving saves and configs (`preserve`)

When updating a port, Brisa **restores by default** every file of the previous install that the new release does not ship (saves, configs, linked mods, ROM symlinks). For files that **are** shipped by the release (default configs) where the user's copy must win, list glob patterns in `preserve`:

```json
"preserve": ["saves/**", "settings.json", "userdata/**"]
```

When **uninstalling** a port these patterns are respected too: everything is deleted except files matching `preserve`, which stay in the port folder (`ports/<id>/`) and are **restored automatically** if you install the port again.

## Web interface

`brisa serve` starts a local web interface at `http://localhost:7380` with:

- Real-time ROM, port, mod and update status (auto-refresh).
- Install, update, uninstall and launch ports with one click.
- Link/unlink individual mods.
- **Language switcher** (Español / English) in the header. Languages live in `src/web/lang/*.json` — add a new file and the switcher will show it automatically.
- **Release notes**: the **📝** button opens the changelog of the pending release (Brisa update or port update).

## Platform notes

- **Android**: ports with an `apk` asset are downloaded to `ports/<id>/` (to install the APK manually or with your manager). Android detection works under **Termux** (`TERMUX_VERSION`).
- **Windows**: symlinks may require developer mode; if they fail, Brisa copies the file as a fallback.
- **macOS**: `.app` bundles are launched from `Contents/MacOS/`.

## Legal notice

Brisa does not include or download ROMs. Native ports require the original game, of which you must own a legal copy. All managed software is open source (decompilations).
