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
            root: app.config.root,
            romsDirs: app.config.romsDirs,
            romsDir: app.config.romsDir,
            modsDir: app.config.modsDir,
            portsDir: app.config.portsDir,
            manifestsDir: app.config.manifestsDir,
            registryUrl: app.config.registryUrl || '(sin configurar)',
            serverPort: app.config.serverPort,
            autoCheckUpdates: app.config.autoCheckUpdates,
            selfRepo: app.config.selfRepo,
            selfAssetPattern: app.config.selfAssetPattern || '(automático)',
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
      const config = app.config;
      if (key === 'registryUrl') config.registryUrl = value;
      else if (key === 'serverPort') config.serverPort = parseInt(value, 10) || DEFAULT_SERVER_PORT;
      else if (key === 'autoCheckUpdates') config.autoCheckUpdates = value === 'true';
      else if (key === 'selfRepo') config.selfRepo = value;
      else if (key === 'selfAssetPattern') config.selfAssetPattern = value;
      else if (key === 'romsDirs') {
        // Acepta un array JSON (["dir1","dir2"]) o carpetas separadas por coma.
        let parsedDirs: string[];
        try {
          const parsed = JSON.parse(value) as unknown;
          parsedDirs = Array.isArray(parsed) ? parsed.map(String) : value.split(',');
        } catch {
          parsedDirs = value.split(',');
        }
        const cleaned = parsedDirs.map((directory) => directory.trim()).filter(Boolean);
        if (cleaned.length === 0) {
          console.error('romsDirs no puede estar vacío.');
          process.exit(1);
        }
        config.romsDirs = cleaned.map((d) => path.resolve(projectRoot(), d));
        config.romsDir = config.romsDirs[0];
      } else if (key === 'romsDir') {
        // Compatibilidad: un solo dir actualiza la lista completa.
        config.romsDirs = [path.resolve(projectRoot(), value)];
        config.romsDir = config.romsDirs[0];
      } else if (key === 'modsDir' || key === 'portsDir' || key === 'manifestsDir') {
        (config as unknown as Record<string, string>)[key] = path.resolve(projectRoot(), value);
      } else {
        console.error(`Clave desconocida: ${key}`);
        process.exit(1);
      }
      saveConfig(config);
      console.info(`✓ ${key} = ${key === 'romsDirs' ? config.romsDirs.join(', ') : value}`);
    });
}
