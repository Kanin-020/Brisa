import { test } from "node:test";
import assert from "node:assert";
import { matchGlob, anyMatch, globToRegExp } from "../src/core/glob";
import { patternSpecificity } from "../src/core/scanner";

test("glob: * matches any filename", () => {
  assert.ok(matchGlob("*", "foo.z64"));
  assert.ok(matchGlob("*", "a"));
  assert.ok(matchGlob("*.z64", "foo.z64"));
  assert.ok(!matchGlob("*.z64", "foo.iso"));
  assert.ok(!matchGlob("*.z64", "foo.z64.bak"));
});

test("glob: ? matches a single character", () => {
  assert.ok(matchGlob("tp.z6?", "tp.z64"));
  assert.ok(!matchGlob("tp.z6?", "tp.z64x"));
  assert.ok(matchGlob("soh.?", "soh.1"));
});

test("glob: character classes [abc] and [!abc]", () => {
  assert.ok(matchGlob("file[0-9].z64", "file3.z64"));
  assert.ok(!matchGlob("file[0-9].z64", "filex.z64"));
  assert.ok(matchGlob("file[!0-9].z64", "filex.z64"));
  assert.ok(!matchGlob("file[!0-9].z64", "file3.z64"));
  assert.ok(matchGlob("file[^0-9].z64", "filex.z64"));
});

test("glob: {a,b} alternation", () => {
  assert.ok(matchGlob("*.{z64,iso}", "game.z64"));
  assert.ok(matchGlob("*.{z64,iso}", "game.iso"));
  assert.ok(!matchGlob("*.{z64,iso}", "game.rvz"));
});

test("glob: nested braces {a,{b,c}}", () => {
  assert.ok(matchGlob("*.{n64,{z64,iso}}", "game.n64"));
  assert.ok(matchGlob("*.{n64,{z64,iso}}", "game.z64"));
  assert.ok(matchGlob("*.{n64,{z64,iso}}", "game.iso"));
  assert.ok(!matchGlob("*.{n64,{z64,iso}}", "game.bin"));
});

test("glob: ** matches across separators, * does not", () => {
  assert.ok(matchGlob("a/**/b.z64", "a/x/y/b.z64"));
  assert.ok(matchGlob("a/**/b.z64", "a/b.z64"));
  assert.ok(!matchGlob("a/*/b.z64", "a/x/y/b.z64"));
});

test("glob: case-insensitive by design", () => {
  assert.ok(matchGlob("TP.Z64", "tp.z64"));
  assert.ok(matchGlob("*.Z64", "GAME.z64"));
});

test("glob: regex metacharacters are escaped", () => {
  // "(game).z64" debe tratarse literalmente, no como grupo.
  assert.ok(matchGlob("(game).z64", "(game).z64"));
  assert.ok(!matchGlob("(game).z64", "game.z64"));
  assert.ok(matchGlob("a+b.z64", "a+b.z64"));
});

test("glob: unclosed brace/class treated literally", () => {
  assert.ok(matchGlob("a{.z64", "a{.z64"));
  assert.ok(matchGlob("a[.z64", "a[.z64"));
});

test("glob: anyMatch checks every pattern", () => {
  assert.ok(anyMatch(["*.iso", "*.rvz"], "game.rvz"));
  assert.ok(!anyMatch(["*.iso", "*.rvz"], "game.z64"));
});

test("glob: globToRegExp anchors to full match", () => {
  const re = globToRegExp("*.z64");
  assert.ok(re.test("foo.z64"));
  assert.ok(!re.test("foo.z64.extra"));
  assert.ok(!re.test("foo.iso"));
  // `*` no cruza separadores, así que no puede cubrir "dir/foo".
  assert.ok(!re.test("dir/foo.z64"));
});

test("scanner: patternSpecificity ranks literal over wildcard", () => {
  // "tp.iso" (literal) gana a "*.iso".
  assert.ok(patternSpecificity(["*.iso", "tp.iso"], "tp.iso") > patternSpecificity(["*.iso"], "tp.iso"));
  // Más prefijo literal = más específico (entre comodines).
  assert.ok(patternSpecificity(["mm.z64", "*.z64"], "mm.z64") > patternSpecificity(["*.z64"], "mm.z64"));
  // Patrón que no coincide devuelve -1.
  assert.strictEqual(patternSpecificity(["*.iso"], "game.z64"), -1);
});
