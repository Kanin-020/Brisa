import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import type { App } from "../../core/app";
import { portDir } from "../../core/installer";
import { computeLauncherNames, launcherExtension, launcherScriptForPlatform, writeImagenHelper } from "../../core/launchers";

export function registerSrmConfigCommand(program: Command, app: App): void {
  program
    .command("srm-config [outDir]")
    .description("Genera launchers por port instalado (.sh en Linux/macOS, .cmd en Windows; usan el CLI de Brisa: update + launch del port) para añadirlos a Steam como juegos no-Steam.")
    .option("-o, --out <dir>", "carpeta de salida (por defecto: <raíz de Brisa>/launchers, junto a roms/ y mods/)")
    .action((outDir: string | undefined, opts: { out?: string }) => {
      // Por defecto, junto al resto de datos de Brisa (roms/, mods/, ports/…):
      // la raíz de datos, no la carpeta desde donde se ejecuta el comando.
      const dir = path.resolve(outDir ?? opts.out ?? path.join(app.cfg.root, "launchers"));
      fs.mkdirSync(dir, { recursive: true });
      const states = app.installed();
      if (states.length === 0) {
        console.error("No hay ports instalados. Instala uno primero: brisa install <id>");
        process.exit(1);
      }
      const names = computeLauncherNames(app.cfg);
      const ext = launcherExtension();
      let generated = 0;
      for (const state of states) {
        const manifest = app.manifest(state.id);
        if (!manifest) continue;
        const root = portDir(app.cfg, state.id);
        if (!fs.existsSync(root)) {
          console.warn(`  ⚠ ${manifest.name}: carpeta del port no encontrada (${root}).`);
          continue;
        }
        const executable = state.executable;
        if (!fs.existsSync(path.join(root, executable))) {
          console.warn(`  ⚠ ${manifest.name}: ejecutable no encontrado (${executable}). Reinstala el port.`);
          continue;
        }
        const title = names.get(state.id) ?? state.id;
        const file = path.join(dir, `${title}${ext}`);
        fs.writeFileSync(file, launcherScriptForPlatform(app.cfg, state.id, state.version));
        if (ext !== ".cmd") fs.chmodSync(file, 0o755);
        generated++;
        const linked = Object.values(state.romsLinked ?? {}).find(Boolean) ?? state.romLinked;
        console.log(`  ✓ ${title}${ext}` + (linked ? "" : "  ⚠ sin ROM enlazado: el juego no arrancará hasta que enlaces su ROM"));
      }
      // Asegurar que el ayudante image/imagen exista (invoca el CLI de Brisa).
      writeImagenHelper(app.cfg);
      console.log(`\n✓ ${generated} launcher(s) generado(s) en: ${dir}\n`);
      console.log("Cómo usarlos:");
      console.log("  1) Steam → Agregar un juego → Agregar un juego no Steam… → Examinar → elige los " + ext);
      console.log("     (también sirven como ejecutable de un parser Glob en Steam ROM Manager).");
      console.log("  2) Cada launcher limpia las variables de Steam (LD_PRELOAD, STEAM_COMPAT_*, STEAM_RUNTIME)");
      console.log("     y delega en el CLI de Brisa (image/imagen o image/imagen.cmd): 'update <port>'");
      console.log("     comprueba/actualiza el port a la última versión y 'launch <port> --wait' lo");
      console.log("     lanza esperando a que cierre.");
      console.log("  3) Los launchers también se crean/actualizan solos al instalar o actualizar un");
      console.log("     port, y se borran al desinstalarlo. Regenera todos con: brisa srm-config");
    });
}
