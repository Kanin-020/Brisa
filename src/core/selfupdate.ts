import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { JsonCache } from './cache';
import { EXECUTABLE_MODE } from './constants';
import type { AppConfig } from './config';
import { download, type ProgressFn } from './download';
import { getLatestRelease, pickAsset } from './github';
import { detectPlatform } from './platform';
import { appVersion, appImagePath, isSelfUpdateSupported } from './version';

export interface SelfUpdateInfo {
  /** Versión instalada actualmente. */
  current: string;
  /** Tag de la última release. */
  latest: string;
  /** True cuando latest > current y existe el asset para esta plataforma. */
  available: boolean;
  /** True cuando el auto-update es posible en este build (AppImage de Linux o instalador de Windows). */
  supported: boolean;
  /** Notas de la release nueva (changelog, markdown). Vacío si no hay. */
  notes: string;
  assetName: string;
  size: number;
  downloadUrl: string;
  checkedAt: number;
}

/** Cache idéntica a la de los ports: como mucho 1 llamada a GitHub cada 30 min. */
const selfCache = (config: AppConfig) =>
  new JsonCache<SelfUpdateInfo>(path.join(config.cacheDir, 'update-check'));

const SELF_CACHE_ID = 'self';

/**
 * Nombre del asset de Brisa según la plataforma (electron-builder artifactName
 * `Brisa-${os}-${arch}.${ext}`). Ojo con la nomenclatura de electron-builder:
 * el OS de Windows es `win` (no `windows`) y el AppImage de Linux usa `x86_64`
 * (no `x64`), por eso el patrón tolera ambas variantes de arch.
 */
export function selfAssetPattern(config: AppConfig): string {
  if (config.selfAssetPattern) return config.selfAssetPattern;
  const p = detectPlatform();
  const os = p.os === 'windows' ? 'win' : p.os;
  const arch = p.arch === 'x64' ? '{x64,x86_64}' : p.arch === 'arm64' ? '{arm64,aarch64}' : p.arch;
  const ext = p.os === 'windows' ? 'exe' : 'AppImage';
  return `Brisa-${os}-${arch}.${ext}`;
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
    .replace(/^v/i, '')
    .match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return [];
  return [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function readCache(config: AppConfig): SelfUpdateInfo | null {
  return selfCache(config).readStale(SELF_CACHE_ID);
}

function writeCache(config: AppConfig, info: SelfUpdateInfo): void {
  selfCache(config).write(SELF_CACHE_ID, info);
}

/**
 * Recalcula los campos que dependen del proceso actual (versión instalada y
 * soporte) y descarta `available` si la caché no tiene un asset descargable
 * (p. ej. escrita por una versión antigua con el patrón de asset roto, con
 * `available: true` pero sin downloadUrl).
 */
function refreshCached(cached: SelfUpdateInfo): SelfUpdateInfo {
  return {
    ...cached,
    current: appVersion(),
    supported: isSelfUpdateSupported(),
    available: cached.available && !!cached.downloadUrl,
    notes: cached.notes ?? '',
  };
}

/** Sin repo configurado o fallo de red: info con available=false. */
function unavailable(
  config: AppConfig,
  latest: string,
  cached?: SelfUpdateInfo | null,
): SelfUpdateInfo {
  return {
    current: appVersion(),
    latest: cached?.latest ?? latest,
    available: false,
    supported: isSelfUpdateSupported(),
    notes: cached?.notes ?? '',
    assetName: cached?.assetName ?? '',
    size: cached?.size ?? 0,
    downloadUrl: cached?.downloadUrl ?? '',
    checkedAt: Date.now(),
  };
}

/**
 * Comprueba si hay una release más reciente de Brisa en GitHub.
 * `force` salta la caché (usado por el comando explícito y antes de actualizar).
 */
export async function checkSelfUpdate(
  config: AppConfig,
  force = false,
): Promise<SelfUpdateInfo | null> {
  if (!config.selfRepo) return null;
  // read() solo devuelve entradas frescas (guardadas hace < 30 min); readStale
  // se usa como último recurso si la red falla.
  const cached = force ? null : selfCache(config).read(SELF_CACHE_ID);
  if (cached) {
    // `current` y `supported` se recalculan siempre: una caché escrita por una
    // versión anterior (o con la detección rota de AppImage por execPath) no
    // debe mostrar una versión instalada vieja.
    return refreshCached(cached);
  }
  const stale = readCache(config);
  try {
    // allowPrerelease: el repo de la app publica sus releases como pre-release;
    // /releases/latest daría 404 y el check fallaría sin esta opción.
    const rel = await getLatestRelease(config, config.selfRepo, { allowPrerelease: true });
    const pattern = selfAssetPattern(config);
    const asset = pickAsset(rel, pattern);
    const info: SelfUpdateInfo = {
      current: appVersion(),
      latest: rel.tag,
      // Solo ofrecer la actualización si el asset de esta plataforma existe:
      // sin archivo descargable no se puede aplicar.
      available: !!asset && compareVersions(rel.tag, appVersion()) > 0,
      supported: isSelfUpdateSupported(),
      notes: rel.body,
      assetName: asset?.name ?? '',
      size: asset?.size ?? 0,
      downloadUrl: asset?.url ?? '',
      checkedAt: Date.now(),
    };
    writeCache(config, info);
    return info;
  } catch {
    // Fallo de red / sin release estable: devolver lo último conocido con
    // `current` y `supported` actualizados, y refrescar la caché SIEMPRE para
    // que una copia obsoleta (p. ej. escrita por una versión antigua de la
    // app) no quede atascada mostrando una versión vieja indefinidamente.
    const info = stale ? refreshCached(stale) : unavailable(config, '?');
    writeCache(config, info);
    return info;
  }
}

/**
 * Descarga el asset de la nueva versión (AppImage en Linux, instalador .exe en
 * Windows) y lanza un updater desacoplado que espera a que este proceso salga
 * (o lo termina), reemplaza/instala la versión nueva y relanza la app.
 */
export async function applySelfUpdate(
  config: AppConfig,
  onProgress?: ProgressFn,
): Promise<SelfUpdateInfo> {
  if (!isSelfUpdateSupported()) {
    throw new Error(
      'El auto-update solo está disponible en las builds empaquetadas ' +
        '(AppImage de Linux o instalador de Windows). Descarga la última versión desde GitHub.',
    );
  }
  const info = await checkSelfUpdate(config, true);
  if (!info) throw new Error('No hay selfRepo configurado (config-set selfRepo <owner/repo>).');
  if (!info.available) return info;

  const dest = path.join(config.cacheDir, 'downloads', 'self', info.assetName);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== info.size) {
    await download(config, info.downloadUrl, dest, onProgress);
  }
  if (fs.statSync(dest).size !== info.size) {
    throw new Error(`Descarga incompleta de ${info.assetName} (${info.size} bytes esperados).`);
  }

  if (process.platform === 'win32') {
    spawnWindowsUpdater(config, dest);
  } else {
    spawnLinuxUpdater(config, dest);
  }
  return info;
}

/**
 * Linux (AppImage): lanza un updater shell desacoplado que espera a que este
 * proceso salga (o lo termina a los 15 s), reemplaza la AppImage y la relanza.
 */
function spawnLinuxUpdater(config: AppConfig, dest: string): void {
  // Dentro de una AppImage process.execPath apunta al mount temporal (de solo
  // lectura); hay que reemplazar el archivo real, que expone $APPIMAGE.
  const oldPath = appImagePath() ?? path.resolve(process.execPath);
  const updater = path.join(config.cacheDir, 'downloads', 'self', 'brisa-updater.sh');
  const log = path.join(config.cacheDir, 'downloads', 'self', 'updater.log');
  fs.writeFileSync(updater, updaterScript(String(process.pid), dest, oldPath, log));
  fs.chmodSync(updater, EXECUTABLE_MODE);
  try {
    const child = spawn('/bin/sh', [updater], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => {
      console.error(`[self-update] no se pudo lanzar el updater: ${err.message}`);
    });
    child.unref();
  } catch (e) {
    throw new Error(`No se pudo lanzar el updater: ${(e as Error).message}`, { cause: e });
  }
}

/**
 * Windows (instalador NSIS): un .cmd desacoplado espera a que la app salga y
 * ejecuta el instalador en silencio (/S); al terminar, el instalador relanza
 * la app automáticamente (comportamiento por defecto de electron-builder).
 */
function spawnWindowsUpdater(config: AppConfig, dest: string): void {
  const updater = path.join(config.cacheDir, 'downloads', 'self', 'brisa-updater.cmd');
  const log = path.join(config.cacheDir, 'downloads', 'self', 'updater.log');
  fs.writeFileSync(updater, windowsUpdaterScript(String(process.pid), dest));
  try {
    // La salida del .cmd se redirige al log para poder depurar.
    const cmdLine = `"${updater}" >> "${log}" 2>&1`;
    const child = spawn('cmd.exe', ['/c', cmdLine], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', (err) => {
      console.error(`[self-update] no se pudo lanzar el updater: ${err.message}`);
    });
    child.unref();
  } catch (e) {
    throw new Error(`No se pudo lanzar el updater: ${(e as Error).message}`, { cause: e });
  }
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

/**
 * Batch de Windows: espera (hasta 60 s) a que Brisa salga; si sigue viva la
 * termina con taskkill /F. Después ejecuta el instalador NSIS en silencio
 * (/S), que instala la nueva versión y relanza la app.
 */
function windowsUpdaterScript(pid: string, installerPath: string): string {
  // Sin enabledelayedexpansion ni bloques parentizados: cada línea se expande
  // al ejecutarse, así que %PID%/%NEW% funcionan y los caracteres raros de la
  // ruta (!, &, ^) se tratan como literales dentro de las comillas.
  return (
    '@echo off\r\n' +
    `rem Generado por Brisa (self-update). Espera al proceso ${pid}, ejecuta el\r\n` +
    'rem instalador NSIS en silencio (/S); al terminar relanza la app.\r\n' +
    `set "PID=${pid}"\r\n` +
    `set "NEW=${installerPath}"\r\n` +
    'set /a i=0\r\n' +
    ':wait\r\n' +
    'tasklist /FI "PID eq %PID%" 2>nul | findstr /C:"%PID%" >nul\r\n' +
    'if errorlevel 1 goto relaunch\r\n' +
    'set /a i+=1\r\n' +
    'if %i% geq 60 goto kill\r\n' +
    'ping -n 2 127.0.0.1 >nul\r\n' +
    'goto wait\r\n' +
    ':kill\r\n' +
    'taskkill /PID %PID% /F >nul 2>nul\r\n' +
    ':relaunch\r\n' +
    'ping -n 2 127.0.0.1 >nul\r\n' +
    'if exist "%NEW%" (\r\n' +
    '  echo [updater] lanzando instalador en silencio...\r\n' +
    '  start "" /wait "%NEW%" /S\r\n' +
    '  echo OK: %NEW%\r\n' +
    ') else (\r\n' +
    '  echo FAIL: %NEW%\r\n' +
    ')\r\n' +
    'endlocal\r\n'
  );
}
