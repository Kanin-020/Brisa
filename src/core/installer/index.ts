import * as fs from "node:fs";
import * as path from "node:path";
import { EXECUTABLE_MODE } from "../constants";
import type { AppConfig } from "../config";
import { download, downloadPath } from "../download";
import { getLatestRelease, pickAsset, type ReleaseInfo } from "../github";
import { loadManifest, type AssetDef, type Manifest } from "../manifest";
import { detectPlatform } from "../platform";
import type { RomFile } from "../scanner";
import { readState, writeState, type PortState } from "../state";
import { writeLauncher, removeLauncher } from "../launchers";
import { throwIfAborted } from "../tasks";
import { extractArchive } from "./archive";
import { createSymlink, findFileByName } from "./links";
import { preserveUserData, removeExceptPreserved } from "./preserve";

export { preserveUserData } from "./preserve";

export interface InstallOptions {
  /** Requirement id -> ROM file to symlink at that requirement's dest. */
  roms?: Record<string, RomFile>;
  force?: boolean;
  onProgress?: (stage: string, done: number, total: number) => void;
  /** Si se aborta, la instalación se detiene en los puntos de control. */
  signal?: AbortSignal;
}

/**
 * Resuelve el asset de la plataforma actual para un manifiesto dado.
 * Primero busca una coincidencia exacta por key de plataforma (ej: "linux-x64"),
 * luego busca por familia de OS (ej: "linux-*") como fallback.
 */
export function resolveAssetForPlatform(manifest: Manifest): AssetDef | null {
  const platform = detectPlatform();
  const directMatch = manifest.assets[platform.key];
  if (directMatch) return directMatch;

  // Fallback: buscar cualquier asset de la misma familia de OS
  const osFamily = platform.os;
  const familyEntry = Object.entries(manifest.assets).find(([key]) =>
    key.startsWith(osFamily),
  );
  return familyEntry ? familyEntry[1] : null;
}

/** Obtiene la ruta del directorio de un port por su id. */
export function portDir(cfg: AppConfig, id: string): string {
  return path.join(cfg.portsDir, id);
}

/** Verifica si un port está instalado (tiene estado y directorio). */
export function isInstalled(cfg: AppConfig, id: string): boolean {
  return readState(cfg, id) !== null && fs.existsSync(portDir(cfg, id));
}

/**
 * Obtiene información de la última release de GitHub para un manifiesto.
 * Retorna null si no se puede acceder a la API (error de red, rate limit, etc.).
 */
export async function getLatestInfo(
  cfg: AppConfig,
  manifest: Manifest,
): Promise<ReleaseInfo | null> {
  try {
    return await getLatestRelease(cfg, manifest.repo);
  } catch (error) {
    console.warn(
      `[${manifest.id}] could not check releases: ${(error as Error).message}`,
    );
    return null;
  }
}

/**
 * Resuelve la ruta del ejecutable del port.
 * Primero busca en la ruta exacta especificada en el asset, luego busca
 * recursivamente por nombre de archivo (case-insensitive) como fallback.
 */
export function resolveExecutable(
  portRoot: string,
  asset: { executable: string | null },
): string | null {
  if (!asset.executable) return null;

  const directPath = path.join(portRoot, asset.executable);
  if (fs.existsSync(directPath)) return directPath;

  // Fallback: buscar recursivamente por basename
  return findFileByName(portRoot, path.basename(asset.executable));
}

/**
 * Descarga y extrae un port desde GitHub.
 *
 * Flujo:
 * 1. Verifica que exista un asset para la plataforma actual
 * 2. Obtiene la información de la release más reciente
 * 3. Descarga el asset (con caché por tamaño)
 * 4. Extrae el archivo al directorio del port
 * 5. Restaura datos de usuario del port anterior
 * 6. Resuelve el ejecutable y aplica permisos
 * 7. Crea symlinks de ROMs
 * 8. Guarda el estado y crea el launcher
 */
export async function installPort(
  cfg: AppConfig,
  manifest: Manifest,
  opts: InstallOptions = {},
): Promise<PortState> {
  const asset = resolveAssetForPlatform(manifest);
  if (!asset) {
    throw new Error(
      `[${manifest.id}] no asset definition for platform ${detectPlatform().key}`,
    );
  }

  // Paso 1: Obtener release
  opts.onProgress?.("release", 0, 1);
  const release = await getLatestInfo(cfg, manifest);
  throwIfAborted(opts.signal);

  if (!release) {
    throw new Error(`[${manifest.id}] no release found for ${manifest.repo}`);
  }

  const assetName = pickAsset(release, asset.pattern);
  if (!assetName) {
    throw new Error(
      `[${manifest.id}] no asset matching "${asset.pattern}" in release ${release.tag}`,
    );
  }

  // Paso 2: Descargar
  const downloadedFile = await downloadAsset(cfg, manifest.id, assetName, opts);

  // Paso 3: Extraer
  await extractToPort(cfg, manifest, asset, assetName, downloadedFile, opts);

  // Paso 4: Configurar ejecutable y permisos
  const portRoot = portDir(cfg, manifest.id);
  const executable = resolveAndSetExecutable(portRoot, asset, assetName);

  // Paso 5: Crear symlinks de ROMs
  const linkedRoms = symlinkRoms(manifest, portRoot, opts.roms);

  // Paso 6: Guardar estado y launcher
  const state = createPortState(manifest, release, assetName, portRoot, executable, linkedRoms);
  writeState(cfg, state);
  writeLauncher(cfg, state);

  return state;
}

/**
 * Descarga el asset de un port si no existe o el tamaño no coincide.
 * Retorna la ruta del archivo descargado.
 */
async function downloadAsset(
  cfg: AppConfig,
  portId: string,
  asset: { name: string; url: string; size: number },
  opts: InstallOptions,
): Promise<string> {
  opts.onProgress?.("download", 0, 1);
  const destination = downloadPath(cfg, portId, asset.name);

  if (fs.existsSync(destination) && fs.statSync(destination).size === asset.size) {
    return destination;
  }

  await download(cfg, asset.url, destination, (done, total) => {
    opts.onProgress?.("download", done, total);
  }, { signal: opts.signal });

  throwIfAborted(opts.signal);
  return destination;
}

/**
 * Extrae el asset descargado al directorio del port.
 * Maneja backup del port anterior y restauración de datos de usuario.
 */
async function extractToPort(
  cfg: AppConfig,
  manifest: Manifest,
  asset: AssetDef,
  assetName: { name: string },
  downloadedFile: string,
  opts: InstallOptions,
): Promise<void> {
  opts.onProgress?.("extract", 0, 1);
  const portRoot = portDir(cfg, manifest.id);
  const backupPath = path.join(cfg.cacheDir, "old", manifest.id);

  // Crear backup del port anterior si existe
  if (fs.existsSync(portRoot)) {
    createBackup(portRoot, backupPath);
  }

  try {
    // Extraer el asset según su tipo
    if (asset.type === "apk" || asset.type === "appimage") {
      extractSingleFile(downloadedFile, portRoot, assetName.name);
    } else {
      await extractArchive(asset, downloadedFile, portRoot);
    }
  } catch (error) {
    // Rollback: descartar el extract parcial antes de devolver el backup
    rollbackExtract(portRoot, backupPath);
    throw error;
  }

  throwIfAborted(opts.signal);

  // Restaurar saves/configs del port anterior
  preserveUserData(backupPath, portRoot, manifest);
  cleanupBackup(backupPath);
}

/** Crea un backup del directorio del port moviéndolo a cache/old. */
function createBackup(portRoot: string, backupPath: string): void {
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  if (fs.existsSync(backupPath)) {
    fs.rmSync(backupPath, { recursive: true, force: true });
  }
  fs.renameSync(portRoot, backupPath);
}

/** Extrae un archivo único (APK/AppImage) al directorio del port. */
function extractSingleFile(source: string, destDir: string, fileName: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(source, path.join(destDir, fileName));
}

/** Realiza rollback si falla la extracción: elimina portRoot y restaura backup. */
function rollbackExtract(portRoot: string, backupPath: string): void {
  if (fs.existsSync(portRoot)) {
    fs.rmSync(portRoot, { recursive: true, force: true });
  }
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, portRoot);
  }
}

/** Elimina el backup después de una extracción exitosa. */
function cleanupBackup(backupPath: string): void {
  if (fs.existsSync(backupPath)) {
    fs.rmSync(backupPath, { recursive: true, force: true });
  }
}

/**
 * Resuelve y configura el ejecutable del port.
 * Para AppImage/APK, el asset file es el ejecutable.
 * Aplica permisos de ejecución en Unix.
 * Retorna la ruta absoluta del ejecutable, o null si no se encontró.
 */
function resolveAndSetExecutable(
  portRoot: string,
  asset: AssetDef,
  assetName: { name: string },
): string | null {
  let executablePath = resolveExecutable(portRoot, asset);

  // Para AppImage/APK, el asset file es el ejecutable
  if (!executablePath && (asset.type === "appimage" || asset.type === "apk")) {
    executablePath = path.join(portRoot, assetName.name);
  }

  // Aplicar permisos de ejecución en Unix
  ensureExecutable(executablePath);
  ensureAllBinariesExecutable(portRoot);

  return executablePath;
}

/**
 * Crea symlinks de ROMs para cada requisito del manifiesto.
 * Solo crea symlinks para ROMs que fueron proporcionadas.
 */
function symlinkRoms(
  manifest: Manifest,
  portRoot: string,
  roms?: Record<string, RomFile>,
): Record<string, string> {
  const providedRoms = roms ?? {};
  const linkedRoms: Record<string, string> = {};

  for (const requirement of manifest.roms) {
    const rom = providedRoms[requirement.id];
    if (rom) {
      createSymlink(rom.path, path.join(portRoot, requirement.dest));
      linkedRoms[requirement.id] = rom.path;
    }
  }

  return linkedRoms;
}

/**
 * Crea el objeto PortState con toda la información del port instalado.
 */
function createPortState(
  manifest: Manifest,
  release: ReleaseInfo,
  assetName: { name: string },
  portRoot: string,
  executable: string | null,
  linkedRoms: Record<string, string>,
): PortState {
  const platform = detectPlatform();
  const relativeExecutable = executable
    ? path.relative(portRoot, executable)
    : assetName.name;

  return {
    id: manifest.id,
    name: manifest.name,
    repo: manifest.repo,
    version: release.tag,
    assetName: assetName.name,
    installedAt: new Date().toISOString(),
    platform: platform.key,
    executable: relativeExecutable,
    romLinked: linkedRoms[manifest.roms[0]?.id ?? ""] ?? null,
    romsLinked: linkedRoms,
  };
}

/**
 * Desinstala un port, conservando archivos marcados con `preserve`.
 * Si hay archivos preserve, se mantienen en el directorio para restauración
 * automática al reinstalar.
 */
export function uninstallPort(cfg: AppConfig, id: string): void {
  // Quitar launcher de Steam antes de borrar directorio/estado
  removeLauncher(cfg, id);

  const manifest = loadManifest(cfg, id);
  const portPath = portDir(cfg, id);

  if (fs.existsSync(portPath)) {
    if (manifest?.preserve && manifest.preserve.length > 0) {
      // Desinstalar sin perder datos de usuario (saves, configs)
      const hasPreservedFiles = removeExceptPreserved(portPath, manifest.preserve);
      if (!hasPreservedFiles) {
        fs.rmSync(portPath, { recursive: true, force: true });
      }
    } else {
      fs.rmSync(portPath, { recursive: true, force: true });
    }
  }

  // Eliminar archivo de estado
  const stateFile = path.join(cfg.cacheDir, "state", `${id}.json`);
  if (fs.existsSync(stateFile)) {
    fs.rmSync(stateFile, { force: true });
  }
}

/**
 * Obtiene la ruta del ejecutable de un port instalado.
 * Retorna null si el port no está instalado o el ejecutable no existe.
 */
export function launchExecutable(cfg: AppConfig, id: string): string | null {
  const state = readState(cfg, id);
  if (!state) return null;

  const executablePath = path.join(portDir(cfg, id), state.executable);
  if (!fs.existsSync(executablePath)) return null;

  ensureExecutable(executablePath);
  return executablePath;
}

/**
 * Aplica permisos de ejecución (chmod +x) en Unix.
 * En Windows no tiene efecto (los permisos no aplican).
 */
export function ensureExecutable(file: string | null): void {
  if (!file || process.platform === "win32") return;

  try {
    fs.chmodSync(file, EXECUTABLE_MODE);
  } catch {
    // Ignorar errores de permisos
  }
}

/**
 * Recorre el directorio del port y aplica chmod +x a todos los binarios ELF.
 * Esto asegura que helpers, librerías compartidas y otros binarios tengan
 * permisos de ejecución. Solo aplica en Unix.
 */
function ensureAllBinariesExecutable(directory: string): void {
  if (process.platform === "win32") return;

  const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7fELF

  const walkDirectory = (currentDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walkDirectory(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      try {
        const stat = fs.statSync(fullPath);
        if (stat.mode & 0o111) continue; // Ya tiene permisos de ejecución

        // Verificar magic bytes de ELF (primeros 4 bytes)
        const fileDescriptor = fs.openSync(fullPath, "r");
        const magicBuffer = Buffer.alloc(4);
        fs.readSync(fileDescriptor, magicBuffer, 0, 4, 0);
        fs.closeSync(fileDescriptor);

        if (magicBuffer.equals(ELF_MAGIC)) {
          fs.chmodSync(fullPath, EXECUTABLE_MODE);
        }
      } catch {
        // Ignorar archivos ilegibles
      }
    }
  };

  walkDirectory(directory);
}
