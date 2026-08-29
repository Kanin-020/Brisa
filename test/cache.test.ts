import { test } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { JsonCache } from "../src/core/cache";

function tmpCacheDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brisa-cache-"));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("cache: write then read returns the entry", () => {
  const dir = tmpCacheDir();
  try {
    const cache = new JsonCache<{ value: number }>(dir);
    cache.write("a", { value: 42 });
    assert.deepStrictEqual(cache.read("a"), { value: 42 });
    assert.ok(fs.existsSync(cache.pathFor("a")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cache: missing or corrupt entries read as null", () => {
  const dir = tmpCacheDir();
  try {
    const cache = new JsonCache<{ value: number }>(dir);
    assert.strictEqual(cache.read("missing"), null);
    fs.writeFileSync(cache.pathFor("broken"), "nope");
    assert.strictEqual(cache.read("broken"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cache: read returns null once the entry has expired", async () => {
  const dir = tmpCacheDir();
  try {
    const cache = new JsonCache<{ value: number }>(dir, 30);
    cache.write("a", { value: 1 });
    assert.deepStrictEqual(cache.read("a"), { value: 1 });
    await sleep(60);
    assert.strictEqual(cache.read("a"), null, "caducada ya no se sirve");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cache: readStale keeps serving expired entries (fallback offline)", async () => {
  const dir = tmpCacheDir();
  try {
    const cache = new JsonCache<{ value: number }>(dir, 30);
    cache.write("a", { value: 7 });
    await sleep(60);
    assert.strictEqual(cache.read("a"), null);
    assert.deepStrictEqual(cache.readStale("a"), { value: 7 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
