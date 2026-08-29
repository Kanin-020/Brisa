import type { Command } from 'commander';
import type { App } from '../../core/app';
import { portDir, resolveExecutable } from '../../core/installer';
import { ProgressReporter } from '../output';

export function registerInstallCommand(program: Command, app: App): void {
  program
    .command('install <portId>')
    .description('Descarga e instala un port (requiere su ROM en el dir de ROMs, o usa --force).')
    .option('--force', 'instalar aunque no se encuentre el ROM')
    .action(async (portId: string, opts: { force?: boolean }) => {
      const manifest = app.manifest(portId);
      if (!manifest) {
        console.error(`Port no encontrado: ${portId}`);
        process.exit(1);
      }
      const romsByRequirement = await app.getRomsForPort(portId);
      const missingRequired = manifest.roms.filter(
        (requirement) => requirement.required !== false && !romsByRequirement[requirement.id],
      );
      if (missingRequired.length > 0 && !opts.force) {
        console.error(
          `No se encontraron todos los ROMs requeridos para ${manifest.name}. Ponlos en ${app.cfg.romsDirs.join(', ')} o usa --force.`,
        );
        console.error(
          `  Faltan: ${missingRequired.map((requirement) => requirement.name).join(', ')}`,
        );
        process.exit(1);
      }
      console.info(`Instalando ${manifest.name}...`);
      const progress = new ProgressReporter();
      const state = await app.install(portId, { roms: romsByRequirement }, (stage, done, total) =>
        progress.report(stage, done, total),
      );
      const relinked = app.relinkMods(portId);
      console.info(`✓ ${manifest.name} v${state.version} instalado en ${portDir(app.cfg, portId)}`);
      const linked = state.romsLinked ?? {};
      if (Object.keys(linked).length > 0) {
        for (const [requirementId, romPath] of Object.entries(linked)) {
          console.info(`  ROM enlazado (${requirementId}): ${romPath}`);
        }
      } else if (state.romLinked) {
        console.info(`  ROM enlazado: ${state.romLinked}`);
      }
      if (relinked.length) console.info(`  Mods enlazados: ${relinked.join(', ')}`);
      const executable = resolveExecutable(portDir(app.cfg, portId), {
        executable: state.executable,
      });
      if (executable) console.info(`  Ejecutable: ${executable}`);
    });
}
