import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import type { App } from '../../core/app';
import { portDir } from '../../core/installer';
import {
  computeLauncherNames,
  launcherExtension,
  launcherScriptForPlatform,
  writeImagenHelper,
} from '../../core/launchers';

export function registerSrmConfigCommand(program: Command, app: App): void {
  program
    .command('srm-config [outDir]')
    .description(
      'Genera launchers por port instalado (.sh en Linux/macOS, .cmd en Windows; usan el CLI de Brisa: update + launch del port) para añadirlos a Steam como juegos no-Steam.',
    )
    .option(
      '-o, --out <dir>',
      'carpeta de salida (por defecto: <raíz de Brisa>/launchers, junto a roms/ y mods/)',
    )
    .action((outDir: string | undefined, opts: { out?: string }) => {
      // Por defecto, junto al resto de datos de Brisa (roms/, mods/, ports/…):
      // la raíz de datos, no la carpeta desde donde se ejecuta el comando.
      const outputDirectory = path.resolve(outDir ?? opts.out ?? path.join(app.config.root, 'launchers'));
      fs.mkdirSync(outputDirectory, { recursive: true });
      const states = app.installed();
      if (states.length === 0) {
        console.error('No hay ports instalados. Instala uno primero: brisa install <id>');
        process.exit(1);
      }
      const launcherNames = computeLauncherNames(app.config);
      const extension = launcherExtension();
      let generated = 0;
      for (const state of states) {
        const manifest = app.manifest(state.id);
        if (!manifest) continue;
        const portInstallationDir = portDir(app.config, state.id);
        if (!fs.existsSync(portInstallationDir)) {
          console.warn(`  ⚠ ${manifest.name}: carpeta del port no encontrada (${portInstallationDir}).`);
          continue;
        }
        const executable = state.executable;
        if (!fs.existsSync(path.join(portInstallationDir, executable))) {
          console.warn(
            `  ⚠ ${manifest.name}: ejecutable no encontrado (${executable}). Reinstala el port.`,
          );
          continue;
        }
        const title = launcherNames.get(state.id) ?? state.id;
        const launcherFile = path.join(outputDirectory, `${title}${extension}`);
        fs.writeFileSync(launcherFile, launcherScriptForPlatform(app.config, state.id, state.version));
        if (extension !== '.cmd') fs.chmodSync(launcherFile, 0o755);
        generated++;
        const linked = Object.values(state.romsLinked ?? {}).find(Boolean) ?? state.romLinked;
        console.info(
          `  ✓ ${title}${extension}` +
            (linked ? '' : '  ⚠ sin ROM enlazado: el juego no arrancará hasta que enlaces su ROM'),
        );
      }
      // Asegurar que el ayudante image/imagen exista (invoca el CLI de Brisa).
      writeImagenHelper(app.config);
      console.info(`\n✓ ${generated} launcher(s) generado(s) en: ${outputDirectory}\n`);
      console.info('Cómo usarlos:');
      console.info(
        '  1) Steam → Agregar un juego → Agregar un juego no Steam… → Examinar → elige los ' + extension,
      );
      console.info('     (también sirven como ejecutable de un parser Glob en Steam ROM Manager).');
      console.info(
        '  2) Cada launcher limpia las variables de Steam (LD_PRELOAD, STEAM_COMPAT_*, STEAM_RUNTIME)',
      );
      console.info(
        "     y delega en el CLI de Brisa (image/imagen o image/imagen.cmd): 'update <port>'",
      );
      console.info(
        "     comprueba/actualiza el port a la última versión y 'launch <port> --wait' lo",
      );
      console.info('     lanza esperando a que cierre.');
      console.info(
        '  3) Los launchers también se crean/actualizan solos al instalar o actualizar un',
      );
      console.info('     port, y se borran al desinstalarlo. Regenera todos con: brisa srm-config');
    });
}
