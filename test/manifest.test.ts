import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { importManifests, isValidManifestId } from "../src/core/manifest";
import type { AppConfig } from "../src/core/config";

function makeCfg(): AppConfig {
  const manifestsDir = fs.mkdtempSync(path.join(os.tmpdir(), "brisa-manifests-"));
  return { manifestsDir } as AppConfig;
}

test("manifest: isValidManifestId accepts safe ids only", () => {
  assert.ok(isValidManifestId("soh"));
  assert.ok(isValidManifestId("2ship2harkinian"));
  assert.ok(isValidManifestId("sm64coopdx"));
  assert.ok(isValidManifestId("a.b-c_d"));
  assert.ok(!isValidManifestId(""));
  assert.ok(!isValidManifestId("bad id"));
  assert.ok(!isValidManifestId("../evil"));
  assert.ok(!isValidManifestId(42));
  assert.ok(!isValidManifestId(null));
  assert.ok(!isValidManifestId({ id: "soh" }));
});

test("manifest: importManifests writes valid entries and skips invalid ones", () => {
  const config = makeCfg();
  try {
    const result = importManifests(config, [
      { id: "soh", name: "Ship of Harkinian" },
      { id: "bad id", name: "invalid" },
      null,
      42,
      { name: "sin id" },
    ]);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.errors.length, 4);
    const written = JSON.parse(fs.readFileSync(path.join(config.manifestsDir, "soh.json"), "utf8"));
    assert.strictEqual(written.name, "Ship of Harkinian");
  } finally {
    fs.rmSync(config.manifestsDir, { recursive: true, force: true });
  }
});

test("manifest: importManifests warns when a remote version exists", () => {
  const config = makeCfg();
  try {
    fs.mkdirSync(path.join(config.manifestsDir, "remote"), { recursive: true });
    fs.writeFileSync(path.join(config.manifestsDir, "remote", "soh.json"), "{}");
    const result = importManifests(config, [{ id: "soh", name: "SoH" }]);
    assert.strictEqual(result.imported, 1);
    assert.strictEqual(result.warnings.length, 1);
    assert.match(result.warnings[0], /versión remota que tiene prioridad/);
  } finally {
    fs.rmSync(config.manifestsDir, { recursive: true, force: true });
  }
});

test("manifest: importManifests reports write errors per entry", () => {
  const config = makeCfg();
  try {
    // Un id válido cuyo destino es un directorio: la escritura falla (EISDIR).
    fs.mkdirSync(path.join(config.manifestsDir, "blocked.json"));
    const result = importManifests(config, [{ id: "blocked", name: "X" }]);
    assert.strictEqual(result.imported, 0);
    assert.strictEqual(result.errors.length, 1);
    assert.match(result.errors[0], /^blocked:/);
  } finally {
    fs.rmSync(config.manifestsDir, { recursive: true, force: true });
  }
});
