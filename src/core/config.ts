import * as fs from "node:fs";
import * as path from "node:path";

export interface AppConfig {
  /** Root of the tool (contains package.json, manifests/, roms/, mods/). */
  root: string;
  romsDir: string;
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
}

const CONFIG_FILE = "config.json";

export function projectRoot(): string {
  // Las builds empaquetadas (AppImage/.exe) redirigen la raíz de datos de
  // usuario con PORT_HUB_ROOT (src/desktop/main.ts la establece en $HOME/Port-hub).
  if (process.env.PORT_HUB_ROOT) return path.resolve(process.env.PORT_HUB_ROOT);
  // dist/core/config.js  -> up 2 is project root
  // src/core/config.ts   -> up 2 is project root (tsx dev)
  return path.resolve(__dirname, "..", "..");
}

export function defaultConfig(): AppConfig {
  const root = projectRoot();
  return {
    root,
    romsDir: path.join(root, "roms"),
    modsDir: path.join(root, "mods"),
    portsDir: path.join(root, "ports"),
    cacheDir: path.join(root, "cache"),
    manifestsDir: path.join(root, "manifests"),
    stateDir: path.join(root, "cache", "state"),
    registryUrl: "",
    githubToken: process.env.GITHUB_TOKEN ?? "",
    serverPort: 7380,
    autoCheckUpdates: true,
  };
}

export function loadConfig(): AppConfig {
  const cfg = defaultConfig();
  const file = path.join(cfg.root, CONFIG_FILE);
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AppConfig>;
      if (raw.romsDir) cfg.romsDir = path.resolve(cfg.root, raw.romsDir);
      if (raw.modsDir) cfg.modsDir = path.resolve(cfg.root, raw.modsDir);
      if (raw.portsDir) cfg.portsDir = path.resolve(cfg.root, raw.portsDir);
      if (raw.cacheDir) cfg.cacheDir = path.resolve(cfg.root, raw.cacheDir);
      if (raw.manifestsDir) cfg.manifestsDir = path.resolve(cfg.root, raw.manifestsDir);
      if (raw.registryUrl !== undefined) cfg.registryUrl = raw.registryUrl;
      if (raw.githubToken !== undefined) cfg.githubToken = raw.githubToken;
      if (raw.serverPort !== undefined) cfg.serverPort = raw.serverPort;
      if (raw.autoCheckUpdates !== undefined) cfg.autoCheckUpdates = raw.autoCheckUpdates;
      cfg.stateDir = path.join(cfg.cacheDir, "state");
    }
  } catch {
    // Fall back to defaults.
  }
  return cfg;
}

export function ensureDirs(cfg: AppConfig): void {
  for (const d of [cfg.romsDir, cfg.modsDir, cfg.portsDir, cfg.cacheDir, cfg.stateDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function saveConfig(cfg: AppConfig): void {
  const file = path.join(cfg.root, CONFIG_FILE);
  const out: Record<string, unknown> = {
    romsDir: path.relative(cfg.root, cfg.romsDir),
    modsDir: path.relative(cfg.root, cfg.modsDir),
    portsDir: path.relative(cfg.root, cfg.portsDir),
    cacheDir: path.relative(cfg.root, cfg.cacheDir),
    manifestsDir: path.relative(cfg.root, cfg.manifestsDir),
    registryUrl: cfg.registryUrl,
    serverPort: cfg.serverPort,
    autoCheckUpdates: cfg.autoCheckUpdates,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}
