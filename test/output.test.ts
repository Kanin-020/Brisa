import { test } from "node:test";
import assert from "node:assert";
import { formatBytes } from "../src/cli/output";

test("formatBytes: bytes under 1 KiB", () => {
  assert.strictEqual(formatBytes(0), "0 B");
  assert.strictEqual(formatBytes(1023), "1023 B");
});

test("formatBytes: KiB", () => {
  assert.strictEqual(formatBytes(1024), "1.0 KB");
  assert.strictEqual(formatBytes(1536), "1.5 KB");
});

test("formatBytes: MiB", () => {
  assert.strictEqual(formatBytes(1024 * 1024), "1.0 MB");
  assert.strictEqual(formatBytes(50 * 1024 * 1024), "50.0 MB");
});
