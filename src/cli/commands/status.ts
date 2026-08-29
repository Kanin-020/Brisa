import type { Command } from 'commander';
import type { App } from '../../core/app';
import { detectPlatform } from '../../core/platform';
import { formatBytes } from '../output';

export function registerStatusCommand(program: Command, app: App): void {
  program
    .command('status')
    .description('Escanea los ROMs, muestra ports disponibles/instalados, mods y actualizaciones.')
    .action(async () => {
      const { scan, ports } = await app.status();
      console.log(`\n== Brisa (${detectPlatform().key}) ==\n`);
      console.log(`ROMs encontrados (${scan.roms.length}):`);
      for (const rom of scan.roms)
        console.log(`  ${rom.name}  ${formatBytes(rom.size)}  [sha1 ${rom.sha1.slice(0, 8)}…]`);
      if (scan.roms.length === 0)
        console.log('  (vacío) — copia tus ROMs a:', app.cfg.romsDirs.join(', '));

      console.log('\nPorts:');
      for (const port of ports) {
        const roms = port.roms
          .map((slot) => {
            const mark = slot.matched ? '✓' : '✗';
            const opt = slot.required ? '' : ' (opcional)';
            return `${mark} ${slot.name}${opt}${slot.romName ? ` — ${slot.romName}` : ''}`;
          })
          .join('  ');
        const update =
          port.installed && port.updateAvailable
            ? `  ⬆ ${port.updateInfo?.installed} → ${port.updateInfo?.latest}`
            : '';
        const mods = port.mods.length > 0 ? `  mods: ${port.mods.join(', ')}` : '';
        console.log(
          `  [${port.installed ? '✓ instalado' : '—'}] ${port.manifest.name}${port.version ? ` v${port.version}` : ''}${update}`,
        );
        console.log(`      ROM: ${roms}${mods}`);
      }
      console.log('');
    });
}
