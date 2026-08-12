import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { preserveUserData, removeExceptPreserved } from "../src/core/installer/preserve";
import type { Manifest } from "../src/core/manifest";

function tmpBase(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brisa-preserve-"));
}

function makeManifest(preserve: string[]): Manifest {
  return {
    id: "test",
    name: "Test",
    game: "Test Game",
    description: "",
    repo: "owner/repo",
    assets: {},
    roms: [],
    mods: { dir: "mods", gameDir: "test" },
    preserve,
  };
}

test("preserve: restores files missing from the new release", () => {
  const base = tmpBase();
  try {
    const backup = path.join(base, "backup");
    const dir = path.join(base, "port");
    // Versión anterior con un save y una config.
    fs.mkdirSync(path.join(backup, "saves"), { recursive: true });
    fs.writeFileSync(path.join(backup, "saves", "slot1.sav"), "data");
    fs.writeFileSync(path.join(backup, "settings.json"), '{"volume": 7}');
    // Nueva release: trae una config por defecto, pero NO el save.
    fs.mkdirSync(path.join(dir, "saves"), { recursive: true });
    fs.writeFileSync(path.join(dir, "settings.json"), '{"volume": 3}');

    preserveUserData(backup, dir, makeManifest([]));

    // El save no viene en la release -> se restaura.
    assert.strictEqual(fs.readFileSync(path.join(dir, "saves", "slot1.sav"), "utf8"), "data");
    // La config SÍ viene en la release y no está en preserve -> gana la release.
    assert.strictEqual(fs.readFileSync(path.join(dir, "settings.json"), "utf8"), '{"volume": 3}');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("preserve: preserved patterns win over release defaults", () => {
  const base = tmpBase();
  try {
    const backup = path.join(base, "backup");
    const dir = path.join(base, "port");
    fs.mkdirSync(backup, { recursive: true });
    fs.writeFileSync(path.join(backup, "settings.json"), '{"volume": 9}');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "settings.json"), '{"volume": 1}');

    preserveUserData(backup, dir, makeManifest(["settings.json"]));

    // settings.json está en preserve -> el del usuario pisa el default.
    assert.strictEqual(fs.readFileSync(path.join(dir, "settings.json"), "utf8"), '{"volume": 9}');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("preserve: symlinks (e.g. linked ROMs) are restored", (t) => {
  const base = tmpBase();
  try {
    const backup = path.join(base, "backup");
    const dir = path.join(base, "port");
    const rom = path.join(base, "game.z64");
    fs.writeFileSync(rom, "rom");
    fs.mkdirSync(backup, { recursive: true });
    try {
      fs.symlinkSync(rom, path.join(backup, "oot.z64"));
    } catch {
      // Windows sin modo desarrollador / permisos: el test no aplica.
      t.skip("symlinks no soportados en este sistema");
      return;
    }
    fs.mkdirSync(dir, { recursive: true });

    preserveUserData(backup, dir, makeManifest([]));

    const restored = path.join(dir, "oot.z64");
    assert.ok(fs.lstatSync(restored).isSymbolicLink(), "symlink must be restored as symlink");
    assert.strictEqual(fs.readFileSync(restored, "utf8"), "rom");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("removeExceptPreserved: deletes everything except preserved paths", () => {
  const base = tmpBase();
  try {
    const root = path.join(base, "root");
    fs.mkdirSync(path.join(root, "saves"), { recursive: true });
    fs.writeFileSync(path.join(root, "saves", "slot1.sav"), "keep");
    fs.writeFileSync(path.join(root, "bin"), "delete");
    fs.mkdirSync(path.join(root, "mods"), { recursive: true });
    fs.writeFileSync(path.join(root, "mods", "foo"), "delete");

    const kept = removeExceptPreserved(root, ["saves/**"]);

    assert.ok(kept, "must report something was kept");
    assert.ok(fs.existsSync(path.join(root, "saves", "slot1.sav")));
    assert.ok(!fs.existsSync(path.join(root, "bin")));
    assert.ok(!fs.existsSync(path.join(root, "mods")), "empty mods dir must be removed");
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("removeExceptPreserved: literal preserved dir keeps the whole dir", () => {
  const base = tmpBase();
  try {
    const root = path.join(base, "root");
    fs.mkdirSync(path.join(root, "saves"), { recursive: true });
    fs.writeFileSync(path.join(root, "saves", "a.sav"), "1");
    fs.writeFileSync(path.join(root, "saves", "b.sav"), "2");
    fs.writeFileSync(path.join(root, "other"), "x");

    removeExceptPreserved(root, ["saves"]);

    assert.ok(fs.existsSync(path.join(root, "saves", "a.sav")));
    assert.ok(fs.existsSync(path.join(root, "saves", "b.sav")));
    assert.ok(!fs.existsSync(path.join(root, "other")));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
