import * as fs from "node:fs";
import * as path from "node:path";

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
    serverPort: 7380,
    autoCheckUpdates: true,
    selfRepo: "Kanin-020/Brisa",
    selfAssetPattern: "",
  };
}

export function loadConfig(): AppConfig {
  const cfg = defaultConfig();
  const file = path.join(cfg.root, CONFIG_FILE);
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AppConfig>;
      // `romsDirs` gana; si no existe, se migra el antiguo `romsDir` único.
      if (Array.isArray(raw.romsDirs) && raw.romsDirs.length > 0) {
        cfg.romsDirs = raw.romsDirs.map((d) => path.resolve(cfg.root, String(d)));
      } else if (raw.romsDir) {
        cfg.romsDirs = [path.resolve(cfg.root, raw.romsDir)];
      }
      cfg.romsDir = cfg.romsDirs[0];
      if (raw.modsDir) cfg.modsDir = path.resolve(cfg.root, raw.modsDir);
      if (raw.portsDir) cfg.portsDir = path.resolve(cfg.root, raw.portsDir);
      if (raw.cacheDir) cfg.cacheDir = path.resolve(cfg.root, raw.cacheDir);
      if (raw.manifestsDir) cfg.manifestsDir = path.resolve(cfg.root, raw.manifestsDir);
      if (raw.registryUrl !== undefined) cfg.registryUrl = raw.registryUrl;
      if (raw.githubToken !== undefined) cfg.githubToken = raw.githubToken;
      if (raw.serverPort !== undefined) cfg.serverPort = raw.serverPort;
      if (raw.autoCheckUpdates !== undefined) cfg.autoCheckUpdates = raw.autoCheckUpdates;
      if (raw.selfRepo !== undefined) cfg.selfRepo = raw.selfRepo;
      if (raw.selfAssetPattern !== undefined) cfg.selfAssetPattern = raw.selfAssetPattern;
      cfg.stateDir = path.join(cfg.cacheDir, "state");
    }
  } catch {
    // Fall back to defaults.
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
    modsDir: path.relative(cfg.root, cfg.modsDir),
    portsDir: path.relative(cfg.root, cfg.portsDir),
    cacheDir: path.relative(cfg.root, cfg.cacheDir),
    manifestsDir: path.relative(cfg.root, cfg.manifestsDir),
    registryUrl: cfg.registryUrl,
    serverPort: cfg.serverPort,
    autoCheckUpdates: cfg.autoCheckUpdates,
    selfRepo: cfg.selfRepo,
    selfAssetPattern: cfg.selfAssetPattern,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}
