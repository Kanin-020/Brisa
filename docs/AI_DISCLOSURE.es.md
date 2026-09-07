# Divulgación de IA

Esta divulgación se hace conforme a la [política de IA generativa de
Flathub](https://docs.flathub.org/docs/for-app-authors/requirements#generative-ai-policy).

**Todo el proyecto Brisa fue generado con asistencia de IA, bajo supervisión
humana continua.**

### Partes afectadas y extensión aproximada

- **~100 % del proyecto**, incluyendo:
  - Código fuente: `src/` (lógica principal, CLI, envoltorio de
    escritorio/Electron, interfaz web).
  - Herramientas y configuración de build: `scripts/`, `.github/`,
    `package.json`, `electron-builder.yml`, archivos tsconfig.
  - Documentación: README, documentación de arquitectura, changelog y notas
    de release de este repositorio.
  - Empaquetado y assets del CI, incluido el icono de la aplicación.
- **No cubierto** por esta divulgación: contenido de terceros referenciado por
  la aplicación (los proyectos de decompilación open source listados en los
  manifiestos de ports y sus releases) y los datos aportados por el usuario
  (ROMs, mods, saves). Ningún código de terceros se atribuye como generado por
  IA en este proyecto.

### Naturaleza de la supervisión

- Un asistente de IA propone código, texto y configuración; un autor humano
  revisa, valida y decide qué se incluye.
- Antes de cada release el proyecto es verificado por el autor humano con los
  chequeos propios del repositorio (`npm run typecheck`, `npm test`) y pruebas
  manuales.
- El desarrollo sigue prácticas estándar: versiones etiquetadas, commits
  convencionales, changelog mantenido y releases publicados.

Esta divulgación cubre el material incluido en la aplicación y en su
empaquetado para Flathub. Se actualizará si el proceso de desarrollo cambia.
