#!/usr/bin/env node
// ---------------------------------------------------------------------------
// changelog.mjs — genera notas de release en markdown a partir de los commits
// convencionales (feat:, fix:, …) entre el tag anterior y HEAD.
//
// Uso:
//   node scripts/changelog.mjs [newTag] [--write]
//     newTag  : tag de la release nueva (p. ej. 0.3.9 o v0.3.9).
//               Por defecto usa el último tag del repo.
//     --write : además, actualiza CHANGELOG.md con la nueva sección.
//
// Imprime el markdown por stdout (el CI lo usa como body de la release).
// ---------------------------------------------------------------------------
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const stripV = (t) => t.replace(/^v/i, "");

const args = process.argv.slice(2);
const writeMode = args.includes("--write");
const newTag =
  args.find((a) => /^v?\d+\.\d+\.\d+$/.test(a)) || git("describe --tags --abbrev=0");
const newVersion = stripV(newTag);

// Tag anterior: el x.y.z más reciente distinto del nuevo (los tags del repo no
// llevan "v"; se normaliza por si acaso).
const prevTag =
  git("tag --sort=-v:refname")
    .split("\n")
    .map((t) => t.trim())
    .find((t) => SEMVER.test(stripV(t)) && stripV(t) !== newVersion) ?? "";

// Repo para los enlaces de diff (GITHUB_REPOSITORY en CI, o el remoto local).
let repo = process.env.GITHUB_REPOSITORY || "";
if (!repo) {
  const remote = git("remote get-url origin");
  const m = remote.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (m) repo = m[1];
}

// ── Commits entre el tag anterior y HEAD ───────────────────────────────────
const range = prevTag ? `${prevTag}..HEAD` : "";
const log = git(`log --pretty=format:%h%x09%s ${range}`).split("\n").filter(Boolean);

const SECTION_TITLES = {
  feat: "🚀 Novedades",
  fix: "🐛 Correcciones",
  perf: "⚡ Rendimiento",
  refactor: "♻️ Refactor",
  docs: "📚 Documentación",
};
const OTHER_TITLE = "🔧 Otros";

const CONVENTIONAL = /^(feat|fix|perf|refactor|docs|chore|build|ci|test|style)(\([^)]*\))?!?: (.*)$/;

const sections = new Map(); // type -> [{hash, subject}]
const other = [];
const breaking = [];

const RELEASE_COMMIT = /^(chore:\s*)?release\b/i;
const VERSION_ONLY = /^\d+\.\d+\.\d+\s*$/;

for (const line of log) {
  const [hash, ...rest] = line.split("\t");
  const subject = rest.join("\t");
  if (!subject) continue;
  // Se saltan los commits de versión/release (los genera el propio workflow).
  if (RELEASE_COMMIT.test(subject) || VERSION_ONLY.test(subject)) continue;
  if (subject.includes("BREAKING CHANGE") || /^[a-z]+\([^)]*\)!:/.test(subject)) {
    breaking.push({ hash, subject: subject.replace(/^BREAKING CHANGE:\s*/i, "") });
    continue;
  }
  const m = CONVENTIONAL.exec(subject);
  if (m) {
    const type = m[1];
    if (!sections.has(type)) sections.set(type, []);
    sections.get(type).push({ hash, subject: m[3] });
  } else {
    other.push({ hash, subject });
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
const date = new Date().toISOString().slice(0, 10);
const lines = [];
lines.push(`## ${newVersion} (${date})`);

if (log.length === 0) {
  lines.push("", "Sin cambios significativos en esta versión.");
}

const pushSection = (title, items) => {
  if (!items || items.length === 0) return;
  lines.push("", `### ${title}`);
  for (const item of items) lines.push(`- ${item.subject} (\`${item.hash}\`)`);
};

for (const type of ["feat", "fix", "perf", "refactor", "docs"]) {
  pushSection(SECTION_TITLES[type], sections.get(type));
}
if (breaking.length > 0) pushSection("💥 Cambios incompatibles", breaking);
pushSection(OTHER_TITLE, other);

if (repo) {
  if (prevTag) {
    lines.push("", `[Ver diff](${`https://github.com/${repo}/compare/${prevTag}...${newTag}`})`);
  } else {
    lines.push("", `[Repositorio](https://github.com/${repo})`);
  }
}

lines.push("");
const markdown = lines.join("\n");

// ── Escribir CHANGELOG.md (--write) ────────────────────────────────────────
if (writeMode) {
  const HEADER = "# Changelog\n\nTodas las versiones notables de Brisa.\n\n";
  let existing = "";
  if (fs.existsSync(CHANGELOG)) {
    existing = fs.readFileSync(CHANGELOG, "utf8");
  }
  if (!existing.startsWith("# Changelog")) existing = HEADER + existing;

  // Si la sección de esta versión ya existe, se reemplaza; si no, se inserta
  // después de la cabecera (las versiones más nuevas van arriba).
  const sectionRe = new RegExp(`## ${newVersion} .*?(?=\\n## |\\n\\n# |$)`, "s");
  if (sectionRe.test(existing)) {
    existing = existing.replace(sectionRe, markdown.trimEnd());
  } else {
    existing = existing.replace(HEADER, HEADER + markdown + "\n");
  }
  fs.writeFileSync(CHANGELOG, existing);
}

process.stdout.write(markdown + "\n");
