/* Brisa GUI — capa de red: fetch del API, subida de ROMs y lanzamiento de ports. */

/** POST JSON al API y devuelve la respuesta parseada. */
async function api(path, body) {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** POST al API sin esperar respuesta (fire-and-forget). */
function apiFireAndForget(path, body) {
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** Lanza un port instalado por su id (el servidor arranca el juego en segundo plano). */
function launchPort(portId) {
  apiFireAndForget("/api/launch", { id: portId });
}

/**
 * Sube un ROM con barra de progreso (XHR permite leer upload.onprogress,
 * que fetch no expone). Resuelve con { saved, skipped, name }.
 */
function uploadRom(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/roms/upload");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
}
