import type { Command } from "commander";
import type { App } from "../../core/app";
import type { SelfUpdateInfo } from "../../core/selfupdate";
import { ProgressReporter } from "../output";

export function registerSelfUpdateCommand(program: Command, app: App): void {
  program
    .command("self-update")
    .description("Comprueba y aplica la actualización de la propia app Brisa (AppImage de Linux o instalador de Windows).")
    .option("--check", "solo comprobar, no actualizar")
    .action(async (opts: { check?: boolean }) => {
      let info: SelfUpdateInfo | null = null;
      try {
        info = await app.selfUpdateInfo(true);
      } catch (e) {
        console.error(`No se pudo consultar GitHub: ${(e as Error).message}`);
        process.exit(1);
      }
      if (!info) {
        console.error("No hay selfRepo configurado. Usa: brisa config-set selfRepo <owner/repo>");
        process.exit(1);
      }
      console.log(`Brisa v${info.current} (${info.supported ? "auto-update disponible" : "dev/CLI"})`);
      if (!info.available) {
        if (!info.latest || info.latest === "?") {
          console.log("No se pudo comprobar la última versión (revisa selfRepo o la conexión a GitHub).");
        } else {
          console.log(`✓ Ya estás en la última versión (${info.latest}).`);
        }
        return;
      }
      console.log(`⬆ Nueva versión disponible: ${info.latest}`);
      if (opts.check) return;
      if (!info.supported) {
        console.error("El auto-update solo funciona en builds empaquetadas (AppImage de Linux o instalador de Windows).");
        console.error("  Descárgala desde: https://github.com/" + app.cfg.selfRepo + "/releases/latest");
        process.exit(1);
      }
      console.log(`Descargando ${info.assetName}…`);
      const progress = new ProgressReporter();
      const applied = await app.selfUpdate((stage, done, total) => progress.report(stage, done, total));
      console.log(`✓ Brisa v${applied.latest} descargada. La app se cerrará y se relanzará sola.`);
    });
}
