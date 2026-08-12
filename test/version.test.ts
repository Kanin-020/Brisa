import { test } from "node:test";
import assert from "node:assert";
import { normalizeVersion, appVersion } from "../src/core/version";
import { compareVersions } from "../src/core/selfupdate";

test("version: normalizeVersion strips the leading v", () => {
  assert.strictEqual(normalizeVersion("v1.2.3"), "1.2.3");
  assert.strictEqual(normalizeVersion("1.2.3"), "1.2.3");
  assert.strictEqual(normalizeVersion("v0.3.8"), "0.3.8");
});

test("version: normalizeVersion handles null/empty/whitespace", () => {
  assert.strictEqual(normalizeVersion(null), null);
  assert.strictEqual(normalizeVersion(undefined), null);
  assert.strictEqual(normalizeVersion(""), null);
  assert.strictEqual(normalizeVersion("  "), null);
});

test("version: normalizeVersion trims and is case-insensitive", () => {
  assert.strictEqual(normalizeVersion("  v1.2.3  "), "1.2.3");
  assert.strictEqual(normalizeVersion("V2.0.0"), "2.0.0");
});

test("version: appVersion resolves a non-empty version", () => {
  const v = appVersion();
  assert.strictEqual(typeof v, "string");
  assert.ok(v.length > 0);
  // Formato semver básico x.y.z
  assert.match(v, /^\d+\.\d+\.\d+/);
});

test("version: compareVersions orders semver tags", () => {
  assert.ok(compareVersions("0.3.8", "1.0.0") < 0);
  assert.ok(compareVersions("1.0.0", "0.3.8") > 0);
  assert.ok(compareVersions("1.2.3", "1.2.3") === 0);
  assert.ok(compareVersions("v1.2.3", "1.2.3") === 0);
  assert.ok(compareVersions("1.2", "1.2.0") === 0);
  assert.ok(compareVersions("2.0.0", "2.0.0-rc1") > 0 || compareVersions("2.0.0", "2.0.0-rc1") === 0);
});
