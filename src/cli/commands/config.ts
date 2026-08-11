import * as path from "node:path";
import type { Command } from "commander";
import type { App } from "../../core/app";
import { projectRoot, saveConfig } from "../../core/config";

export function registerConfigCommands(program: Command, app: App): void {
  program
    .command("config")
    .description("Muestra la configuración actual.")
    .action(() => {
      console.log(
        JSON.stringify(
          {
            root: app.cfg.root,
            romsDir: app.cfg.romsDir,
            modsDir: app.cfg.modsDir,
            portsDir: app.cfg.portsDir,
            manifestsDir: app.cfg.manifestsDir,
            registryUrl: app.cfg.registryUrl || "(sin configurar)",
            serverPort: app.cfg.serverPort,
            autoCheckUpdates: app.cfg.autoCheckUpdates,
            selfRepo: app.cfg.selfRepo,
            selfAssetPattern: app.cfg.selfAssetPattern || "(automático)",
          },
          null,
          2,
        ),
      );
    });

  program
    .command("config-set <key> <value>")
    .description("Establece un valor de configuración (romsDir, modsDir, registryUrl, serverPort, autoCheckUpdates).")
    .action((key: string, value: string) => {
      const cfg = app.cfg;
      if (key === "registryUrl") cfg.registryUrl = value;
      else if (key === "serverPort") cfg.serverPort = parseInt(value, 10) || 7380;
      else if (key === "autoCheckUpdates") cfg.autoCheckUpdates = value === "true";
      else if (key === "selfRepo") cfg.selfRepo = value;
      else if (key === "selfAssetPattern") cfg.selfAssetPattern = value;
      else if (key === "romsDir" || key === "modsDir" || key === "portsDir" || key === "manifestsDir") {
        (cfg as unknown as Record<string, string>)[key] = path.resolve(projectRoot(), value);
      } else {
        console.error(`Clave desconocida: ${key}`);
        process.exit(1);
      }
      saveConfig(cfg);
      console.log(`✓ ${key} = ${value}`);
    });
}
