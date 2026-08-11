export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    if (now - this.lastDrawAt < 250 && done < total) return;
    this.lastDrawAt = now;
    const pct = Math.round((done / total) * 100);
    process.stderr.write(
      `\r  descargando... ${pct}% (${(done / (1024 * 1024)).toFixed(1)}/${(total / (1024 * 1024)).toFixed(1)} MB)`,
    );
    if (done >= total) process.stderr.write("\n");
  }
}
