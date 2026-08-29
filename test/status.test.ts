import { test } from "node:test";
import assert from "node:assert";
import { normalizeUpdateInfo, normalizeSelfUpdateInfo } from "../src/core/status";
import type { UpdateInfo } from "../src/core/updater";
import type { SelfUpdateInfo } from "../src/core/selfupdate";

function updateInfo(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    id: "soh",
    name: "SoH",
    installed: "v1.2.3",
    latest: "1.4.0",
    available: true,
    notes: "",
    checkedAt: 0,
    ...overrides,
  };
}

function selfInfo(overrides: Partial<SelfUpdateInfo> = {}): SelfUpdateInfo {
  return {
    current: "v0.4.0",
    latest: "0.5.0",
    available: true,
    supported: true,
    notes: "",
    assetName: "Brisa-linux-x86_64.AppImage",
    size: 1,
    downloadUrl: "https://example.com/asset",
    checkedAt: 0,
    ...overrides,
  };
}

test("status: normalizeUpdateInfo strips the leading v and fills notes", () => {
  const normalized = normalizeUpdateInfo(updateInfo());
  assert.strictEqual(normalized.installed, "1.2.3");
  assert.strictEqual(normalized.latest, "1.4.0");
  assert.strictEqual(normalized.notes, "");
});

test("status: normalizeUpdateInfo keeps already normalized values", () => {
  const normalized = normalizeUpdateInfo(updateInfo({ installed: "1.2.3", notes: "fixes" }));
  assert.strictEqual(normalized.installed, "1.2.3");
  assert.strictEqual(normalized.notes, "fixes");
});

test("status: normalizeSelfUpdateInfo strips the leading v and fills notes", () => {
  const normalized = normalizeSelfUpdateInfo(selfInfo());
  assert.strictEqual(normalized.current, "0.4.0");
  assert.strictEqual(normalized.latest, "0.5.0");
  assert.strictEqual(normalized.notes, "");
  // El resto de campos no se tocan.
  assert.strictEqual(normalized.available, true);
  assert.strictEqual(normalized.assetName, "Brisa-linux-x86_64.AppImage");
});
