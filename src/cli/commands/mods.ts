import type { Command } from 'commander';
import type { App } from '../../core/app';
import { isModLinked } from '../../core/mods';

export function registerModsCommands(program: Command, app: App): void {
  program
    .command('mods <portId>')
    .description('Muestra los mods centralizados de un port y su estado de enlace.')
    .action((portId: string) => {
      const info = app.modsFor(portId);
      console.info(`\nMods de ${info.manifest.name} -> MODS/${info.manifest.mods.gameDir}/`);
      console.info(`Raíz: ${info.root}`);
      if (info.mods.length === 0) {
        console.info('  (sin mods) — crea carpetas dentro de:', info.root);
      }
      for (const mod of info.mods) {
        const linked = isModLinked(app.config, info.manifest, mod);
        console.info(`  ${mod}  ${linked ? '[enlazado]' : '[no enlazado]'}`);
      }
      console.info('');
    });

  program
    .command('mods-link <portId>')
    .description('Enlaza todos los mods centralizados del port dentro de su carpeta de mods.')
    .action((portId: string) => {
      const linked = app.relinkMods(portId);
      console.info(`Enlazados: ${linked.length ? linked.join(', ') : '(ninguno nuevo)'}`);
    });

  program
    .command('mods-unlink <portId> [modName]')
    .description('Desenlaza un mod (o todos) del port.')
    .action((portId: string, modName?: string) => {
      const manifest = app.manifest(portId);
      if (!manifest) {
        console.error(`Port no encontrado: ${portId}`);
        process.exit(1);
      }
      if (modName) {
        app.unlinkMod(portId, modName);
        console.info(`Desenlazado: ${modName}`);
      } else {
        app.unlinkAllMods(portId);
        console.info('Todos los mods desenlazados.');
      }
    });
}
