/* Brisa GUI — utilidades de presentación. */

/** Tamaño en bytes como texto legible (B / KB / MB). */
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* Nota: toast() y t() se definen en app.js / i18n.js, que se cargan después
 * de este archivo; estas funciones solo se invocan en runtime, cuando ya
 * existen. */

/** Copia el hash al portapapeles (con fallback para contextos sin Clipboard API). */
function copyHash(hash) {
  const done = () => toast(t("toast.copied"), "ok");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(hash).then(done).catch(() => legacyCopy(hash, done));
  } else {
    legacyCopy(hash, done);
  }
}

/** Fallback de copia usando execCommand (navegadores antiguos / http). */
function legacyCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta);
  done();
}
