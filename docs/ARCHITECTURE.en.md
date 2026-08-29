# Brisa Architecture

Brisa follows a **layered architecture** with the application facade at the
center: domain and infrastructure logic lives in `src/core/`, and adapters
(CLI, web server, desktop, web interface) consume a single high-level API.

```
+------------------------------------------------------------+
| ADAPTERS (inputs)                                           |
|  src/cli       terminal commands (commander)                |
|  src/server    local HTTP API (/api/*) + static files       |
|  src/desktop   Electron app (window + lifecycle)            |
|  src/web       browser interface (plain JS, no build)       |
+------------------------------------------------------------+
| APPLICATION (use case layer)                                |
|  src/core/app.ts   App facade: orchestrates services        |
+------------------------------------------------------------+
| DOMAIN AND INFRASTRUCTURE (pure logic)                      |
|  src/core/*  manifests, scanner, installer, mods, ROMs,     |
|              tasks, launchers, updates, cache...            |
+------------------------------------------------------------+
```

## Applied Principles

- **The facade contains no business logic**: `App` only orchestrates and
  delegates. Port status calculation lives in `src/core/status.ts`, manifest
  import/export in `src/core/manifest.ts`, and update cache in
  `src/core/cache.ts` (shared by ports and self-update).
- **DRY**: values repeated across modules live in `src/core/constants.ts`
  (execution permissions, default port, `User-Agent`, check interval, finished
  task limit). `config.json` loading/saving uses a declarative field mapping
  instead of repeated `if` chains.
- **Single responsibility**: each module in `src/core` handles one domain
  (installer, launchers, mods, ROMs, discs, GitHub...).
- **Small explicit interfaces**: services receive `AppConfig` and return flat
  types; there is no shared mutable global state between layers.
- **Explicit error handling**: the HTTP router centralizes `500`s
  (`ApiRouter.dispatch`), routes only return different codes when the contract
  requires it (400/404/409); cancellation uses `AbortSignal` +
  `CancelledError` from `src/core/tasks.ts`.
- **No magic values**: repeated numbers and strings are named constants (see
  `src/core/constants.ts` and the constant blocks in `src/cli/output.ts` and
  `src/web/components/game-mode/game-mode.tsx`).

## Code Conventions

- **Documentation**: every exported function has a JSDoc comment in Spanish
  explaining *what* it does and, when not obvious, *why* (business logic is
  documented in its module). Comments that repeat the code are avoided.
- **Composition over inheritance**: the app is built by composing services
  (facade + modules), not with class hierarchies.
- **Guard clauses**: handlers validate inputs at the start and return early
  (e.g. `requireId` in `src/server/http.ts`).
- **Explicit dependencies**: functions receive what they need (`AppConfig`,
  `Manifest`, ...) instead of reading global state.

## Typical Data Flow

1. The user triggers an action (CLI command, `POST /api/*`, or GUI button).
2. The adapter translates the request and calls a method on the `App` facade.
3. The facade orchestrates `src/core` services and returns flat types.
4. The adapter formats the response (terminal text or JSON).
5. The GUI queries `GET /api/status` and `/api/tasks` for live progress.

## Tests

The test suite (`npm test`) covers pure logic in `src/core` and extracted
helpers (config, cache, manifests, output formatting, version normalization),
so a presentation refactor cannot break behavior without detection.
