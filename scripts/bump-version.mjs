#!/usr/bin/env node
// ---------------------------------------------------------------------------
// bump-version.mjs — determina y escribe la nueva versión en package.json.
//
// Uso:
//   node scripts/bump-version.mjs               # sube el patch (0.3.8 -> 0.3.9)
//   node scripts/bump-version.mjs 1.2.3         # fija la versión indicada
//   node scripts/bump-version.mjs 1.2.3 --dry-run  # solo imprime, no escribe
//
// La versión se toma de, en orden: el argumento (normalizando un posible
// prefijo "v"), el último tag con formato x.y.z del repo, o la versión actual
// de package.json. Imprime `version=<nueva>` por stdout (lo usa el CI).
// ---------------------------------------------------------------------------
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = path.join(ROOT, "package.json");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Último tag con formato x.y.z (ignora tags sueltos como "pre-release"). */
function lastSemverTag() {
  return (
    git("tag --sort=-v:refname")
      .split("\n")
      .map((t) => t.trim())
      .find((t) => SEMVER.test(t)) ?? ""
  );
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const wanted = (args.find((a) => !a.startsWith("--")) ?? "").trim();

const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));

let version;
if (wanted) {
  const clean = wanted.replace(/^v/i, "");
  if (!SEMVER.test(clean)) {
    console.error(`Versión inválida: "${wanted}" (usa x.y.z, p. ej. 1.2.3)`);
    process.exit(1);
  }
  version = clean;
} else {
  const base = lastSemverTag() || pkg.version || "0.0.1";
  const m = SEMVER.exec(base);
  if (!m) {
    console.error(`No se pudo derivar una versión de "${base}". Pásala como argumento.`);
    process.exit(1);
  }
  version = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

if (!dryRun) {
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n");
  } else {
    console.error(`(sin cambios: package.json ya está en ${version})`);
  }
}
// Solo la versión en stdout: el CI la parsea con sed y no debe llevar sufijos.
console.log(`version=${version}`);
