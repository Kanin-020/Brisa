/**
 * Constantes compartidas por varios módulos de Brisa.
 *
 * Mantener aquí los valores que se repiten en más de un módulo (permisos de
 * ejecución, puerto por defecto, caché de actualizaciones, API de GitHub…)
 * para que un cambio de valor se haga en un solo sitio (DRY).
 */

/** Permisos de ejecución (rwxr-xr-x) aplicados a binarios y scripts generados. */
export const EXECUTABLE_MODE = 0o755;

/** Puerto por defecto del servidor web local. */
export const DEFAULT_SERVER_PORT = 7380;

/** User-Agent usado en todas las peticiones HTTP salientes. */
export const USER_AGENT = "brisa";

/** Base URL de la API de GitHub. */
export const GITHUB_API_BASE = "https://api.github.com";

/**
 * Intervalo mínimo entre comprobaciones de actualización (30 min). La API de
 * GitHub sin token permite 60 peticiones/hora, así que cada port (y la propia
 * app) se consulta como mucho una vez cada 30 minutos salvo `force`.
 */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Máximo de tareas terminadas que conserva TaskManager en la lista de
 * /api/tasks (las más antiguas se descartan).
 */
export const MAX_FINISHED_TASKS = 20;
