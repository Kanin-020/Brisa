import type { Command } from 'commander';
import type { App } from '../../core/app';
import { startServer } from '../../server/server';

export function registerServeCommand(program: Command, app: App): void {
  program
    .command('serve')
    .description('Arranca la interfaz web local (GUI) en http://localhost:<puerto>')
    .option('-p, --port <port>', 'puerto', String(app.cfg.serverPort))
    .action((opts: { port: string }) => {
      startServer(app, parseInt(opts.port, 10) || app.cfg.serverPort);
    });
}
