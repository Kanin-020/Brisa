import type { Command } from 'commander';
import { globToRegExp } from '../../core/glob';

export function registerManifestTestCommand(program: Command): void {
  program
    .command('manifest-test <pattern>')
    .description('Prueba un patrón glob contra un nombre (para depurar manifiestos).')
    .action((pattern: string) => {
      const regularExpression = globToRegExp(pattern);
      console.info('RegExp:', regularExpression.source);
    });
}
