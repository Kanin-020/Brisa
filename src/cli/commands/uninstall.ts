import * as fs from 'node:fs';
import type { Command } from 'commander';
import type { App } from '../../core/app';
import { portDir } from '../../core/installer';

export function registerUninstallCommand(program: Command, app: App): void {
  program
    .command('uninstall <portId>')
    .description(
      'Desinstala un port (conserva los archivos marcados en `preserve` del manifiesto: saves y configs).',
    )
    .action((portId: string) => {
      app.uninstall(portId);
      const dir = portDir(app.config, portId);
      if (fs.existsSync(dir)) {
        console.info(
          `✓ ${portId} desinstalado. Se conservaron los archivos de preserve en: ${dir}`,
        );
        console.info('  Se restaurarán automáticamente si vuelves a instalar el port.');
      } else {
        console.info(`✓ ${portId} desinstalado.`);
      }
    });
}
