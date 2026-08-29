#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Prueba E2E local del auto-update de la propia app Brisa, SIN publicar nada.
//
// Simula una release más nueva en GitHub (stub de fetch + servidor HTTP local
// que sirve el asset) y comprueba de verdad el flujo:
//   1. checkSelfUpdate detecta la actualización y encuentra el asset.
//   2. applySelfUpdate descarga el asset, lanza el updater desacoplado y éste
//      reemplaza el binario y relanza la app (Linux).
//   3. Con --already-latest verifica que, estando al día, NO se descarga ni se
//      lanza nada (el fix del server que evita cerrar la app sin motivo).
//
// Uso:
//   node scripts/test-selfupdate.mjs              # simula release vX.Y.(Z+1)
//   node scripts/test-selfupdate.mjs --already-latest
//   node scripts/test-selfupdate.mjs --keep       # conserva /tmp en fallo
//
// Requiere esbuild (devDependency). Solo Linux y Windows; en Windows el
// runner se limita a comprobar la detección (el updater NSIS con /S solo se
// puede probar de verdad en una máquina Windows real).
// ---------------------------------------------------------------------------
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const ALREADY_LATEST = args.has("--already-latest");
const KEEP = args.has("--keep");

if (process.platform !== "linux" && process.platform !== "win32") {
  console.error("[selfupdate-test] Solo se puede ejecutar en Linux o Windows.");
  process.exit(1);
}

const isWin = process.platform === "win32";
const isArm = process.arch === "arm64" || process.arch === "aarch64";

// Versión instalada real (package.json) y tag simulado (patch +1).
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
// Tolerante a sufijos (p. ej. "0.3.4-rc.1" → "0.3.5").
const bumpPatch = (v) => {
  const m = v.match(/^(\d+\.\d+\.)(\d+)/);
  return m ? m[1] + (Number(m[2]) + 1) : v + ".1";
};
const TAG = ALREADY_LATEST ? pkg.version : bumpPatch(pkg.version);

// Nombre del asset según la nomenclatura de electron-builder (patrón tolerante
// en selfAssetPattern: {x64,x86_64} / {arm64,aarch64}, win/exe o linux/AppImage).
const ASSET_NAME = isWin
  ? `Brisa-win-${isArm ? "arm64" : "x64"}.exe`
  : `Brisa-linux-${isArm ? "aarch64" : "x86_64"}.AppImage`;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "brisa-selfupdate-"));
const BIN_PATH = path.join(TMP, "bin", isWin ? "Brisa.exe" : "Brisa.AppImage");
const ASSET_PATH = path.join(TMP, "asset", ASSET_NAME);
const CACHE_DIR = path.join(TMP, "cache");
const MARKER = path.join(TMP, "relaunched.txt");
fs.mkdirSync(path.dirname(BIN_PATH), { recursive: true });
fs.mkdirSync(path.dirname(ASSET_PATH), { recursive: true });

// "Binario" viejo y asset nuevo: scripts que dejan una marca al ejecutarse.
fs.writeFileSync(BIN_PATH, "#!/bin/sh\necho OLD > " + JSON.stringify(path.join(TMP, "old-ran.txt")) + "\n");
fs.writeFileSync(ASSET_PATH, "#!/bin/sh\necho NEW > " + JSON.stringify(MARKER) + "\n");
if (!isWin) {
  fs.chmodSync(BIN_PATH, 0o755);
  fs.chmodSync(ASSET_PATH, 0o755);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanup() {
  if (!KEEP) fs.rmSync(TMP, { recursive: true, force: true });
  else console.info(`[selfupdate-test] conservado: ${TMP}`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  cleanup();
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Entrada TS que se bundlea con esbuild: instala el stub de fetch, llama a los
// módulos reales de src/core y hace las aserciones. Sin backticks ni ${} para
// poder incrustarla con replaceAll sin escapes.
// ---------------------------------------------------------------------------
const ENTRY = `import * as http from "node:http";
import * as fs from "node:fs";
import { checkSelfUpdate, applySelfUpdate } from "<ROOT>/src/core/selfupdate";
import { defaultConfig } from "<ROOT>/src/core/config";

const ASSET = <ASSET_NAME>;
const ASSET_FILE = <ASSET_PATH>;
const TAG = <TAG>;
const MARKER = <MARKER>;
const CACHE = <CACHE_DIR>;
const ALREADY_LATEST = <ALREADY_LATEST>;
const IS_WIN = <IS_WIN>;

const release = {
  tag_name: TAG,
  name: "v" + TAG,
  published_at: new Date().toISOString(),
  draft: false,
  prerelease: true,
  assets: [{ name: ASSET, browser_download_url: "", size: fs.statSync(ASSET_FILE).size }],
};

// Stub de la API de GitHub: responde siempre con la release simulada.
const orig = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("https://api.github.com/repos/")) {
    const isList = u.includes("/releases?");
    return {
      ok: true,
      status: 200,
      json: async () => (isList ? [release] : release),
      headers: new Headers(),
    };
  }
  return orig(u, opts);
};

// Servidor local que sirve el asset simulado.
const server = http.createServer((req, res) => {
  if (String(req.url).includes(ASSET)) {
    const data = fs.readFileSync(ASSET_FILE);
    res.writeHead(200, { "content-length": data.length, "content-type": "application/octet-stream" });
    res.end(data);
  } else {
    res.writeHead(404);
    res.end("nope");
  }
});

server.listen(0, "127.0.0.1", async () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  release.assets[0].browser_download_url = "http://127.0.0.1:" + port + "/" + ASSET;
  try {
    const config = { ...defaultConfig(), cacheDir: CACHE, selfRepo: "prueba/prueba" };
    const info = await checkSelfUpdate(config, true);
    console.info("[test] check ->", JSON.stringify({ latest: info.latest, available: info.available, supported: info.supported, asset: info.assetName }));
    // El asset debe encontrarse SIEMPRE (protege el patrón de asset): si el
    // patrón estuviera roto, available=false y el test daría un falso positivo.
    if (!info.assetName || !info.downloadUrl) throw new Error("asset no encontrado (¿patrón roto?)");
    if (ALREADY_LATEST) {
      if (info.available) throw new Error("esperado available=false (ya en la última versión)");
      console.info("[test] OK: ya en la última versión → sin descarga ni updater");
      process.exit(0);
    }
    if (!info.available) throw new Error("el check no detectó la actualización");
    if (!info.supported) throw new Error("supported=false (¿faltan APPIMAGE/BRISA_ROOT en el entorno del runner?)");
    if (IS_WIN) {
      // En Windows no lanzamos el updater en el test: el instalador falso no
      // es un PE válido y "start /wait" podría colgarse. Se comprueba solo
      // la detección; el flujo NSIS (/S) se prueba en una máquina Windows.
      console.info("[test] Windows: check OK (asset encontrado). El updater NSIS (/S) requiere prueba manual.");
      process.exit(0);
    }
    const applied = await applySelfUpdate(config, (d, t) => console.info("[test] descarga " + d + "/" + t));
    console.info("[test] applySelfUpdate OK, latest =", applied.latest);
    process.exit(0);
  } catch (e) {
    console.error("[test] ERROR:", e.message);
    process.exit(1);
  }
});
`;

const ENTRY_PATH = path.join(TMP, "entry.ts");
fs.writeFileSync(
  ENTRY_PATH,
  ENTRY.replaceAll("<ROOT>", ROOT)
    .replaceAll("<ASSET_NAME>", JSON.stringify(ASSET_NAME))
    .replaceAll("<ASSET_PATH>", JSON.stringify(ASSET_PATH))
    .replaceAll("<TAG>", JSON.stringify(TAG))
    .replaceAll("<MARKER>", JSON.stringify(MARKER))
    .replaceAll("<CACHE_DIR>", JSON.stringify(CACHE_DIR))
    .replaceAll("<ALREADY_LATEST>", String(ALREADY_LATEST))
    .replaceAll("<IS_WIN>", String(isWin)),
);

// ---------------------------------------------------------------------------
// Bundle + ejecución
// ---------------------------------------------------------------------------
void (async () => {
console.info(`[selfupdate-test] simulando release ${TAG} (actual: ${pkg.version}) en ${process.platform}-${process.arch}`);
console.info(`[selfupdate-test] asset: ${ASSET_NAME}`);

const { build } = await import("esbuild");
const BUNDLE_PATH = path.join(TMP, "bundle.cjs");
try {
  await build({
    entryPoints: [ENTRY_PATH],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: BUNDLE_PATH,
    logLevel: "warning",
  });
} catch (e) {
  fail(`esbuild falló: ${e.message}`);
}

const env = { ...process.env, APPIMAGE: BIN_PATH, BRISA_ROOT: ROOT };
const child = spawn(process.execPath, [BUNDLE_PATH], { env, stdio: "inherit" });
const code = await new Promise((res) => child.on("exit", res));
if (code !== 0) fail(`el runner salió con código ${code}`);

const updaterLog = path.join(CACHE_DIR, "downloads", "self", "updater.log");

if (ALREADY_LATEST) {
  await sleep(1500);
  if (fs.existsSync(updaterLog)) fail("no debería haberse lanzado el updater");
  console.info("✓ ya en la última versión: sin descarga ni updater");
} else if (isWin) {
  // El runner ya comprobó la detección y salió sin lanzar el updater.
  console.info("✓ check OK en Windows. El updater NSIS (/S) se debe probar en una máquina Windows real.");
} else {
  // El updater desacoplado tarda ~2-3 s (espera al proceso, sleep, mv, relanzar).
  let logContent = "";
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (fs.existsSync(updaterLog)) {
      logContent = fs.readFileSync(updaterLog, "utf8");
      if (logContent.includes("OK:") || logContent.includes("FAIL")) break;
    }
    await sleep(300);
  }
  if (!logContent.includes("OK:")) fail(`updater.log no confirma OK: ${logContent || "(sin log)"}`);

  // Linux: el binario debe haberse reemplazado por la versión nueva…
  const binNow = fs.readFileSync(BIN_PATH);
  const assetData = fs.readFileSync(ASSET_PATH);
  if (!binNow.equals(assetData)) fail("el binario no fue reemplazado por la versión nueva");

  // …y la versión nueva debe haberse relanzado sola (escribe la marca).
  const mDeadline = Date.now() + 10000;
  while (!fs.existsSync(MARKER) && Date.now() < mDeadline) await sleep(300);
  if (!fs.existsSync(MARKER)) fail("la versión nueva no se relanzó");
  console.info("✓ el binario fue reemplazado y la versión nueva se relanzó");
}

cleanup();
console.info("\nPASS ✅");
})();
