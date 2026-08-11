import type { Command } from "commander";
import type { App } from "../../core/app";

export function registerScanCommand(program: Command, app: App): void {
  program
    .command("scan")
    .description("Escanea ROMs y muestra qué ports se pueden instalar.")
    .action(async () => {
      const { matches, missing } = await app.scan();
      console.log(`\nCoincidencias (${matches.length}):`);
      for (const match of matches) {
        const how =
          match.matchedBy === "hash"
            ? "por hash"
            : match.matchedBy === "gameid"
              ? "por game ID"
              : "por nombre";
        console.log(`  ${match.manifest.name} <- ${match.rom.name} (${how})`);
      }
      console.log(`\nPorts sin ROM (${missing.length}):`);
      for (const manifest of missing) console.log(`  ${manifest.name}`);
      console.log("");
    });
}
