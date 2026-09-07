# Publicar Brisa en Flathub

Material de apoyo para la submission a Flathub del Flatpak de Brisa.
Sigue la estructura del ejemplo oficial
[Electron en Flatpak](https://docs.flatpak.org/en/latest/electron.html)
(`org.flathub.electron-sample-app`).

## Contenido

| Archivo | Qué es |
|---|---|
| `io.github.kanin_020.Brisa.metainfo.xml` | Metadatos AppStream (obligatorios; se instalan en `/app/share/metainfo/`). |
| `io.github.kanin_020.Brisa.desktop` | Desktop file (se instala en `/app/share/applications/`). |
| `icons/512x512/apps/io.github.kanin_020.Brisa.png` | Icono (copia del icono de la app, 512×512 PNG). |
| `io.github.kanin_020.Brisa.yml` | Manifest **borrador** con marcadores a rellenar. |
| `prepare-flathub.sh` | Genera `packaging/flathub/` listo para la submission (sha256 del tag + `generated-sources.json`). |
| `AI_DISCLOSURE.md` (raíz) | Divulgación de IA (referenciada en README y docs). |

## Requisitos previos (una vez)

1. **Nombre del repo público**: el App ID `io.github.kanin_020.Brisa` deriva del
   repo `github.com/Kanin-020/Brisa`.
2. **Licencia**: `package.json` declara `Apache-2.0` y el `LICENSE` del repo es
   Apache-2.0 (ya coherente). La licencia también va declarada en el metainfo
   (`project_license`).
3. **Icono**: se prefiere SVG; de momento hay PNG 512×512 (mínimo aceptado).

## Antes de cada versión

1. Actualiza `<release version="…" date="…"/>` en el metainfo con la versión y
   fecha nuevas.
2. Añade capturas reales de la UI bajo `<screenshots>` (URLs HTTPS; hoy el
   metainfo no lleva ninguna).
3. Ajusta `runtime-version` / `base-version` si Flathub ya tiene una versión
   más nueva (requisito: usar la última runtime en el momento de la
   submission).

## Generar la carpeta de submission

```bash
bash packaging/prepare-flathub.sh            # último tag
# o
bash packaging/prepare-flathub.sh 0.6.2      # tag concreto
```

Esto produce `packaging/flathub/`:

- `io.github.kanin_020.Brisa.yml` — manifest final con el sha256 del tag.
- `generated-sources.json` — dependencias npm generadas por
  `flatpak-node-generator` (imprescindible: en Flathub **no hay red** durante
  el build).

## Validar el build localmente (recomendado)

Con flatpak instalado (y las runtimes/baseapp correspondientes):

```bash
flatpak-builder --user --install --force-clean \
  build-dir packaging/flathub/io.github.kanin_020.Brisa.yml \
  --install-deps-from=flathub
flatpak run io.github.kanin_020.Brisa
```

Valida también el metainfo:

```bash
appstreamcli validate packaging/io.github.kanin_020.Brisa.metainfo.xml
```

## Abrir la submission

1. Crea un PR en **github.com/flathub/flathub** que añada la carpeta
   `io.github.kanin_020.Brisa/` con el contenido de `packaging/flathub/`.
2. **Escribe tú** la descripción y el commit: la política de IA de Flathub
   prohíbe que un agente de IA abra/automatice el PR o genere su descripción,
   mensajes de commit o comentarios. Incluye la divulgación de IA completa
   (todo el proyecto fue generado con IA bajo supervisión humana) indicando
   partes afectadas y extensión (~100 %).
3. Tras la aceptación, las versiones nuevas se publican actualizando el tag en
   el manifest (PR) y el build lo hace la infraestructura de Flathub para
   `x86_64` y `aarch64`.

## Notas

- **Permisos**: `--filesystem=home` y `--share=network` son amplios. Brisa los
  necesita por diseño (gestiona ROMs/ports/mods en cualquier carpeta del home y
  descarga ports en runtime); documenta el motivo si los revisores preguntan.
  Evalúa si puedes reducirlos (p. ej. `--filesystem=~/Brisa` + `xdg-download`).
- **Auto-update**: el auto-update de Brisa (AppImage/Windows) queda inerte bajo
  Flatpak porque no existe `APPIMAGE`; las actualizaciones llegarán vía Flathub.
- **Self-update del registro de ports** (`registryUrl`) sigue funcionando: usa
  `--share=network`.
- **Envío de ROMs**: Brisa no incluye ni descarga ROMs (solo ports open source
  de decompilaciones); queda declarado en el metainfo.
