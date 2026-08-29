import type { Command } from 'commander';
import type { App } from '../../core/app';
import { launchPortProcess } from '../process';

export function registerLaunchCommand(program: Command, app: App): void {
  program
    .command('launch <portId>')
    .description(
      'Ejecuta un port instalado por id (p. ej. soh). --wait espera a que el juego termine (recomendado al lanzar desde Steam).',
    )
    .option('--wait', 'esperar a que el juego termine (recomendado al lanzar desde Steam)', false)
    .action(async (portId: string, opts: { wait?: boolean }) => {
      const executable = app.launch(portId);
      if (!executable) {
        console.error(`${portId} no está instalado o falta el ejecutable.`);
        const installed = app.installed().map((state) => state.id);
        if (installed.length > 0) console.error(`  Ports instalados: ${installed.join(', ')}`);
        process.exit(1);
      }
      console.info(`Lanzando ${executable}...`);
      await launchPortProcess(executable, !!opts.wait);
    });
}
