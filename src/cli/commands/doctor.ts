import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import type { App } from "../../core/app";
import { appVersion, isSelfUpdateSupported } from "../../core/version";
import { detectPlatform } from "../../core/platform";

/** Versión mínima de Node exigida por package.json (engines). */
const MIN_NODE = [18, 17];

/**
 * `brisa doctor` — diagnóstico del entorno: versión de Node, configuración,
 * carpetas (existencia + permisos), token de GitHub, conectividad con la API
 * de GitHub y estado general. Salida en texto con ✓/⚠/✗; exit code 1 si hay
 * fallos críticos.
 */
export function registerDoctorCommand(program: Command, app: App): void {
  program
    .command("doctor")
    .description("Diagnóstico del entorno (versiones, carpetas, permisos, red, GitHub).")
    .action(async () => {
      const ok: string[] = [];
      const warn: string[] = [];
      const fail: string[] = [];

      const check = (name: string, pass: boolean, note = ""): void => {
        (pass ? ok : fail).push(`${name}${note ? ` — ${note}` : ""}`);
      };
      const checkWarn = (name: string, note = ""): void => {
        warn.push(`${name}${note ? ` — ${note}` : ""}`);
      };

      console.log(`\n== Diagnóstico de Brisa v${appVersion()} (${detectPlatform().key}) ==\n`);

      // ── Node / entorno ──
      const nodeParts = (process.version.match(/^v(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
      const nodeOk =
        nodeParts.length === 2 &&
        (nodeParts[0] > MIN_NODE[0] || (nodeParts[0] === MIN_NODE[0] && nodeParts[1] >= MIN_NODE[1]));
      check(`Node.js ${process.version} (mínimo ${MIN_NODE.join(".")})`, nodeOk);
      if (isSelfUpdateSupported()) {
        checkWarn("Auto-update de la app disponible (build empaquetada)");
      } else {
        checkWarn("Auto-update de la app NO disponible (build de desarrollo/CLI)");
      }

      // ── Configuración ──
      console.log("\n  Configuración:");
      console.log(`    Raíz: ${app.cfg.root}`);
      console.log(`    Carpetas de ROMs: ${app.cfg.romsDirs.join(", ")}`);
      console.log(`    Mods: ${app.cfg.modsDir}`);
      console.log(`    Ports: ${app.cfg.portsDir}`);
      console.log(`    Cache: ${app.cfg.cacheDir}`);
      console.log(`    Manifests: ${app.cfg.manifestsDir}`);
      console.log(
        `    Registry remoto: ${app.cfg.registryUrl ? app.cfg.registryUrl : "(no configurado)"}`,
      );
      console.log(`    Token de GitHub: ${app.cfg.githubToken ? "(configurado)" : "(no configurado — 60 req/h)"}`);

      // ── Carpetas: existencia + escritura ──
      const dirs: Array<[string, string]> = [
        ...app.cfg.romsDirs.map((d): [string, string] => ["ROMs", d]),
        ["Mods", app.cfg.modsDir],
        ["Ports", app.cfg.portsDir],
        ["Cache", app.cfg.cacheDir],
        ["Manifests", app.cfg.manifestsDir],
      ];
      for (const [label, dir] of dirs) {
        const exists = fs.existsSync(dir);
        let writable = false;
        if (exists) {
          try {
            fs.accessSync(dir, fs.constants.W_OK);
            writable = true;
          } catch {
            writable = false;
          }
        }
        if (!exists) {
          check(`${label} (${dir})`, false, "no existe");
        } else if (!writable) {
          check(`${label} (${dir})`, false, "sin permisos de escritura");
        } else {
          check(`${label} (${dir})`, true);
        }
      }

      // ── GitHub API ──
      let ghNote = "";
      let ghOk = false;
      try {
        const res = await fetch("https://api.github.com/rate_limit", {
          headers: { "User-Agent": "brisa", ...(app.cfg.githubToken ? { Authorization: `Bearer ${app.cfg.githubToken}` } : {}) },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = (await res.json()) as { rate?: { remaining?: number; limit?: number; reset?: number } };
          ghOk = true;
          ghNote = `alcanzable (${data.rate?.remaining ?? "?"}/${data.rate?.limit ?? "?"} req/h restantes)`;
        } else {
          ghNote = `HTTP ${res.status}`;
        }
      } catch (e) {
        ghNote = `no alcanzable: ${(e as Error).message}`;
      }
      checkWarn(`GitHub API — ${ghNote}`);
      if (ghOk && !app.cfg.githubToken) {
        checkWarn("Sin GITHUB_TOKEN: añade `githubToken` a config.json si sufres rate limits");
      }
      if (!app.cfg.registryUrl) {
        checkWarn("registryUrl vacío: los manifiestos remotos no se refrescan (brisa registry)");
      }

      // ── Estado ──
      const installed = app.installed();
      console.log(`\n  Ports instalados: ${installed.length}`);
      if (installed.length > 0) {
        const missingDir = installed.filter((s) => !fs.existsSync(path.join(app.cfg.portsDir, s.id)));
        if (missingDir.length > 0) {
          check(`Carpetas de ports instalados`, false, `${missingDir.length} sin carpeta (reinstala: brisa install)`);
        } else {
          check(`Carpetas de ports instalados (${installed.length})`, true);
        }
      }

      // ── Resumen ──
      const print = (lines: string[], mark: string) => lines.forEach((line) => console.log(`  ${mark} ${line}`));
      print(ok, "✓");
      print(warn, "⚠");
      print(fail, "✗");
      console.log("");
      if (fail.length > 0) {
        console.error(`✗ ${fail.length} problema(s) crítico(s) detectado(s).`);
        process.exitCode = 1;
      } else {
        console.log(`✓ Entorno OK${warn.length > 0 ? ` (${warn.length} aviso(s))` : ""}`);
      }
    });
}
