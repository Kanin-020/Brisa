import * as path from 'node:path';
import type { Command } from 'commander';
import type { App } from '../../core/app';
import { projectRoot, saveConfig } from '../../core/config';
import { DEFAULT_SERVER_PORT } from '../../core/constants';

export function registerConfigCommands(program: Command, app: App): void {
  program
    .command('config')
    .description('Muestra la configuración actual.')
    .action(() => {
      console.info(
        JSON.stringify(
          {
            root: app.cfg.root,
            romsDirs: app.cfg.romsDirs,
            romsDir: app.cfg.romsDir,
            modsDir: app.cfg.modsDir,
            portsDir: app.cfg.portsDir,
            manifestsDir: app.cfg.manifestsDir,
            registryUrl: app.cfg.registryUrl || '(sin configurar)',
            serverPort: app.cfg.serverPort,
            autoCheckUpdates: app.cfg.autoCheckUpdates,
            selfRepo: app.cfg.selfRepo,
            selfAssetPattern: app.cfg.selfAssetPattern || '(automático)',
          },
          null,
          2,
        ),
      );
    });

  program
    .command('config-set <key> <value>')
    .description(
      'Establece un valor de configuración (romsDirs, romsDir, modsDir, registryUrl, serverPort, autoCheckUpdates). romsDirs acepta varias carpetas separadas por coma o un array JSON.',
    )
    .action((key: string, value: string) => {
      const cfg = app.cfg;
      if (key === 'registryUrl') cfg.registryUrl = value;
      else if (key === 'serverPort') cfg.serverPort = parseInt(value, 10) || DEFAULT_SERVER_PORT;
      else if (key === 'autoCheckUpdates') cfg.autoCheckUpdates = value === 'true';
      else if (key === 'selfRepo') cfg.selfRepo = value;
      else if (key === 'selfAssetPattern') cfg.selfAssetPattern = value;
      else if (key === 'romsDirs') {
        // Acepta un array JSON (["dir1","dir2"]) o carpetas separadas por coma.
        let dirs: string[];
        try {
          const parsed = JSON.parse(value) as unknown;
          dirs = Array.isArray(parsed) ? parsed.map(String) : value.split(',');
        } catch {
          dirs = value.split(',');
        }
        const cleaned = dirs.map((d) => d.trim()).filter(Boolean);
        if (cleaned.length === 0) {
          console.error('romsDirs no puede estar vacío.');
          process.exit(1);
        }
        cfg.romsDirs = cleaned.map((d) => path.resolve(projectRoot(), d));
        cfg.romsDir = cfg.romsDirs[0];
      } else if (key === 'romsDir') {
        // Compatibilidad: un solo dir actualiza la lista completa.
        cfg.romsDirs = [path.resolve(projectRoot(), value)];
        cfg.romsDir = cfg.romsDirs[0];
      } else if (key === 'modsDir' || key === 'portsDir' || key === 'manifestsDir') {
        (cfg as unknown as Record<string, string>)[key] = path.resolve(projectRoot(), value);
      } else {
        console.error(`Clave desconocida: ${key}`);
        process.exit(1);
      }
      saveConfig(cfg);
      console.info(`✓ ${key} = ${key === 'romsDirs' ? cfg.romsDirs.join(', ') : value}`);
    });
}
