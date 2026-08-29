# Arquitectura de Brisa

Brisa sigue una **arquitectura por capas** (layered architecture) con la fachada
de aplicación en el centro: la lógica de dominio e infraestructura vive en
`src/core/`, y los adaptadores (CLI, servidor web, escritorio, interfaz web)
consumen una única API de alto nivel.

```
┌────────────────────────────────────────────────────────────┐
│ ADAPTADORES (entradas)                                      │
│  src/cli       comandos de terminal (commander)             │
│  src/server    API HTTP local (/api/*) + archivos estáticos │
│  src/desktop   app Electron (ventana + ciclo de vida)       │
│  src/web       interfaz de navegador (JS plano, sin build)  │
├────────────────────────────────────────────────────────────┤
│ APLICACIÓN (capa de casos de uso)                           │
│  src/core/app.ts   fachada App: orquesta los servicios      │
├────────────────────────────────────────────────────────────┤
│ DOMINIO E INFRAESTRUCTURA (lógica pura)                     │
│  src/core/*  manifiestos, escáner, instalador, mods, ROMs,  │
│              tareas, launchers, actualizaciones, caché…     │
└────────────────────────────────────────────────────────────┘
```

## Principios aplicados

- **La fachada no contiene lógica de negocio**: `App` solo orquesta y delega.
  El cálculo de estado de los ports vive en `src/core/status.ts`, la
  importación/exportación de manifiestos en `src/core/manifest.ts`, y la caché
  de actualizaciones en `src/core/cache.ts` (compartida por ports y self-update).
- **DRY**: valores que se repiten entre módulos viven en `src/core/constants.ts`
  (permisos de ejecución, puerto por defecto, `User-Agent`, intervalo de check,
  límite de tareas terminadas). La carga/guardado de `config.json` usa un mapeo
  declarativo de campos en lugar de cadenas de `if` repetidas.
- **Responsabilidad única**: cada módulo de `src/core` se ocupa de un dominio
  (instalador, launchers, mods, ROMs, discos, GitHub…).
- **Interfaces pequeñas y explícitas**: los servicios reciben `AppConfig` y
  devuelven tipos planos; no hay estado global mutable compartido entre capas.
- **Manejo de errores explícito**: el router HTTP centraliza los `500`
  (`ApiRouter.dispatch`), las rutas solo devuelven códigos distintos cuando el
  contrato lo exige (400/404/409); la cancelación usa `AbortSignal` +
  `CancelledError` de `src/core/tasks.ts`.
- **Sin valores mágicos**: los números y cadenas repetidos son constantes
  nombradas (ver `src/core/constants.ts` y los bloques de constantes de
  `src/cli/output.ts` y `src/web/app.js`).

## Convenciones de código

- **Documentación**: toda función exportada lleva un comentario JSDoc en
  español que explica *qué* hace y, cuando no es obvio, *por qué* (la lógica de
  negocio está documentada en su módulo). Se evitan comentarios que repiten el
  código.
- **Composición sobre herencia**: la app se construye componiendo servicios
  (facade + módulos), no con jerarquías de clases.
- **Guard clauses**: los handlers validan inputs al inicio y devuelven pronto
  (p. ej. `requireId` en `src/server/http.ts`).
- **Dependencias explícitas**: las funciones reciben lo que necesitan
  (`AppConfig`, `Manifest`, …) en vez de leer estado global.

## Flujo de datos típico

1. El usuario dispara una acción (comando CLI, `POST /api/*` o botón de la GUI).
2. El adaptador traduce la petición y llama a un método de la fachada `App`.
3. La fachada orquesta los servicios de `src/core` y devuelve tipos planos.
4. El adaptador formatea la respuesta (texto de terminal o JSON).
5. La GUI consulta `GET /api/status` y `/api/tasks` para progreso en vivo.

## Tests

Los tests de la suite (`npm test`) cubren la lógica pura de `src/core` y los
helpers extraídos (config, caché, manifiestos, formato de salida, normalización
de versiones), de modo que un refactor de presentación no pueda romper el
comportamiento sin que se detecte.
