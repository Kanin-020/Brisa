import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { AppConfig } from "./config";
import { download, type ProgressFn } from "./download";
import { getLatestRelease, pickAsset } from "./github";
import { detectPlatform } from "./platform";
import { appVersion, isAppImage } from "./version";

export interface SelfUpdateInfo {
  /** Versión instalada actualmente. */
  current: string;
  /** Tag de la última release. */
  latest: string;
  /** True cuando latest > current. */
  available: boolean;
  /** True cuando el auto-update es posible en este build (AppImage Linux). */
  supported: boolean;
  assetName: string;
  size: number;
  downloadUrl: string;
  checkedAt: number;
}

/** Cache idéntica a la de los ports: como mucho 1 llamada a GitHub cada 30 min. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

const cacheFile = (cfg: AppConfig) => path.join(cfg.cacheDir, "update-check", "self.json");

/** Nombre del asset AppImage de Brisa según la plataforma (electron-builder artifactName). */
export function selfAssetPattern(cfg: AppConfig): string {
  if (cfg.selfAssetPattern) return cfg.selfAssetPattern;
  const p = detectPlatform();
  return `Brisa-${p.os}-${p.arch}.AppImage`;
}

/** Compara versiones/tags tipo "0.3.0", "v1.2.3" (ignora pre-releases suffix). */
export function compareVersions(a: string, b: string): number {
  const pa = parseParts(a);
  const pb = parseParts(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function parseParts(v: string): number[] {
  const m = v
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [];
  return [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function readCache(cfg: AppConfig): SelfUpdateInfo | null {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(cfg), "utf8")) as SelfUpdateInfo;
  } catch {
    return null;
  }
}

function writeCache(cfg: AppConfig, info: SelfUpdateInfo): void {
  fs.mkdirSync(path.dirname(cacheFile(cfg)), { recursive: true });
  fs.writeFileSync(cacheFile(cfg), JSON.stringify(info));
}

/** Sin repo configurado o fallo de red: info con available=false. */
function unavailable(cfg: AppConfig, latest: string, cached?: SelfUpdateInfo | null): SelfUpdateInfo {
  return {
    current: appVersion(),
    latest: cached?.latest ?? latest,
    available: false,
    supported: isAppImage(),
    assetName: cached?.assetName ?? "",
    size: cached?.size ?? 0,
    downloadUrl: cached?.downloadUrl ?? "",
    checkedAt: Date.now(),
  };
}

/**
 * Comprueba si hay una release más reciente de Brisa en GitHub.
 * `force` salta la caché (usado por el comando explícito y antes de actualizar).
 */
export async function checkSelfUpdate(cfg: AppConfig, force = false): Promise<SelfUpdateInfo | null> {
  if (!cfg.selfRepo) return null;
  const cached = readCache(cfg);
  if (!force && cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
    return cached;
  }
  try {
    const rel = await getLatestRelease(cfg, cfg.selfRepo);
    const pattern = selfAssetPattern(cfg);
    const asset = pickAsset(rel, pattern);
    const info: SelfUpdateInfo = {
      current: appVersion(),
      latest: rel.tag,
      available: compareVersions(rel.tag, appVersion()) > 0,
      supported: isAppImage(),
      assetName: asset?.name ?? "",
      size: asset?.size ?? 0,
      downloadUrl: asset?.url ?? "",
      checkedAt: Date.now(),
    };
    writeCache(cfg, info);
    return info;
  } catch {
    // Fallo de red / repo sin releases: cachear también para no golpear la API
    // de GitHub en cada poll del status (la web consulta cada 8 s).
    const info = cached ?? unavailable(cfg, "?");
    if (!cached) writeCache(cfg, info);
    return info;
  }
}

/**
 * Descarga la nueva AppImage y lanza un updater desacoplado que espera a que
 * este proceso salga (o lo termina a los 15 s), reemplaza el binario actual
 * y relanza la app con la versión nueva.
 */
export async function applySelfUpdate(
  cfg: AppConfig,
  onProgress?: ProgressFn,
): Promise<SelfUpdateInfo> {
  if (!isAppImage()) {
    throw new Error(
      "El auto-update solo está disponible desde la AppImage de Linux. " +
        "Descarga la última versión desde GitHub.",
    );
  }
  const info = await checkSelfUpdate(cfg, true);
  if (!info) throw new Error("No hay selfRepo configurado (config-set selfRepo <owner/repo>).");
  if (!info.available) return info;

  const dest = path.join(cfg.cacheDir, "downloads", "self", info.assetName);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== info.size) {
    await download(cfg, info.downloadUrl, dest, onProgress);
  }
  if (fs.statSync(dest).size !== info.size) {
    throw new Error(`Descarga incompleta de ${info.assetName} (${info.size} bytes esperados).`);
  }

  const oldPath = path.resolve(process.execPath);
  const updater = path.join(cfg.cacheDir, "downloads", "self", "brisa-updater.sh");
  const log = path.join(cfg.cacheDir, "downloads", "self", "updater.log");
  fs.writeFileSync(updater, updaterScript(String(process.pid), dest, oldPath, log));
  fs.chmodSync(updater, 0o755);

  try {
    const child = spawn("/bin/sh", [updater], { detached: true, stdio: "ignore" });
    child.on("error", (err) => {
      console.error(`[self-update] no se pudo lanzar el updater: ${err.message}`);
    });
    child.unref();
  } catch (e) {
    throw new Error(`No se pudo lanzar el updater: ${(e as Error).message}`);
  }
  return info;
}

/**
 * El script espera (hasta 15 s) a que el proceso padre salga; si sigue vivo lo
 * termina con SIGTERM. Después reemplaza la AppImage y la relanza. Es
 * deliberadamente tolerante: `mv -f` sobre una AppImage en ejecución funciona
 * en Linux porque el proceso mantiene abierto el inode antiguo.
 */
function updaterScript(pid: string, newPath: string, oldPath: string, log: string): string {
  return `#!/bin/sh
# Generado por Brisa (self-update). Espera al proceso ${pid}, reemplaza la
# AppImage y la relanza.
PID=${pid}
NEW=${JSON.stringify(newPath)}
OLD=${JSON.stringify(oldPath)}
LOG=${JSON.stringify(log)}
{
  i=0
  while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 15 ]; do
    sleep 1
    i=$((i + 1))
  done
  if kill -0 "$PID" 2>/dev/null; then
    echo "terminando proceso $PID"
    kill -TERM "$PID" 2>/dev/null
    i=0
    while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 10 ]; do
      sleep 1
      i=$((i + 1))
    done
  fi
  sleep 1
  if [ -f "$NEW" ] && mv -f "$NEW" "$OLD"; then
    chmod +x "$OLD"
    echo "OK: $OLD"
    nohup "$OLD" >/dev/null 2>&1 &
  else
    echo "FAIL"
    exit 1
  fi
} >> "$LOG" 2>&1
`;
}
