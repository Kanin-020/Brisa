import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import type { App } from '../../core/app';
import { GITHUB_API_BASE, USER_AGENT } from '../../core/constants';
import { detectPlatform } from '../../core/platform';
import { compareVersions } from '../../core/selfupdate';
import { appVersion, isSelfUpdateSupported } from '../../core/version';

/** Versión mínima de Node exigida por package.json (engines). */
const MIN_NODE_VERSION = '18.17';

/** Colecciona los resultados del diagnóstico (✓ / ⚠ / ✗). */
interface CheckCollector {
  ok: string[];
  warnings: string[];
  fails: string[];
  check(name: string, pass: boolean, note?: string): void;
  warn(name: string, note?: string): void;
}

function collector(): CheckCollector {
  const result = { ok: [] as string[], warnings: [] as string[], fails: [] as string[] };
  return {
    ...result,
    check: (name, pass, note = '') => {
      (pass ? result.ok : result.fails).push(`${name}${note ? ` — ${note}` : ''}`);
    },
    warn: (name, note = '') => {
      result.warnings.push(`${name}${note ? ` — ${note}` : ''}`);
    },
  };
}

/** True cuando la versión de Node instalada es >= MIN_NODE_VERSION. */
function nodeVersionOk(nodeVersion: string): boolean {
  return compareVersions(nodeVersion.replace(/^v/, ''), MIN_NODE_VERSION) >= 0;
}

/** Comprueba que la carpeta exista y sea escribible. */
function dirStatus(dir: string): { exists: boolean; writable: boolean } {
  const exists = fs.existsSync(dir);
  if (!exists) return { exists, writable: false };
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return { exists, writable: true };
  } catch {
    return { exists, writable: false };
  }
}

/** Consulta el rate limit de GitHub y devuelve una nota legible (o un mensaje de error). */
async function githubRateLimitNote(token: string): Promise<{ ok: boolean; note: string }> {
  try {
    const res = await fetch(`${GITHUB_API_BASE}/rate_limit`, {
      headers: { 'User-Agent': USER_AGENT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };
    const data = (await res.json()) as { rate?: { remaining?: number; limit?: number } };
    return {
      ok: true,
      note: `alcanzable (${data.rate?.remaining ?? '?'}/${data.rate?.limit ?? '?'} req/h restantes)`,
    };
  } catch (e) {
    return { ok: false, note: `no alcanzable: ${(e as Error).message}` };
  }
}

/**
 * `brisa doctor` — diagnóstico del entorno: versión de Node, configuración,
 * carpetas (existencia + permisos), token de GitHub, conectividad con la API
 * de GitHub y estado general. Salida en texto con ✓/⚠/✗; exit code 1 si hay
 * fallos críticos.
 */
export function registerDoctorCommand(program: Command, app: App): void {
  program
    .command('doctor')
    .description('Diagnóstico del entorno (versiones, carpetas, permisos, red, GitHub).')
    .action(async () => {
      const c = collector();

      console.log(`\n== Diagnóstico de Brisa v${appVersion()} (${detectPlatform().key}) ==\n`);

      // ── Node / entorno ──
      c.check(
        `Node.js ${process.version} (mínimo ${MIN_NODE_VERSION})`,
        nodeVersionOk(process.version),
      );
      if (isSelfUpdateSupported()) {
        c.warn('Auto-update de la app disponible (build empaquetada)');
      } else {
        c.warn('Auto-update de la app NO disponible (build de desarrollo/CLI)');
      }

      // ── Configuración ──
      console.log('\n  Configuración:');
      console.log(`    Raíz: ${app.cfg.root}`);
      console.log(`    Carpetas de ROMs: ${app.cfg.romsDirs.join(', ')}`);
      console.log(`    Mods: ${app.cfg.modsDir}`);
      console.log(`    Ports: ${app.cfg.portsDir}`);
      console.log(`    Cache: ${app.cfg.cacheDir}`);
      console.log(`    Manifests: ${app.cfg.manifestsDir}`);
      console.log(
        `    Registry remoto: ${app.cfg.registryUrl ? app.cfg.registryUrl : '(no configurado)'}`,
      );
      console.log(
        `    Token de GitHub: ${app.cfg.githubToken ? '(configurado)' : '(no configurado — 60 req/h)'}`,
      );

      // ── Carpetas: existencia + escritura ──
      const dirs: Array<[string, string]> = [
        ...app.cfg.romsDirs.map((d): [string, string] => ['ROMs', d]),
        ['Mods', app.cfg.modsDir],
        ['Ports', app.cfg.portsDir],
        ['Cache', app.cfg.cacheDir],
        ['Manifests', app.cfg.manifestsDir],
      ];
      for (const [label, dir] of dirs) {
        const { exists, writable } = dirStatus(dir);
        if (!exists) c.check(`${label} (${dir})`, false, 'no existe');
        else if (!writable) c.check(`${label} (${dir})`, false, 'sin permisos de escritura');
        else c.check(`${label} (${dir})`, true);
      }

      // ── GitHub API ──
      const { ok: ghOk, note: ghNote } = await githubRateLimitNote(app.cfg.githubToken);
      c.warn(`GitHub API — ${ghNote}`);
      if (ghOk && !app.cfg.githubToken) {
        c.warn('Sin GITHUB_TOKEN: añade `githubToken` a config.json si sufres rate limits');
      }
      if (!app.cfg.registryUrl) {
        c.warn('registryUrl vacío: los manifiestos remotos no se refrescan (brisa registry)');
      }

      // ── Estado ──
      const installed = app.installed();
      console.log(`\n  Ports instalados: ${installed.length}`);
      if (installed.length > 0) {
        const missingDir = installed.filter(
          (s) => !fs.existsSync(path.join(app.cfg.portsDir, s.id)),
        );
        if (missingDir.length > 0) {
          c.check(
            `Carpetas de ports instalados`,
            false,
            `${missingDir.length} sin carpeta (reinstala: brisa install)`,
          );
        } else {
          c.check(`Carpetas de ports instalados (${installed.length})`, true);
        }
      }

      // ── Resumen ──
      const print = (lines: string[], mark: string) =>
        lines.forEach((line) => console.log(`  ${mark} ${line}`));
      print(c.ok, '✓');
      print(c.warnings, '⚠');
      print(c.fails, '✗');
      console.log('');
      if (c.fails.length > 0) {
        console.error(`✗ ${c.fails.length} problema(s) crítico(s) detectado(s).`);
        process.exitCode = 1;
      } else {
        console.log(
          `✓ Entorno OK${c.warnings.length > 0 ? ` (${c.warnings.length} aviso(s))` : ''}`,
        );
      }
    });
}
