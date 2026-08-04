// Minimal glob matcher for filenames (asset names / rom patterns).
// Supports *, ?, **, [class] and {a,b} alternation.

export function globToRegExp(pattern: string): RegExp {
  // Expand {a,b,c} into alternation groups first.
  const expanded = expandBraces(pattern);
  const body = expanded
    .map((p) => `(?:${compileOne(p)})`)
    .join("|");
  return new RegExp(`^(?:${body})$`, "i");
}

/** Expand {a,b,c} into a list of plain patterns. */
function expandBraces(pattern: string): string[] {
  const results: string[] = [];
  const stack: string[][] = [[""]];
  let buf = "";

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "{") {
      stack.push([""]);
      buf = "";
    } else if (ch === "}") {
      const branch = stack.pop()!;
      const prev = stack[stack.length - 1];
      const out: string[] = [];
      for (const p of prev) {
        for (const b of branch) {
          out.push(p + b + buf);
        }
      }
      stack[stack.length - 1] = out;
      buf = "";
    } else if (ch === "," && stack.length > 1) {
      stack[stack.length - 1].push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }

  if (stack.length > 1) {
    // Unbalanced braces: treat literally.
    return [pattern];
  }
  return stack[0].map((s) => s + buf);
}

function compileOne(pattern: string): string {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") i++;
        re += ".*";
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (ch === "[") {
      const close = pattern.indexOf("]", i);
      if (close === -1) {
        re += "\\[";
      } else {
        let cls = pattern.slice(i + 1, close);
        if (cls.startsWith("!")) cls = "^" + cls.slice(1);
        re += "[" + cls + "]";
        i = close;
      }
    } else if ("\\^$.|?+()[]{}".includes(ch)) {
      re += "\\" + ch;
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
