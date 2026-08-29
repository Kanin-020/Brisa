import { randomUUID } from 'node:crypto';
import { MAX_FINISHED_TASKS } from './constants';

/** Error lanzado cuando una operación se cancela vía AbortController. */
export class CancelledError extends Error {
  constructor(message = 'Operación cancelada') {
    super(message);
    this.name = 'CancelledError';
  }
}

/** Lanza CancelledError si el signal ya está abortado. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError();
}

export type TaskStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface TaskInfo {
  id: string;
  /** Tipo de tarea: "install" | "update" | "update-all" | ... */
  type: string;
  /** Port al que pertenece la tarea (null para tareas globales). */
  portId: string | null;
  /** Etiqueta legible (nombre del port o acción). */
  label: string;
  /** Etapa actual ("release" | "download" | "extract" | ...). */
  stage: string;
  done: number;
  total: number;
  /** Progreso 0-100 (0 si total es desconocido). */
  pct: number;
  status: TaskStatus;
  error: string | null;
  /** Resultado JSON-serializable de la tarea (null mientras corre). */
  result: unknown;
  startedAt: number;
  finishedAt: number | null;
}

/** Contexto que recibe el runner de una tarea para reportar progreso y ser cancelable. */
export interface TaskContext {
  readonly id: string;
  readonly signal: AbortSignal;
  update(stage: string, done?: number, total?: number): void;
  setLabel(label: string): void;
}

interface TaskEntry extends TaskInfo {
  controller: AbortController;
}

/**
 * Gestiona tareas de larga duración (instalar/actualizar ports, update-all)
 * con progreso en vivo y cancelación (AbortController). El runner se ejecuta
 * en segundo plano y la tarea se consulta por GET /api/tasks.
 */
export class TaskManager {
  private tasks = new Map<string, TaskEntry>();

  /**
   * Arranca una tarea en segundo plano y devuelve su id e info inmediatamente.
   * `run` recibe el contexto (signal + update) y debe respetar la cancelación
   * llamando a throwIfAborted / pasando `signal` a las descargas.
   */
  start<T>(
    opts: { type: string; portId?: string | null; label: string },
    run: (ctx: TaskContext) => Promise<T>,
  ): { id: string; info: TaskInfo } {
    const controller = new AbortController();
    const id = randomUUID();
    const entry: TaskEntry = {
      id,
      type: opts.type,
      portId: opts.portId ?? null,
      label: opts.label,
      stage: 'start',
      done: 0,
      total: 0,
      pct: 0,
      status: 'running',
      error: null,
      result: null,
      startedAt: Date.now(),
      finishedAt: null,
      controller,
    };
    this.tasks.set(id, entry);

    const ctx: TaskContext = {
      id,
      signal: controller.signal,
      update: (stage, done, total) => {
        if (stage) entry.stage = stage;
        if (done !== undefined) entry.done = done;
        if (total !== undefined) entry.total = total;
        entry.pct =
          entry.total > 0 ? Math.min(100, Math.round((entry.done / entry.total) * 100)) : 0;
      },
      setLabel: (label) => {
        entry.label = label;
      },
    };

    Promise.resolve()
      .then(() => run(ctx))
      .then(
        (result) => {
          entry.status = 'done';
          entry.result = result;
          entry.pct = 100;
          entry.finishedAt = Date.now();
        },
        (err: unknown) => {
          const cancelled =
            err instanceof CancelledError || (err as { name?: string })?.name === 'AbortError';
          entry.status = cancelled ? 'cancelled' : 'error';
          entry.error = cancelled ? null : (err as Error).message;
          entry.finishedAt = Date.now();
        },
      )
      .then(() => this.prune());

    return { id, info: this.publicInfo(entry) };
  }

  /**
   * True si hay una tarea en marcha: sin argumentos, cualquiera; con
   * `portId`, una que afecte a ese port (evita instalar/actualizar el mismo
   * port dos veces a la vez).
   */
  hasRunning(portId?: string): boolean {
    for (const task of this.tasks.values()) {
      if (task.status !== 'running') continue;
      if (portId === undefined || task.portId === portId) return true;
    }
    return false;
  }

  /** Cancela una tarea en marcha. Devuelve false si no existe o ya terminó. */
  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'running') return false;
    task.controller.abort();
    return true;
  }

  get(id: string): TaskInfo | null {
    const task = this.tasks.get(id);
    return task ? this.publicInfo(task) : null;
  }

  /** Tareas activas y recién terminadas (más recientes primero). */
  list(): TaskInfo[] {
    return [...this.tasks.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((t) => this.publicInfo(t));
  }

  private publicInfo(entry: TaskEntry): TaskInfo {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { controller: _, ...info } = entry;
    return info;
  }

  private prune(): void {
    const finished = [...this.tasks.values()].filter((t) => t.status !== 'running');
    if (finished.length <= MAX_FINISHED_TASKS) return;
    const oldest = finished.slice(0, finished.length - MAX_FINISHED_TASKS);
    for (const task of oldest) this.tasks.delete(task.id);
  }
}
