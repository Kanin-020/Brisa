/** Unidad de medida: 1024 bytes. */
const KIB = 1024;
/** Unidad de medida: 1024 * 1024 bytes. */
const MIB = KIB * KIB;

/** Intervalo mínimo entre redibujados de la barra de progreso (~4 fps). */
const PROGRESS_REPORT_INTERVAL_MS = 250;

/** Formatea un número de bytes como texto legible (B / KB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes < KIB) return `${bytes} B`;
  if (bytes < MIB) return `${(bytes / KIB).toFixed(1)} KB`;
  return `${(bytes / MIB).toFixed(1)} MB`;
}

/**
 * Barra de progreso de descargas en stderr, con throttling a ~4 fps para no
 * saturar el terminal. Implementa la firma onProgress de la API de instalación.
 */
export class ProgressReporter {
  private lastDrawAt = 0;

  report(stage: string, done: number, total: number): void {
    if (stage !== "download" || total <= 0) return;
    const now = Date.now();
    if (now - this.lastDrawAt < PROGRESS_REPORT_INTERVAL_MS && done < total) return;
    this.lastDrawAt = now;
    const pct = Math.round((done / total) * 100);
    process.stderr.write(
      `\r  descargando... ${pct}% (${(done / MIB).toFixed(1)}/${(total / MIB).toFixed(1)} MB)`,
    );
    if (done >= total) process.stderr.write("\n");
  }
}
