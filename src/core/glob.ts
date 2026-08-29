// Minimal glob matcher for filenames (asset names / rom patterns).
// Supports *, ?, **, [class] and {a,b} alternation.

export function globToRegExp(pattern: string): RegExp {
  // Expand {a,b,c} into alternation groups first.
  const expanded = expandBraces(pattern);
  const body = expanded.map((p) => `(?:${compileOne(p)})`).join('|');
  return new RegExp(`^(?:${body})$`, 'i');
}

/**
 * Expand {a,b,c} into a list of plain patterns. Recursive: the first top-level
 * brace group is split into alternatives and each one is cross-multiplied with
 * the rest of the pattern (handles nested groups like {a,{b,c}}).
 */
function expandBraces(pattern: string): string[] {
  const i = pattern.indexOf('{');
  if (i === -1) return [pattern];
  let depth = 0;
  let j = -1;
  for (let k = i; k < pattern.length; k++) {
    const ch = pattern[k];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        j = k;
        break;
      }
    }
  }
  if (j === -1) return [pattern]; // llaves sin cerrar: tratar literalmente
  const prefix = pattern.slice(0, i);
  const suffix = pattern.slice(j + 1);
  const out: string[] = [];
  for (const alt of splitTopLevel(pattern.slice(i + 1, j))) {
    for (const rest of expandBraces(prefix + alt + suffix)) {
      if (!out.includes(rest)) out.push(rest);
    }
  }
  return out;
}

/** Divide una cadena en alternativas por "," que no estén dentro de llaves anidadas. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

function compileOne(pattern: string): string {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') i++;
        re += '.*';
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '[') {
      const close = pattern.indexOf(']', i);
      if (close === -1) {
        re += '\\[';
      } else {
        let cls = pattern.slice(i + 1, close);
        if (cls.startsWith('!')) cls = '^' + cls.slice(1);
        re += '[' + cls + ']';
        i = close;
      }
    } else if ('\\^$.|?+()[]{}'.includes(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
  }
  return re;
}

export function matchGlob(pattern: string, name: string): boolean {
  return globToRegExp(pattern).test(name);
}

export function anyMatch(patterns: string[], name: string): boolean {
  return patterns.some((p) => matchGlob(p, name));
}
