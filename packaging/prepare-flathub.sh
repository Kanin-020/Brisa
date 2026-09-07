#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prepara packaging/flathub/ para la submission a flathub/flathub:
#   1. sha256 del tarball del tag indicado (rellena el manifest).
#   2. generated-sources.json con flatpak-node-generator (npm).
#   3. Copia del manifest final con tag + sha256.
#
# Uso:
#   bash packaging/prepare-flathub.sh            # usa el último tag
#   bash packaging/prepare-flathub.sh 0.6.2      # tag concreto
#
# Requisitos: curl, sha256sum y flatpak-node-generator
# (pip install --user flatpak-builder-tools  →  comando flatpak-node-generator).
#
# NOTA: el PR en flathub/flathub y su descripción/commit debes abrirlos y
# escribirlos tú (la política de IA de Flathub prohíbe que los genere un agente).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-$(git describe --tags --abbrev=0)}"
VERSION="${VERSION#v}"
REPO_URL="https://github.com/Kanin-020/Brisa/archive/refs/tags/${VERSION}.tar.gz"
OUT="packaging/flathub"
MANIFEST="packaging/io.github.kanin_020.Brisa.yml"

echo "→ Tag: ${VERSION}"
echo "→ Descargando ${REPO_URL} para calcular sha256 …"
TARBALL="$(mktemp)"
trap 'rm -f "$TARBALL"' EXIT
curl -fsSL "$REPO_URL" -o "$TARBALL"
SHA="$(sha256sum "$TARBALL" | cut -d' ' -f1)"
echo "→ sha256 del tag: ${SHA}"

if ! command -v flatpak-node-generator >/dev/null 2>&1; then
  echo "✗ flatpak-node-generator no está instalado." >&2
  echo "  Instálalo con: pip install --user flatpak-builder-tools" >&2
  exit 1
fi

mkdir -p "$OUT"
echo "→ Generando generated-sources.json …"
flatpak-node-generator npm "$(pwd)/package-lock.json"
mv -f generated-sources.json "$OUT/generated-sources.json"

echo "→ Renderizando manifest final …"
sed -e "s|refs/tags/[0-9][0-9.]*|refs/tags/${VERSION}|" \
    -e "s|sha256: TAG_SHA256|sha256: ${SHA}|" \
    "$MANIFEST" > "$OUT/io.github.kanin_020.Brisa.yml"

echo "✓ Listo en packaging/flathub/:"
ls -la "$OUT"
echo
echo "Siguiente paso: valida el build localmente, por ejemplo:"
echo "  flatpak-builder --user --install --force-clean \\"
echo "    build-dir packaging/flathub/io.github.kanin_020.Brisa.yml \\"
echo "    --install-deps-from=flathub"
echo "y después abre el PR en github.com/flathub/flathub copiando el contenido"
echo "de packaging/flathub/ (descripción y commit escritos a mano por ti)."
