# Brisa

**Compilador y gestor de ports nativos de PC** al estilo EmuDeck, basado en manifiestos.

## Acerca de

### Qué es

**Brisa** es un recopilador y gestor de **ports nativos de PC** al estilo EmuDeck, basado en **manifiestos** (archivos JSON).

| Juego | Proyecto | Enlace |
|--------|----------|--------|
| The Legend of Zelda: Ocarina of Time | Ship of Harkinian (SoH) | [GitHub](https://github.com/HarbourMasters/Shipwright) |
| The Legend of Zelda: Majora's Mask | 2Ship2Harkinian (2S2H) | [GitHub](https://github.com/HarbourMasters/2ship2harkinian) |
| The Legend of Zelda: Twilight Princess | DUSKLIGHT | [GitHub](https://github.com/TwilitRealm/dusklight) |
| The Legend of Zelda: The Minish Cap | Project Picori | [GitHub](https://github.com/999sian/tmc) |

El proyecto es trivialmente extensible a cualquier port que publique releases en GitHub.

Doy especial agradecimiento a cada uno de los equipos de decompilación, sin ellos este proyecto no sería posible, no olviden dar una estrella a cada uno de los repositorios listados.

### Características

| # | Requisito | Cómo lo hace |
|---|-----------|--------------|
| 1 | **Un solo directorio de ROMs** | Todos los ROMs viven en `roms/`. Al instalar un port, Brisa crea el **symlink** con el nombre exacto que el juego espera (`oot.z64`, `mm.z64`, `tp.iso`, `baserom.gba`) dentro de su carpeta. Los ports **multirom** (SoH: base + Master Quest) enlazan una ROM por requisito automáticamente. |
| 2 | **Escaneo automático al abrir** | `brisa status` (y la GUI web) escanean `roms/`, calculan **SHA1** (con caché), leen el **Game ID** de los discos de GameCube (dusklight), asocian cada ROM a su port por nombre *y* por hash, y te dice qué ports puedes instalar. |
| 3 | **Mods semicentralizados** | Los mods viven en `mods/<juego>/<mod>`. Brisa crea symlinks hacia `ports/<port>/mods/<mod>`, exactamente donde el port los lee. Añadir/quitar un mod = crear/borrar una carpeta en `mods/`. |
| 4 | **Auto update** | Comprueba el último release de GitHub de cada port instalado y lo actualiza (`update`, botón en GUI). También puede refrescar un registro remoto de manifiestos. |
| 5 | **Manifiestos** | Cada port es un archivo JSON en `manifests/`. Para añadir un port nuevo solo necesitas: el repo de GitHub, los patrones de nombre/hash de su ROM y los patrones de sus assets por plataforma. |
| 6 | **GUI web con i18n** | Interfaz web local con selector de idioma **Español / English** (y cualquier idioma que añadas a `src/web/lang/`). |

## Instalación

### Releases

Descarga el artefacto de la pestaña **Releases** del repositorio:

- **Linux** → `Port_Hub-<versión>-x86_64.AppImage` (no requiere instalación).
- **Windows** → `Port_Hub-<versión>-win.zip` (portable, descomprimir y ejecutar).

La AppImage es **a la vez app de escritorio y CLI**, según cómo se ejecute:

- **Doble clic** (o `./Port_Hub-*.AppImage` sin argumentos) → abre la ventana nativa (GUI).
- **Desde la terminal con argumentos** → se comporta como CLI (ver [Uso → CLI](#uso)).

### Carpeta de usuario

Los archivos se guardan en la **carpeta de usuario**: `Carpeta de Usuario/Brisa` (Linux: `~/Brisa`). Es la raíz de datos que comparten la GUI y el CLI, y contiene:

| Carpeta | Contenido |
|---|---|
| `roms/` | Todos tus ROMs (un solo directorio). |
| `mods/` | Mods semicentralizados por juego. |
| `ports/` | Ports instalados (binarios + ejecutables). |
| `manifests/` | Manifiestos de ports (local + `remote/`). |
| `cache/` | Hashes, descargas y estado de instalación. |
| `config.json` | Configuración (rutas, `registryUrl`, puerto). |

### Estructura de carpetas

```
brisa/
├── roms/              ← TODOS tus ROMs viven aquí (un solo directorio)
│   └── oot.z64
├── mods/              ← mods semicentralizados
│   └── soh/
│       └── Mi Mod/    ← symlink automático → ports/soh/mods/Mi Mod
├── ports/             ← ports instalados (binarios + ejecutables)
│   └── soh/
│       ├── soh.appimage
│       ├── oot.z64    ← symlink a roms/oot.z64
│       └── mods/      ← symlinks hacia mods/soh/*
├── manifests/         ← manifiestos de ports (local + remote/)
├── cache/             ← hashes, descargas, estado de instalación
└── config.json        ← configuración (rutas, registryUrl, puerto)
```

## Uso

### GUI

La interfaz nativa (Electron) se abre con **doble clic** en la AppImage, o desde la terminal con:

```bash
brisa serve          # GUI web en el navegador → http://localhost:7380
```

Permite ver el estado de ROMs, ports, mods y actualizaciones en tiempo real, e instalar, actualizar, desinstalar y lanzar ports con un clic.

### CLI

El CLI está disponible de dos formas:

- **Directamente con la AppImage** (sin instalar nada):

  ```bash
  ./Port_Hub-0.1.0-x86_64.AppImage status        # escanea ROMs, ports, mods y actualizaciones
  ./Port_Hub-0.1.0-x86_64.AppImage install soh   # instala un port
  ./Port_Hub-0.1.0-x86_64.AppImage --help         # lista todos los comandos
  ```

- **Como comando global** (desarrollo, requiere Node.js):

  ```bash
  npm link               # expone el comando `brisa` globalmente
  brisa status
  ```

### Comandos

| Comando | Descripción |
|---|---|
| `brisa status` | Escaneo completo: ROMs, ports, mods, actualizaciones. |
| `brisa scan` | Solo escanea y lista coincidencias ROM↔port. |
| `brisa install <id> [--force]` | Descarga + instala + enlaza ROM y mods. |
| `brisa uninstall <id>` | Elimina el port y su estado. |
| `brisa launch <id>` | Ejecuta el port instalado. |
| `brisa update [id] [--check]` | Actualiza ports instalados a la última release. |
| `brisa mods <id>` | Lista mods centralizados de un port. |
| `brisa mods-link <id>` | Enlaza todos los mods del port. |
| `brisa mods-unlink <id> [mod]` | Desenlaza mods. |
| `brisa registry` | Descarga manifiestos remotos desde `registryUrl`. |
| `brisa hash <archivo>` | Calcula el SHA1 (para rellenar manifiestos). |
| `brisa config` / `config-set <k> <v>` | Ver/editar configuración. |
| `brisa serve` | GUI web local. |
| `brisa manifest-test <pattern>` | Depura un patrón glob. |

### Uso rápido

```bash
# 1) Pon tus ROMs en roms/
cp "Ocarina of Time.z64" roms/

# 2) Escanea: detecta ROMs, hashes y qué ports se pueden instalar
brisa status

# 3) Instala un port (descarga el release correcto para tu plataforma,
#    lo extrae en ports/soh/ y crea el symlink del ROM)
brisa install soh

# 4) Mods: crea carpetas en mods/soh/ y enlázalas
mkdir -p "mods/soh/Mi Mod"
brisa mods-link soh

# 5) Actualiza todos los ports instalados
brisa update

# 6) Interfaz web (GUI local)
brisa serve          # → http://localhost:7380
```

## Desarrollo

### Requisitos

- **Node.js ≥ 18.17** (se usa el `fetch` nativo).
- Linux, Windows, macOS, Steam Deck o Android (Termux).
- Los ROMs originales de los juegos (obténlos legalmente, desde tus propios cartuchos/discos).

### Compilación

```bash
npm install
npm run build           # compila TypeScript a dist/ y copia la UI web
npm run typecheck       # verifica tipos sin emitir
npm run desktop         # build + ejecuta la app de escritorio (Electron)
npm run package:linux   # build + genera la AppImage en release/
npm run package:windows # build + genera el .zip portable de Windows
npm link                # opcional: expone el comando `brisa` globalmente
```

### Funcionamiento interno

1. **Escaneo**: recorre `roms/`, calcula SHA1 con caché por tamaño+mtime, y para cada manifiesto busca su ROM por nombre (patrones), Game ID (discos GameCube) y/o hash exacto.
2. **Instalación**: consulta la API de GitHub (`/releases/latest`), elige el asset según `platform.key` (`linux-x64`, `windows-arm64`, `android`, …), lo descarga a `cache/downloads/`, lo extrae en `ports/<id>/` y crea el symlink `ports/<id>/<dest> → roms/<archivo>` para **cada** requisito con ROM presente (multirom: `oot.z64` + `oot-mq.z64`).
3. **Mods**: `mods/<gameDir>/<mod>` se enlaza a `ports/<id>/<dir>/<mod>`. Se re-enlazan automáticamente tras instalar/actualizar.
4. **Actualizaciones**: compara el tag de la release instalada con el último de GitHub. En `update` se descarga la nueva versión, se hace backup atómico y se re-enlaza ROM y mods.
5. **Auto-update del registro**: `registryUrl` permite añadir ports nuevos sin tocar el código, solo con JSON.

## Crear un manifiesto

### JSON

Crea `manifests/<id>.json`. Es solo **asociación de hashes, urls y nombres**:

```jsonc
{
  "id": "miport",                    // identificador único
  "name": "Mi Port",
  "game": "Nombre del juego original",
  "description": "Port nativo basado en la decompilación.",
  "repo": "usuario/repo",            // release en GitHub
  "roms": [                          // ROMs requeridos (puede haber varios = multirom)
    {
      "id": "rom1",
      "name": "Juego (Región)",
      "patterns": ["*.z64", "*.n64"],// nombres que acepta
      "sha1": [],                    // opcional: ["hex..."] por hash exacto
      "dest": "juego.z64",           // nombre que espera el port (symlink)
      "required": true               // opcional (default true): false = ROM secundaria opcional
    }
  ],

  "assets": {                        // patrón de asset por plataforma
    "linux-x64":   { "pattern": "MiPort-*-linux-x86_64.zip",  "type": "zip",     "executable": "miport" },
    "windows-x64": { "pattern": "MiPort-*-win64.zip",         "type": "zip",     "executable": "miport.exe" },
    "macos-arm64": { "pattern": "MiPort-*-macos-arm64.zip",   "type": "zip",     "executable": "MiPort.app/Contents/MacOS/MiPort" },
    "android":     { "pattern": "MiPort-*.apk",               "type": "apk",     "executable": null }
  },

  "mods": { "dir": "mods", "gameDir": "miport" }
}
```

### Assets

Campos de `assets`:

| Campo | Valor |
|---|---|
| `pattern` | Glob que coincide con el nombre del asset en la release (ej. `MiPort-*-Linux.zip`). |
| `type` | `zip`, `tar.gz`, `appimage` o `apk`. |
| `executable` | Ruta del ejecutable dentro del paquete extraído (`null` para AppImage/APK, que se ejecutan tal cual). |

### Registry

Registro remoto opcional para distribuir manifiestos actualizables:

```bash
brisa config-set registryUrl https://raw.githubusercontent.com/tu/repo/main/manifests/index.json
brisa registry
```

`index.json` es un array de `{ "id": "...", "url": "https://.../<id>.json" }`. Los manifiestos remotos se guardan en `manifests/remote/` y tienen prioridad de carga sobre los locales con el mismo `id`.

### Hashes

Para verificar el hash de un ROM usa `brisa hash roms/turom.z64` y pega el resultado en `sha1`. Cuando hay `sha1`, el escáner prioriza la coincidencia **por hash exacto** antes que por nombre — perfecto cuando un mismo nombre de archivo podría servir para dos ports distintos (como `oot.z64` y `mm.z64`).

## Interfaz web

`brisa serve` arranca una interfaz web local en `http://localhost:7380` con:

- Estado de ROMs, ports, mods y actualizaciones en tiempo real (auto-refresco).
- Instalar, actualizar, desinstalar y lanzar ports con un clic.
- Enlazar/desenlazar mods individualmente.
- **Selector de idioma** (Español / English) en la cabecera. Los idiomas viven en `src/web/lang/*.json` — añade un archivo nuevo y el selector lo mostrará automáticamente.

## Notas por plataforma

- **Android**: los ports con asset `apk` se descargan a `ports/<id>/` (para instalar el APK manualmente o con tu gestor). La detección de Android funciona bajo **Termux** (`TERMUX_VERSION`).
- **Windows**: los symlinks pueden requerir modo desarrollador; si fallan, Brisa copia el archivo como respaldo.
- **macOS**: los `.app` se lanzan desde `Contents/MacOS/`.

## Aviso legal

Brisa no incluye ni descarga ROMs. Los ports nativos requieren el juego original, del que debes poseer una copia legal. Todo el software gestionado es open source (decompilaciones).
