import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_SERVER_PORT } from "./constants";

export interface AppConfig {
  /** Root of the tool (contains package.json, manifests/, roms/, mods/). */
  root: string;
  /**
   * Carpeta de ROMs principal (la primera de `romsDirs`). Se mantiene para
   * compatibilidad con el código que asume una única carpeta.
   */
  romsDir: string;
  /** Una o más carpetas de ROMs (todas se escanean en busca de ROMs). */
  romsDirs: string[];
  modsDir: string;
  portsDir: string;
  cacheDir: string;
  manifestsDir: string;
  stateDir: string;
  /** Optional URL to a remote manifest index (e.g. a raw JSON or git URL). */
  registryUrl: string;
  /** GitHub token (optional) to avoid rate limits. */
  githubToken: string;
  serverPort: number;
  autoCheckUpdates: boolean;
  /** GitHub "owner/repo" de la propia app Brisa (para el auto-update del AppImage). */
  selfRepo: string;
  /** Patrón glob del asset AppImage de Brisa (vacío = derivado de la plataforma). */
  selfAssetPattern: string;
}

const CONFIG_FILE = "config.json";

/**
 * Carpetas configuradas por rutas relativas a la raíz (se resuelven contra
 * `root` al cargar y se guardan relativas).
 */
const DIR_FIELDS = ["modsDir", "portsDir", "cacheDir", "manifestsDir"] as const;

/** Campos escalares con coerción por tipo. */
const SCALAR_FIELDS = {
  registryUrl: String,
  githubToken: String,
  serverPort: Number,
  autoCheckUpdates: Boolean,
  selfRepo: String,
  selfAssetPattern: String,
} as const;

type ScalarKey = keyof typeof SCALAR_FIELDS;

export function projectRoot(): string {
  // Las builds empaquetadas (AppImage/.exe) redirigen la raíz de datos de
  // usuario con BRISA_ROOT (src/desktop/main.ts la establece en $HOME/Brisa).
  if (process.env.BRISA_ROOT) return path.resolve(process.env.BRISA_ROOT);
  // dist/core/config.js  -> up 2 is project root
  // src/core/config.ts   -> up 2 is project root (tsx dev)
  return path.resolve(__dirname, "..", "..");
}

export function defaultConfig(): AppConfig {
  const root = projectRoot();
  const romsDir = path.join(root, "roms");
  return {
    root,
    romsDir,
    romsDirs: [romsDir],
    modsDir: path.join(root, "mods"),
    portsDir: path.join(root, "ports"),
    cacheDir: path.join(root, "cache"),
    manifestsDir: path.join(root, "manifests"),
    stateDir: path.join(root, "cache", "state"),
    registryUrl: "",
    githubToken: process.env.GITHUB_TOKEN ?? "",
    serverPort: DEFAULT_SERVER_PORT,
    autoCheckUpdates: true,
    selfRepo: "Kanin-020/Brisa",
    selfAssetPattern: "",
  };
}

/** Resuelve el valor crudo de un campo de carpeta contra la raíz. */
function resolveDirField(raw: Partial<AppConfig>, key: string, root: string): string | null {
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" ? path.resolve(root, value) : null;
}

/** Coerce un campo escalar al tipo esperado, o null si no viene en el archivo. */
function coerceScalar(raw: Partial<AppConfig>, key: ScalarKey): unknown {
  const value = (raw as Record<string, unknown>)[key];
  if (value === undefined) return null;
  if (key === "serverPort") return Number(value) || DEFAULT_SERVER_PORT;
  if (key === "autoCheckUpdates") return value === true || value === "true";
  return String(value);
}

export function loadConfig(): AppConfig {
  const cfg = defaultConfig();
  const file = path.join(cfg.root, CONFIG_FILE);
  try {
    if (!fs.existsSync(file)) return cfg;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AppConfig>;
    // `romsDirs` gana; si no existe, se migra el antiguo `romsDir` único.
    if (Array.isArray(raw.romsDirs) && raw.romsDirs.length > 0) {
      cfg.romsDirs = raw.romsDirs.map((d) => path.resolve(cfg.root, String(d)));
    } else if (raw.romsDir) {
      cfg.romsDirs = [path.resolve(cfg.root, raw.romsDir)];
    }
    cfg.romsDir = cfg.romsDirs[0];
    for (const key of DIR_FIELDS) {
      const resolved = resolveDirField(raw, key, cfg.root);
      if (resolved) cfg[key] = resolved;
    }
    for (const key of Object.keys(SCALAR_FIELDS) as ScalarKey[]) {
      const value = coerceScalar(raw, key);
      if (value !== null) (cfg as unknown as Record<string, unknown>)[key] = value;
    }
    cfg.stateDir = path.join(cfg.cacheDir, "state");
  } catch {
    // Archivo corrupto o ilegible: se cae a los valores por defecto.
  }
  return cfg;
}

export function ensureDirs(cfg: AppConfig): void {
  for (const d of [...cfg.romsDirs, cfg.modsDir, cfg.portsDir, cfg.cacheDir, cfg.stateDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function saveConfig(cfg: AppConfig): void {
  const file = path.join(cfg.root, CONFIG_FILE);
  const out: Record<string, unknown> = {
    // Se guardan ambos: `romsDirs` (nuevo) y `romsDir` (compatibilidad con
    // versiones anteriores que solo leen el campo antiguo).
    romsDir: path.relative(cfg.root, cfg.romsDirs[0]),
    romsDirs: cfg.romsDirs.map((d) => path.relative(cfg.root, d)),
    ...Object.fromEntries(DIR_FIELDS.map((key) => [key, path.relative(cfg.root, cfg[key])])),
    ...Object.fromEntries((Object.keys(SCALAR_FIELDS) as ScalarKey[]).map((key) => [key, cfg[key]])),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}
