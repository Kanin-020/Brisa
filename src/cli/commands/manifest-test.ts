import type { Command } from 'commander';
import { globToRegExp } from '../../core/glob';

export function registerManifestTestCommand(program: Command): void {
  program
    .command('manifest-test <pattern>')
    .description('Prueba un patrón glob contra un nombre (para depurar manifiestos).')
    .action((pattern: string) => {
      const re = globToRegExp(pattern);
      console.info('RegExp:', re.source);
    });
}
