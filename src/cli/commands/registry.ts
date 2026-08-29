import type { Command } from 'commander';
import type { App } from '../../core/app';

export function registerRegistryCommand(program: Command, app: App): void {
  program
    .command('registry')
    .description('Actualiza los manifiestos remotos desde registryUrl (config.json).')
    .action(async () => {
      if (!app.cfg.registryUrl) {
        console.error(
          'No hay registryUrl configurada. Edita config.json o usa: brisa config-set registryUrl <url>',
        );
        process.exit(1);
      }
      const count = await app.refreshRegistry();
      console.info(`✓ ${count} manifiestos remotos actualizados.`);
    });
}
