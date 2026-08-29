import type { Command } from 'commander';
import type { App } from '../../core/app';

export function registerScanCommand(program: Command, app: App): void {
  program
    .command('scan')
    .description('Escanea ROMs y muestra qué ports se pueden instalar.')
    .action(async () => {
      const { matches, missing } = await app.scan();
      console.info(`\nCoincidencias (${matches.length}):`);
      for (const match of matches) {
        const matchMethod =
          match.matchedBy === 'hash'
            ? 'por hash'
            : match.matchedBy === 'gameid'
              ? 'por game ID'
              : 'por nombre';
        console.info(`  ${match.manifest.name} <- ${match.rom.name} (${matchMethod})`);
      }
      console.info(`\nPorts sin ROM (${missing.length}):`);
      for (const manifest of missing) console.info(`  ${manifest.name}`);
      console.info('');
    });
}
