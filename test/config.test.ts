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
    const config = loadConfig();
    assert.strictEqual(config.root, root);
    assert.deepStrictEqual(config.romsDirs, [path.join(root, "roms")]);
    assert.strictEqual(config.romsDir, path.join(root, "roms"));
    assert.strictEqual(config.modsDir, path.join(root, "mods"));
    assert.strictEqual(config.portsDir, path.join(root, "ports"));
    assert.strictEqual(config.cacheDir, path.join(root, "cache"));
    assert.strictEqual(config.manifestsDir, path.join(root, "manifests"));
    assert.strictEqual(config.stateDir, path.join(root, "cache", "state"));
    assert.strictEqual(config.serverPort, DEFAULT_SERVER_PORT);
    assert.strictEqual(config.autoCheckUpdates, true);
    assert.strictEqual(config.registryUrl, "");
  });
});

test("config: romsDirs wins, legacy romsDir migrates to a single dir", () => {
  withTempRoot((root) => {
    // Legado: solo romsDir.
    fs.writeFileSync(
      path.join(root, "config.json"),
      JSON.stringify({ romsDir: "mis-roms" }),
    );
    let config = loadConfig();
    assert.deepStrictEqual(config.romsDirs, [path.join(root, "mis-roms")]);
    assert.strictEqual(config.romsDir, path.join(root, "mis-roms"));

    // Nuevo: romsDirs gana sobre romsDir.
    fs.writeFileSync(
      path.join(root, "config.json"),
      JSON.stringify({ romsDir: "viejo", romsDirs: ["a", "b"] }),
    );
    config = loadConfig();
    assert.deepStrictEqual(config.romsDirs, [path.join(root, "a"), path.join(root, "b")]);
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
    const config = loadConfig();
    assert.strictEqual(config.modsDir, path.join(root, "custom", "mods"));
    assert.strictEqual(config.serverPort, 9000);
    assert.strictEqual(config.autoCheckUpdates, false);
    assert.strictEqual(config.registryUrl, "https://example.com/registry.json");
    // El estado deriva siempre de cacheDir.
    assert.strictEqual(config.stateDir, path.join(config.cacheDir, "state"));
  });
});

test("config: saveConfig + loadConfig roundtrip", () => {
  withTempRoot((root) => {
    const config = defaultConfig();
    config.romsDirs = [path.join(root, "r1"), path.join(root, "r2")];
    config.romsDir = config.romsDirs[0];
    config.modsDir = path.join(root, "custom-mods");
    config.serverPort = 9999;
    config.autoCheckUpdates = false;
    config.registryUrl = "https://example.com/registry.json";

    saveConfig(config);

    const loaded = loadConfig();
    assert.deepStrictEqual(loaded.romsDirs, config.romsDirs);
    assert.strictEqual(loaded.romsDir, config.romsDir);
    assert.strictEqual(loaded.modsDir, config.modsDir);
    assert.strictEqual(loaded.serverPort, 9999);
    assert.strictEqual(loaded.autoCheckUpdates, false);
    assert.strictEqual(loaded.registryUrl, config.registryUrl);
  });
});

test("config: corrupted config falls back to defaults", () => {
  withTempRoot((root) => {
    fs.writeFileSync(path.join(root, "config.json"), "{ not json !!");
    const config = loadConfig();
    assert.deepStrictEqual(config.romsDirs, [path.join(root, "roms")]);
    assert.strictEqual(config.serverPort, DEFAULT_SERVER_PORT);
  });
});
