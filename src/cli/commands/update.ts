import type { Command } from "commander";
import type { App } from "../../core/app";

export function registerUpdateCommand(program: Command, app: App): void {
  program
    .command("update [portId]")
    .description("Comprueba actualizaciones de los ports instalados (o de uno en concreto) y las aplica.")
    .option("--check", "solo comprobar, no actualizar")
    .action(async (portId: string | undefined, opts: { check?: boolean }) => {
      const ids = portId ? [portId] : app.installed().map((state) => state.id);
      for (const id of ids) {
        const manifest = app.manifest(id);
        if (!manifest) {
          console.log(`${id}: port desconocido.`);
          continue;
        }
        const info = await app.checkUpdate(id, true);
        if (!info) {
          console.log(`${id}: no instalado.`);
          continue;
        }
        if (info.available) {
          console.log(`${id}: ${info.installed} -> ${info.latest} disponible.`);
          if (!opts.check) {
            await app.update(id);
            app.relinkMods(id);
            console.log(`  ✓ actualizado a ${info.latest}`);
          }
        } else {
          console.log(`${id}: actualizado (${info.installed}).`);
        }
      }
    });
}
