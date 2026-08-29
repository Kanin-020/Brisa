import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sha1File, fileFingerprint, hashCacheFile } from "../src/core/hash";
import type { AppConfig } from "../src/core/config";

test("hash: sha1File computes the expected digest", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brisa-hash-"));
  try {
    const file = path.join(dir, "hello.txt");
    fs.writeFileSync(file, "hello");
    // sha1("hello") conocido.
    assert.strictEqual(await sha1File(file), "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hash: sha1File of empty file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brisa-hash-"));
  try {
    const file = path.join(dir, "empty.bin");
    fs.writeFileSync(file, "");
    // sha1("") = da39a3ee5e6b4b0d3255bfef95601890afd80709
    assert.strictEqual(await sha1File(file), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hash: fileFingerprint reports size and mtime", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brisa-hash-"));
  try {
    const file = path.join(dir, "data.bin");
    fs.writeFileSync(file, Buffer.alloc(4096, 7));
    const fp = fileFingerprint(file);
    assert.strictEqual(fp.size, 4096);
    assert.ok(fp.mtimeMs > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hash: hashCacheFile sanitizes the path and lives under cacheDir/hashes", () => {
  const config = { cacheDir: path.join(os.tmpdir(), "brisa-cache") } as AppConfig;
  const file = path.join(os.tmpdir(), "my roms", "game.v1.2.z64");
  const cache = hashCacheFile(config, file);
  assert.ok(cache.startsWith(path.join(config.cacheDir, "hashes") + path.sep));
  assert.ok(!cache.includes(" "), "cache path must not contain spaces");
  // Misma entrada para la misma ruta (determinista).
  assert.strictEqual(cache, hashCacheFile(config, file));
});
