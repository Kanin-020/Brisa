#!/usr/bin/env node
import { Command } from 'commander';
import { App } from './core/app';
import { appVersion } from './core/version';
import { registerStatusCommand } from './cli/commands/status';
import { registerDoctorCommand } from './cli/commands/doctor';
import { registerScanCommand } from './cli/commands/scan';
import { registerInstallCommand } from './cli/commands/install';
import { registerUninstallCommand } from './cli/commands/uninstall';
import { registerLaunchCommand } from './cli/commands/launch';
import { registerModsCommands } from './cli/commands/mods';
import { registerUpdateCommand } from './cli/commands/update';
import { registerSelfUpdateCommand } from './cli/commands/self-update';
import { registerRegistryCommand } from './cli/commands/registry';
import { registerConfigCommands } from './cli/commands/config';
import { registerHashCommand } from './cli/commands/hash';
import { registerManifestTestCommand } from './cli/commands/manifest-test';
import { registerServeCommand } from './cli/commands/serve';
import { registerSrmConfigCommand } from './cli/commands/srm-config';

const app = new App();
app.initialize();

const program = new Command();

program
  .name('brisa')
  .description(
    'Compilador y gestor de ports nativos de PC (SoH, 2Ship2Harkinian, DUSKLIGHT, TMC) basado en manifiestos.',
  )
  .version(appVersion());

registerStatusCommand(program, app);
registerDoctorCommand(program, app);
registerScanCommand(program, app);
registerInstallCommand(program, app);
registerUninstallCommand(program, app);
registerLaunchCommand(program, app);
registerModsCommands(program, app);
registerUpdateCommand(program, app);
registerSelfUpdateCommand(program, app);
registerRegistryCommand(program, app);
registerConfigCommands(program, app);
registerHashCommand(program);
registerManifestTestCommand(program);
registerServeCommand(program, app);
registerSrmConfigCommand(program, app);

program.parseAsync(process.argv);
