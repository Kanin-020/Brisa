# Port Hub — Español

**Compilador y gestor de ports nativos de PC** al estilo EmuDeck, basado en manifiestos.

## Acerca de Port Hub

**Port Hub** es un compilador y gestor de **ports nativos de PC** al estilo EmuDeck, basado en **manifiestos**(archivos JSON). 

| Juego | Proyecto | Enlace |
|--------|----------|--------|
| The Legend of Zelda: Ocarina of Time | Ship of Harkinian (SoH) | [GitHub](https://github.com/HarbourMasters/Shipwright) |
| The Legend of Zelda: Majora's Mask | 2Ship2Harkinian (2S2H) | [GitHub](https://github.com/HarbourMasters/2ship2harkinian) |
| The Legend of Zelda: Twilight Princess | DUSKLIGHT | [GitHub](https://github.com/TwilitRealm/dusklight) |
| The Legend of Zelda: The Minish Cap | Project Picori | [GitHub](https://github.com/999sian/tmc) |


El proyecto es trivialmente extensible a cualquier port que publique releases en GitHub.

Doy especial agradecimiento a cada uno de los equipos de decompilación, sin ellos este proeyecto no sería posible, no olviden dar una estrella a cada uno de los repositorios listados.

---

## Características

| # | Requisito | Cómo lo hace |
|---|-----------|--------------|
| 1 | **Un solo directorio de ROMs** | Todos los ROMs viven en `roms/`. Al instalar un port, Port Hub crea el **symlink** con el nombre exacto que el juego espera (`oot.z64`, `mm.z64`, `tp.iso`, `baserom.gba`) dentro de su carpeta. Los ports **multirom** (SoH: base + Master Quest) enlazan una ROM por requisito automáticamente. |
| 2 | **Escaneo automático al abrir** | `port-hub status` (y la GUI web) escanean `roms/`, calculan **SHA1** (con caché), leen el **Game ID** de los discos de GameCube (dusklight), asocian cada ROM a su port por nombre *y* por hash, y te dice qué ports puedes instalar. |
| 3 | **Mods semicentralizados** | Los mods viven en `mods/<juego>/<mod>`. Port Hub crea symlinks hacia `ports/<port>/mods/<mod>`, exactamente donde el port los lee. Añadir/quitar un mod = crear/borrar una carpeta en `mods/`. |
| 4 | **Auto update** | Comprueba el último release de GitHub de cada port instalado y lo actualiza (`update`, botón en GUI). También puede refrescar un registro remoto de manifiestos. |
| 5 | **Manifiestos** | Cada port es un archivo JSON en `manifests/`. Para añadir un port nuevo solo necesitas: el repo de GitHub, los patrones de nombre/hash de su ROM y los patrones de sus assets por plataforma. |
| 6 | **GUI web con i18n** | Interfaz web local con selector de idioma **Español / English** (y cualquier idioma que añadas a `src/web/lang/`). |

---

## Requisitos

- **Node.js ≥ 18.17** (se usa el `fetch` nativo).
- Linux, Windows, macOS, Steam Deck o Android (Termux).
- Los ROMs originales de los juegos (obténlos legalmente, desde tus propios cartuchos/discos).

## Instalación

```bash
npm install
npm run build
npm link            # opcional: expone el comando `port-hub` globalmente
```

## Uso rápido

```bash
# 1) Pon tus ROMs en roms/
cp "Ocarina of Time.z64" roms/

# 2) Escanea: detecta ROMs, hashes y qué ports se pueden instalar
port-hub status

# 3) Instala un port (descarga el release correcto para tu plataforma,
#    lo extrae en ports/soh/ y crea el symlink del ROM)
port-hub install soh

# 4) Mods: crea carpetas en mods/soh/ y enlázalas
mkdir -p "mods/soh/Mi Mod"
port-hub mods-link soh

# 5) Actualiza todos los ports instalados
port-hub update

# 6) Interfaz web (GUI local)
port-hub serve          # → http://localhost:7380
```

## Estructura de carpetas

```
port-hub/
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

## Comandos

| Comando | Descripción |
|---|---|
| `port-hub status` | Escaneo completo: ROMs, ports, mods, actualizaciones. |
| `port-hub scan` | Solo escanea y lista coincidencias ROM↔port. |
| `port-hub install <id> [--force]` | Descarga + instala + enlaza ROM y mods. |
| `port-hub uninstall <id>` | Elimina el port y su estado. |
| `port-hub launch <id>` | Ejecuta el port instalado. |
| `port-hub update [id] [--check]` | Actualiza ports instalados a la última release. |
| `port-hub mods <id>` | Lista mods centralizados de un port. |
| `port-hub mods-link <id>` | Enlaza todos los mods del port. |
| `port-hub mods-unlink <id> [mod]` | Desenlaza mods. |
| `port-hub registry` | Descarga manifiestos remotos desde `registryUrl`. |
| `port-hub hash <archivo>` | Calcula el SHA1 (para rellenar manifiestos). |
| `port-hub config` / `config-set <k> <v>` | Ver/editar configuración. |
| `port-hub serve` | GUI web local. |
| `port-hub manifest-test <pattern>` | Depura un patrón glob. |

## Cómo añadir un port nuevo (en 5 minutos)

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

Campos de `assets`:

| Campo | Valor |
|---|---|
| `pattern` | Glob que coincide con el nombre del asset en la release (ej. `MiPort-*-Linux.zip`). |
| `type` | `zip`, `tar.gz`, `appimage` o `apk`. |
| `executable` | Ruta del ejecutable dentro del paquete extraído (`null` para AppImage/APK, que se ejecutan tal cual). |

Para verificar el hash de un ROM usa `port-hub hash roms/turom.z64` y pega el resultado en `sha1`. Cuando hay `sha1`, el escáner prioriza la coincidencia **por hash exacto** antes que por nombre — perfecto cuando un mismo nombre de archivo podría servir para dos ports distintos (como `oot.z64` y `mm.z64`).

### Registro remoto (opcional)

Para distribuir manifiestos actualizables:

```bash
port-hub config-set registryUrl https://raw.githubusercontent.com/tu/repo/main/manifests/index.json
port-hub registry
```

`index.json` es un array de `{ "id": "...", "url": "https://.../<id>.json" }`. Los manifiestos remotos se guardan en `manifests/remote/` y tienen prioridad de carga sobre los locales con el mismo `id`.

## Interfaz web (GUI)

`port-hub serve` arranca una interfaz web local en `http://localhost:7380` con:

- Estado de ROMs, ports, mods y actualizaciones en tiempo real (auto-refresco).
- Instalar, actualizar, desinstalar y lanzar ports con un clic.
- Enlazar/desenlazar mods individualmente.
- **Selector de idioma** (Español / English) en la cabecera. Los idiomas viven en `src/web/lang/*.json` — añade un archivo nuevo y el selector lo mostrará automáticamente.

---

## Cómo funciona por debajo

1. **Escaneo**: recorre `roms/`, calcula SHA1 con caché por tamaño+mtime, y para cada manifiesto busca su ROM por nombre (patrones), Game ID (discos GameCube) y/o hash exacto.
2. **Instalación**: consulta la API de GitHub (`/releases/latest`), elige el asset según `platform.key` (`linux-x64`, `windows-arm64`, `android`, …), lo descarga a `cache/downloads/`, lo extrae en `ports/<id>/` y crea el symlink `ports/<id>/<dest> → roms/<archivo>` para **cada** requisito con ROM presente (multirom: `oot.z64` + `oot-mq.z64`).
3. **Mods**: `mods/<gameDir>/<mod>` se enlaza a `ports/<id>/<dir>/<mod>`. Se re-enlazan automáticamente tras instalar/actualizar.
4. **Actualizaciones**: compara el tag de la release instalada con el último de GitHub. En `update` se descarga la nueva versión, se hace backup atómico y se re-enlaza ROM y mods.
5. **Auto-update del registro**: `registryUrl` permite añadir ports nuevos sin tocar el código, solo con JSON.

## Estado de los ports incluidos

| Port | Juego | Repo | ROM requerido |
|---|---|---|---|
| `soh` | Ocarina of Time | `HarbourMasters/Shipwright` | OoT NTSC 1.0 (`.z64`/`.n64`) + Master Quest (opcional) |
| `2ship2harkinian` | Majora's Mask | `HarbourMasters/2ship2harkinian` | MM NTSC-U 1.0 (`.z64`/`.n64`) |
| `dusklight` | Twilight Princess | `TwilitRealm/dusklight` | TP NTSC-U/PAL GameCube ISO (`.iso`/`.gcz`) |
| `tmc` | The Minish Cap | `999sian/tmc` | Minish Cap GBA (`.gba`) |

## Notas por plataforma

- **Android**: los ports con asset `apk` se descargan a `ports/<id>/` (para instalar el APK manualmente o con tu gestor). La detección de Android funciona bajo **Termux** (`TERMUX_VERSION`).
- **Windows**: los symlinks pueden requerir modo desarrollador; si fallan, Port Hub copia el archivo como respaldo.
- **macOS**: los `.app` se lanzan desde `Contents/MacOS/`.

## Aviso legal

Port Hub no incluye ni descarga ROMs. Los ports nativos requieren el juego original, del que debes poseer una copia legal. Todo el software gestionado es open source (decompilaciones).
