#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { App } from "./core/app";
import { projectRoot, saveConfig } from "./core/config";
import { sha1File } from "./core/hash";
import { resolveExecutable, portDir } from "./core/installer";
import type { RomFile } from "./core/scanner";
import { globToRegExp } from "./core/glob";
import { detectPlatform } from "./core/platform";
import { unlinkAllMods, isModLinked } from "./core/mods";
import { startServer } from "./server/server";

const app = new App();

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

let lastProgress = 0;
async function progress(stage: string, done: number, total: number) {
  if (stage !== "download" || total <= 0) return;
  const now = Date.now();
  if (now - lastProgress < 250 && done < total) return; // throttle to 4 fps
  lastProgress = now;
  const pct = Math.round((done / total) * 100);
  process.stderr.write(`\r  descargando... ${pct}% (${(done / (1024 * 1024)).toFixed(1)}/${(total / (1024 * 1024)).toFixed(1)} MB)`);
  if (done >= total) process.stderr.write("\n");
}

const program = new Command();

program
  .name("port-hub")
  .description("Compilador y gestor de ports nativos de PC (SoH, 2Ship2Harkinian, DUSKLIGHT, TMC) basado en manifiestos.")
  .version("0.1.0");

program
  .command("status")
  .description("Escanea los ROMs, muestra ports disponibles/instalados, mods y actualizaciones.")
  .action(async () => {
    const { scan, ports } = await app.status();
    console.log(`\n== Port Hub (${detectPlatform().key}) ==\n`);
    console.log(`ROMs encontrados (${scan.roms.length}):`);
    for (const r of scan.roms) console.log(`  ${r.name}  ${bytes(r.size)}  [sha1 ${r.sha1.slice(0, 8)}…]`);
    if (scan.roms.length === 0) console.log("  (vacío) — copia tus ROMs a:", app.cfg.romsDir);

    console.log("\nPorts:");
    for (const p of ports) {
      const roms = p.roms
        .map((s) => {
          const mark = s.matched ? "✓" : "✗";
          const opt = s.required ? "" : " (opcional)";
          return `${mark} ${s.name}${opt}${s.romName ? ` — ${s.romName}` : ""}`;
        })
        .join("  ");
      const upd = p.installed && p.updateAvailable ? `  ⬆ ${p.updateInfo?.installed} → ${p.updateInfo?.latest}` : "";
      const mods = p.mods.length > 0 ? `  mods: ${p.mods.join(", ")}` : "";
      console.log(`  [${p.installed ? "✓ instalado" : "—"}] ${p.manifest.name}${p.version ? ` v${p.version}` : ""}${upd}`);
      console.log(`      ROM: ${roms}${mods}`);
    }
    console.log("");
  });

program
  .command("scan")
  .description("Escanea ROMs y muestra qué ports se pueden instalar.")
  .action(async () => {
    const { matches, missing } = await app.scan();
    console.log(`\nCoincidencias (${matches.length}):`);
    for (const m of matches) {
      const how =
        m.matchedBy === "hash" ? "por hash" : m.matchedBy === "gameid" ? "por game ID" : "por nombre";
      console.log(`  ${m.manifest.name} <- ${m.rom.name} (${how})`);
    }
    console.log(`\nPorts sin ROM (${missing.length}):`);
    for (const m of missing) console.log(`  ${m.name}`);
    console.log("");
  });

program
  .command("install <portId>")
  .description("Descarga e instala un port (requiere su ROM en el dir de ROMs, o usa --force).")
  .option("--force", "instalar aunque no se encuentre el ROM")
  .action(async (portId: string, opts: { force?: boolean }) => {
    const m = app.manifest(portId);
    if (!m) {
      console.error(`Port no encontrado: ${portId}`);
      process.exit(1);
    }
    const { matches } = await app.scan();
    const roms: Record<string, RomFile> = {};
    for (const mm of matches) {
      if (mm.manifest.id === portId) roms[mm.requirement.id] = mm.rom;
    }
    const missingRequired = m.roms.filter((r) => r.required !== false && !roms[r.id]);
    if (missingRequired.length > 0 && !opts.force) {
      console.error(`No se encontraron todos los ROMs requeridos para ${m.name}. Ponlos en ${app.cfg.romsDir} o usa --force.`);
      console.error(`  Faltan: ${missingRequired.map((r) => r.name).join(", ")}`);
      process.exit(1);
    }
    console.log(`Instalando ${m.name}...`);
    const state = await app.install(portId, { roms }, progress);
    const relinked = app.relinkMods(portId);
    console.log(`✓ ${m.name} v${state.version} instalado en ${portDir(app.cfg, portId)}`);
    const linked = state.romsLinked ?? {};
    if (Object.keys(linked).length > 0) {
      for (const [reqId, romPath] of Object.entries(linked)) {
        console.log(`  ROM enlazado (${reqId}): ${romPath}`);
      }
    } else if (state.romLinked) {
      console.log(`  ROM enlazado: ${state.romLinked}`);
    }
    if (relinked.length) console.log(`  Mods enlazados: ${relinked.join(", ")}`);
    const exe = resolveExecutable(portDir(app.cfg, portId), { executable: state.executable });
    if (exe) console.log(`  Ejecutable: ${exe}`);
  });

program
  .command("uninstall <portId>")
  .description("Desinstala un port.")
  .action((portId: string) => {
    app.uninstall(portId);
    console.log(`✓ ${portId} desinstalado.`);
  });

program
  .command("launch <portId>")
  .description("Ejecuta el port instalado.")
  .action((portId: string) => {
    const exe = app.launch(portId);
    if (!exe) {
      console.error(`${portId} no está instalado o falta el ejecutable.`);
      process.exit(1);
    }
    console.log(`Lanzando ${exe}...`);
    const child = spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: "ignore" });
    child.on("error", (err) => {
      console.error(`No se pudo lanzar ${exe}: ${err.message}`);
    });
    child.unref();
  });

program
  .command("mods <portId>")
  .description("Muestra los mods centralizados de un port y su estado de enlace.")
  .action((portId: string) => {
    const info = app.modsFor(portId);
    console.log(`\nMods de ${info.manifest.name} -> MODS/${info.manifest.mods.gameDir}/`);
    console.log(`Raíz: ${info.root}`);
    if (info.mods.length === 0) {
      console.log("  (sin mods) — crea carpetas dentro de:", info.root);
    }
    for (const mod of info.mods) {
      const linked = isModLinked(app.cfg, info.manifest, mod);
      console.log(`  ${mod}  ${linked ? "[enlazado]" : "[no enlazado]"}`);
    }
    console.log("");
  });

program
  .command("mods-link <portId>")
  .description("Enlaza todos los mods centralizados del port dentro de su carpeta de mods.")
  .action((portId: string) => {
    const linked = app.relinkMods(portId);
    console.log(`Enlazados: ${linked.length ? linked.join(", ") : "(ninguno nuevo)"}`);
  });

program
  .command("mods-unlink <portId> [modName]")
  .description("Desenlaza un mod (o todos) del port.")
  .action((portId: string, modName?: string) => {
    const m = app.manifest(portId);
    if (!m) {
      console.error(`Port no encontrado: ${portId}`);
      process.exit(1);
    }
    if (modName) {
      app.unlinkMod(portId, modName);
      console.log(`Desenlazado: ${modName}`);
    } else {
      unlinkAllMods(app.cfg, m);
      console.log("Todos los mods desenlazados.");
    }
  });

program
  .command("update [portId]")
  .description("Comprueba actualizaciones de los ports instalados (o de uno en concreto) y las aplica.")
  .option("--check", "solo comprobar, no actualizar")
  .action(async (portId: string | undefined, opts: { check?: boolean }) => {
    const ids = portId ? [portId] : app.installed().map((s) => s.id);
    for (const id of ids) {
      const m = app.manifest(id);
      if (!m) {
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

program
  .command("registry")
  .description("Actualiza los manifiestos remotos desde registryUrl (config.json).")
  .action(async () => {
    if (!app.cfg.registryUrl) {
      console.error("No hay registryUrl configurada. Edita config.json o usa: port-hub config-set registryUrl <url>");
      process.exit(1);
    }
    const n = await app.refreshRegistry();
    console.log(`✓ ${n} manifiestos remotos actualizados.`);
  });

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
    else if (key === "romsDir" || key === "modsDir" || key === "portsDir" || key === "manifestsDir") {
      (cfg as unknown as Record<string, string>)[key] = path.resolve(projectRoot(), value);
    } else {
      console.error(`Clave desconocida: ${key}`);
      process.exit(1);
    }
    saveConfig(cfg);
    console.log(`✓ ${key} = ${value}`);
  });

program
  .command("hash <file>")
  .description("Calcula el SHA1 de un archivo (útil para rellenar el campo sha1 de un manifiesto).")
  .action(async (file: string) => {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) {
      console.error("Archivo no encontrado:", abs);
      process.exit(1);
    }
    console.log(await sha1File(abs));
  });

program
  .command("manifest-test <pattern>")
  .description("Prueba un patrón glob contra un nombre (para depurar manifiestos).")
  .action((pattern: string) => {
    const re = globToRegExp(pattern);
    console.log("RegExp:", re.source);
  });

program
  .command("serve")
  .description("Arranca la interfaz web local (GUI) en http://localhost:<puerto>")
  .option("-p, --port <port>", "puerto", String(app.cfg.serverPort))
  .action((opts: { port: string }) => {
    startServer(app, parseInt(opts.port, 10) || app.cfg.serverPort);
  });

program.parseAsync(process.argv);
