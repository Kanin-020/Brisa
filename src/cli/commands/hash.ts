import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import { sha1File } from '../../core/hash';

export function registerHashCommand(program: Command): void {
  program
    .command('hash <file>')
    .description(
      'Calcula el SHA1 de un archivo (útil para rellenar el campo sha1 de un manifiesto).',
    )
    .action(async (file: string) => {
      const abs = path.resolve(file);
      if (!fs.existsSync(abs)) {
        console.error('Archivo no encontrado:', abs);
        process.exit(1);
      }
      console.info(await sha1File(abs));
    });
}
