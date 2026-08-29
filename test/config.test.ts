import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defaultConfig, loadConfig, saveConfig } from "../src/core/config";
import { DEFAULT_SERVER_PORT } from "../src/core/constants";

/** Crea un root temporal apuntado por BRISA_ROOT y devuelve cómo restaurarlo. */
function withTempRoot(fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "brisa-config-"));
  const prev = process.env.BRISA_ROOT;
  process.env.BRISA_ROOT = root;
  try {
    fn(root);
  } finally {
    if (prev === undefined) delete process.env.BRISA_ROOT;
    else process.env.BRISA_ROOT = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("config: defaults without a config file", () => {
  withTempRoot((root) => {
    const cfg = loadConfig();
    assert.strictEqual(cfg.root, root);
    assert.deepStrictEqual(cfg.romsDirs, [path.join(root, "roms")]);
    assert.strictEqual(cfg.romsDir, path.join(root, "roms"));
    assert.strictEqual(cfg.modsDir, path.join(root, "mods"));
    assert.strictEqual(cfg.portsDir, path.join(root, "ports"));
    assert.strictEqual(cfg.cacheDir, path.join(root, "cache"));
    assert.strictEqual(cfg.manifestsDir, path.join(root, "manifests"));
    assert.strictEqual(cfg.stateDir, path.join(root, "cache", "state"));
    assert.strictEqual(cfg.serverPort, DEFAULT_SERVER_PORT);
    assert.strictEqual(cfg.autoCheckUpdates, true);
    assert.strictEqual(cfg.registryUrl, "");
  });
});

test("config: romsDirs wins, legacy romsDir migrates to a single dir", () => {
  withTempRoot((root) => {
    // Legado: solo romsDir.
    fs.writeFileSync(
      path.join(root, "config.json"),
      JSON.stringify({ romsDir: "mis-roms" }),
    );
    let cfg = loadConfig();
    assert.deepStrictEqual(cfg.romsDirs, [path.join(root, "mis-roms")]);
    assert.strictEqual(cfg.romsDir, path.join(root, "mis-roms"));

    // Nuevo: romsDirs gana sobre romsDir.
    fs.writeFileSync(
      path.join(root, "config.json"),
      JSON.stringify({ romsDir: "viejo", romsDirs: ["a", "b"] }),
    );
    cfg = loadConfig();
    assert.deepStrictEqual(cfg.romsDirs, [path.join(root, "a"), path.join(root, "b")]);
  });
});

test("config: dirs resolve against root and scalars are coerced", () => {
  withTempRoot((root) => {
    fs.writeFileSync(
      path.join(root, "config.json"),
      JSON.stringify({
        modsDir: "custom/mods",
        serverPort: "9000",
        autoCheckUpdates: "false",
        registryUrl: "https://example.com/registry.json",
      }),
    );
    const cfg = loadConfig();
    assert.strictEqual(cfg.modsDir, path.join(root, "custom", "mods"));
    assert.strictEqual(cfg.serverPort, 9000);
    assert.strictEqual(cfg.autoCheckUpdates, false);
    assert.strictEqual(cfg.registryUrl, "https://example.com/registry.json");
    // El estado deriva siempre de cacheDir.
    assert.strictEqual(cfg.stateDir, path.join(cfg.cacheDir, "state"));
  });
});

test("config: saveConfig + loadConfig roundtrip", () => {
  withTempRoot((root) => {
    const cfg = defaultConfig();
    cfg.romsDirs = [path.join(root, "r1"), path.join(root, "r2")];
    cfg.romsDir = cfg.romsDirs[0];
    cfg.modsDir = path.join(root, "custom-mods");
    cfg.serverPort = 9999;
    cfg.autoCheckUpdates = false;
    cfg.registryUrl = "https://example.com/registry.json";

    saveConfig(cfg);

    const loaded = loadConfig();
    assert.deepStrictEqual(loaded.romsDirs, cfg.romsDirs);
    assert.strictEqual(loaded.romsDir, cfg.romsDir);
    assert.strictEqual(loaded.modsDir, cfg.modsDir);
    assert.strictEqual(loaded.serverPort, 9999);
    assert.strictEqual(loaded.autoCheckUpdates, false);
    assert.strictEqual(loaded.registryUrl, cfg.registryUrl);
  });
});

test("config: corrupted config falls back to defaults", () => {
  withTempRoot((root) => {
    fs.writeFileSync(path.join(root, "config.json"), "{ not json !!");
    const cfg = loadConfig();
    assert.deepStrictEqual(cfg.romsDirs, [path.join(root, "roms")]);
    assert.strictEqual(cfg.serverPort, DEFAULT_SERVER_PORT);
  });
});
