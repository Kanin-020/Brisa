# Brisa

**Compilador y gestor de ports nativos de PC** al estilo EmuDeck, basado en manifiestos.

## Acerca de

### Qué es

**Brisa** es un recopilador y gestor de **ports nativos de PC** al estilo EmuDeck, basado en **manifiestos** (archivos JSON).

| Juego | Proyecto | Enlace |
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

El proyecto es trivialmente extensible a cualquier port que publique releases en GitHub.

Doy especial agradecimiento a cada uno de los equipos de decompilación, sin ellos este proyecto no sería posible, no olviden dar una estrella a cada uno de los repositorios listados.

### Características

| # | Requisito | Cómo lo hace |
|---|-----------|--------------|
| 1 | **Un solo directorio de ROMs** | Todos los ROMs viven en `roms/`. Al instalar un port, Brisa crea el **symlink** con el nombre exacto que el juego espera (`oot.z64`, `mm.z64`, `tp.iso`, `baserom.gba`) dentro de su carpeta. Los ports **multirom** (SoH: base + Master Quest) enlazan una ROM por requisito automáticamente. |
| 2 | **Escaneo automático al abrir** | `brisa status` (y la GUI web) escanean `roms/`, calculan **SHA1** (con caché), leen el **Game ID** de los discos de GameCube (dusklight), asocian cada ROM a su port por nombre *y* por hash, y te dice qué ports puedes instalar. |
| 3 | **Mods semicentralizados** | Los mods viven en `mods/<juego>/<mod>`. Brisa crea symlinks hacia `ports/<port>/mods/<mod>`, exactamente donde el port los lee. Añadir/quitar un mod = crear/borrar una carpeta en `mods/`. |
| 4 | **Auto update** | Comprueba el último release de GitHub de cada port instalado y lo actualiza (`update`, botón en GUI). La **propia app** también se auto-actualiza: detecta la última AppImage en GitHub, la descarga, reemplaza y relanza sola (`self-update` o el botón de la GUI). |
| 5 | **Manifiestos** | Cada port es un archivo JSON en `manifests/`. Para añadir un port nuevo solo necesitas: el repo de GitHub, los patrones de nombre/hash de su ROM y los patrones de sus assets por plataforma. |
| 6 | **GUI web con i18n** | Interfaz web local con selector de idioma **Español / English** (y cualquier idioma que añadas a `src/web/lang/`). |

## Instalación

### Releases

Descarga el artefacto de la pestaña **Releases** del repositorio:

- **Linux** → `Brisa-<versión>-x86_64.AppImage` (no requiere instalación).
- **Windows** → `Brisa-<versión>-win.zip` (portable, descomprimir y ejecutar).

La AppImage es **a la vez app de escritorio y CLI**, según cómo se ejecute:

- **Doble clic** (o `./Brisa-*.AppImage` sin argumentos) → abre la ventana nativa (GUI).
- **Desde la terminal con argumentos** → se comporta como CLI (ver [Uso → CLI](#uso)).

### Carpeta de usuario

Los archivos se guardan en la **carpeta de usuario**: `Carpeta de Usuario/Brisa` (Linux: `~/Brisa`). Es la raíz de datos que comparten la GUI y el CLI, y contiene:

| Carpeta | Contenido |
|---|---|
| `roms/` | Todos tus ROMs (un solo directorio). |
| `mods/` | Mods semicentralizados por juego. |
| `ports/` | Ports instalados (binarios + ejecutables). |
| `image/` | La AppImage de la propia Brisa (copia que se hace en su primera ejecución) + el ayudante `image/imagen` que usan los launchers de Steam. |
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
├── image/             ← AppImage de Brisa (copia) + ayudante image/imagen
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
  ./Brisa-0.1.0-x86_64.AppImage status        # escanea ROMs, ports, mods y actualizaciones
  ./Brisa-0.1.0-x86_64.AppImage install soh   # instala un port
  ./Brisa-0.1.0-x86_64.AppImage --help         # lista todos los comandos
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
| `brisa uninstall <id>` | Elimina el port y su estado (conserva los archivos marcados en `preserve`). |
| `brisa launch <id> [--wait]` | Ejecuta un port instalado por id (ej. `soh`). `--wait` espera a que el juego termine (útil desde Steam). |
| `brisa srm-config [--out <dir>]` | Genera un launcher `.sh` por port instalado (que usa el CLI de Brisa: `update` + `launch` del port) para añadirlos a Steam como juegos no-Steam. |
| `brisa update [id] [--check]` | Actualiza ports instalados a la última release. |
| `brisa self-update [--check]` | Actualiza la propia app Brisa (AppImage de Linux): descarga la última release, la instala y se relanza sola. |
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

## Launchers para Steam (Steam ROM Manager)

`brisa srm-config` genera **un launcher `.sh` por port instalado** para añadirlos a Steam como **juegos no-Steam** (o usarlos como ejecutable de un parser Glob en Steam ROM Manager).

Los launchers se generan **dentro de la carpeta de usuario de Brisa**, junto al resto de datos (`roms/`, `mods/`, `ports/`, …):

```bash
brisa srm-config                          # crea <raíz de Brisa>/launchers/ (junto a roms/, mods/, …)
brisa srm-config --out ~/launchers        # elige otra carpeta de salida
```

Ejemplo de salida (`launchers/`):

```
launchers/
├── The Legend of Zelda Ocarina of Time.sh
├── The Legend of Zelda Majora's Mask.sh
└── …
```

Cada launcher limpia las variables de Steam y ejecuta el **CLI de la propia Brisa** (su AppImage copiada en `image/`) para actualizar y lanzar el port:

```sh
unset LD_PRELOAD
unset STEAM_COMPAT_DATA_PATH
unset STEAM_COMPAT_CLIENT_INSTALL_PATH
unset STEAM_RUNTIME
"/home/user/Brisa/image/Brisa-0.3.3-x86_64.AppImage" update soh || exit 1
"/home/user/Brisa/image/Brisa-0.3.3-x86_64.AppImage" launch soh --wait || exit 1
```

- El launcher referencia **directamente la AppImage de Brisa en `image/`** (el nombre incluye la versión; si falta la copia —p. ej. en desarrollo— se usa el ayudante `image/imagen` como respaldo).
- **`update <port>`** ejecuta `brisa update <port>`: comprueba en GitHub si el port tiene versión nueva y, si la hay, la descarga e instala antes de jugar.
- **`launch <port> --wait`** ejecuta `brisa launch <port> --wait`: lanza el juego y mantiene el proceso vivo hasta que cierra, para que Steam lo muestre como «en ejecución».
- **La AppImage de Brisa se copia a `image/` en su primera ejecución** (solo la AppImage de Linux; el archivo original no se toca, y las copias de versiones anteriores se limpian). Si borras la copia, se recrea la próxima vez que ejecutes Brisa.

> **Por qué importan los `unset`**: cuando Steam lanza un juego, este hereda variables (`LD_PRELOAD`, `STEAM_COMPAT_*`, `STEAM_RUNTIME`) que **crashean los binarios nativos**. Steam no lanza el shortcut vía shell, así que esos `unset` solo pueden vivir en un script — para eso existe el launcher.

### Cómo usarlos

1. **Steam → Agregar un juego → Agregar un juego no Steam… → Examinar** y elige los `.sh` (`brisa srm-config` ya les da permiso de ejecución).
2. Steam muestra cada launcher con el título del juego; renómbralo si prefieres.
3. Al lanzar, el launcher comprueba/actualiza el port (`update`) y lo arranca (`launch --wait`) con el ROM que ya está enlazado en la carpeta del port (`oot.z64`, `baserom.gba`, …).
4. Los launchers se **crean automáticamente al instalar un port** (y se borran al desinstalarlo). Si falta alguno de un port instalado (p. ej. borraste la carpeta `launchers/`), se **recrea solo** la próxima vez que ejecutes Brisa; `brisa srm-config` regenera todos desde cero.

> Un launcher por port instalado: si un port soporta varias variantes de ROM (p. ej. SoH base + Master Quest), todas las variantes ejecutan el mismo launcher con el ROM que esté enlazado en la carpeta del port.

## Publicar una release (CI/CD)

GitHub Actions compila y publica las releases por ti — no necesitas construir en tu PC:

1. Ve a **Actions → Release → Run workflow**.
2. `version`: vacío sube el patch desde el último tag (`0.3.8` → `0.3.9`); o escribe una versión exacta (`1.2.3` o `v1.2.3`).
3. Opcionalmente marca `prerelease` o añade notas extra.

El workflow: pasa los tests, sube la versión en `package.json`, genera `CHANGELOG.md` desde los commits convencionales (`feat:`, `fix:`, …), crea el tag, buildea la **AppImage de Linux** y el **instalador de Windows** en runners nativos, y publica la **release con el changelog como notas**.

Utilidades locales:

- `node scripts/bump-version.mjs [version]` — fija/sube la versión (dry-run con `--dry-run`).
- `npm run changelog` — imprime el changelog localmente; `node scripts/changelog.mjs <version> --write` actualiza `CHANGELOG.md`.

La **GUI muestra las novedades**: cuando hay una versión nueva de Brisa o de un port, el botón **📝** abre el changelog de esa release.

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
4. **Actualizaciones**: compara el tag de la release instalada con el último de GitHub. En `update` se descarga la nueva versión, se hace backup atómico y se re-enlaza ROM y mods. **Los saves y configuraciones dentro del port se conservan**: se restauran todos los archivos que la nueva versión no trae, y los marcados con `preserve` en el manifiesto ganan sobre el default de la release.
5. **Auto-update del registro**: `registryUrl` permite añadir ports nuevos sin tocar el código, solo con JSON.

Para más detalle sobre la estructura del código y las convenciones, ver
[Arquitectura de Brisa](ARCHITECTURE.md).

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

  "mods": { "dir": "mods", "gameDir": "miport" },

  "preserve": ["saves/**", "settings.json"]  // opcional: datos de usuario que sobreviven a las actualizaciones
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

### Preservar saves y configuraciones (`preserve`)

Al actualizar un port, Brisa **restaura por defecto** todo archivo del port anterior que la nueva release no traiga (saves, configs, mods enlazados, symlinks de ROM). Para los archivos que **sí** vienen en la release (configs por defecto) y deben ganar los del usuario, lista patrones glob en `preserve`:

```json
"preserve": ["saves/**", "settings.json", "userdata/**"]
```

Al **desinstalar** un port también se respetan estos patrones: se borra todo excepto los archivos que coincidan con `preserve`, que se quedan en la carpeta del port (`ports/<id>/`) y se **restauran automáticamente** si vuelves a instalarlo.

## Interfaz web

`brisa serve` arranca una interfaz web local en `http://localhost:7380` con:

- Estado de ROMs, ports, mods y actualizaciones en tiempo real (auto-refresco).
- Instalar, actualizar, desinstalar y lanzar ports con un clic.
- Enlazar/desenlazar mods individualmente.
- **Selector de idioma** (Español / English) en la cabecera. Los idiomas viven en `src/web/lang/*.json` — añade un archivo nuevo y el selector lo mostrará automáticamente.
- **Novedades**: el botón **📝** abre el changelog de la release pendiente (actualización de Brisa o de un port).

## Notas por plataforma

- **Android**: los ports con asset `apk` se descargan a `ports/<id>/` (para instalar el APK manualmente o con tu gestor). La detección de Android funciona bajo **Termux** (`TERMUX_VERSION`).
- **Windows**: los symlinks pueden requerir modo desarrollador; si fallan, Brisa copia el archivo como respaldo.
- **macOS**: los `.app` se lanzan desde `Contents/MacOS/`.

## Aviso legal

Brisa no incluye ni descarga ROMs. Los ports nativos requieren el juego original, del que debes poseer una copia legal. Todo el software gestionado es open source (decompilaciones).
