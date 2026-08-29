/* Brisa GUI — interfaz: estado, renderizado y eventos.
 * La capa de red vive en api.js y las utilidades en utils.js.
 * (api, uploadRom, launchPort, fmtSize, copyHash están definidas ahí.) */

/** Claves de localStorage (persistencia de preferencias de la GUI). */
const LS_PORTS_VIEW = "brisa-ports-view";
const LS_ROMS_VIEW = "brisa-roms-view";
const LS_ACTIVE_TAB = "brisa-active-tab";
const LS_THEME = "brisa-theme";
const LS_HELP_SEEN = "brisa-help-seen";

/** Intervalo de polling de /api/tasks (ms). */
const POLL_INTERVAL_MS = 700;
/** Recarga automática de estado cuando no hay tareas en marcha (ms). */
const AUTO_REFRESH_MS = 8000;
/** Duración por defecto de los toasts (ms). */
const TOAST_DURATION_MS = 3200;

let state = null;
let busyPortIds = new Set();

/** Tareas en segundo plano lanzadas desde la GUI: taskId -> { type, portId, info, onDone }. */
let activeTasks = new Map();
let pollTimer = null;
let polling = false;

/** Máximo de chips de mod inline por tarjeta antes de mostrar "Open all". */
const MAX_MODS_INLINE = 3;

let allPorts = [];
let installedQuery = "";
let availableQuery = "";
let viewMode = "cards";
let romsViewMode = "cards";
let activeTab = "installed";
let modsModalPort = null;
let selfToastShown = false;
/** True en el primer arranque (guía de ayuda destacada + auto-apertura). */
let firstRun = false;

/** Lee una preferencia de localStorage con fallback seguro. */
function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Escribe una preferencia en localStorage sin romper si no está disponible. */
function writePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage may be unavailable */
  }
}

viewMode = readPreference(LS_PORTS_VIEW) === "list" ? "list" : "cards";
romsViewMode = readPreference(LS_ROMS_VIEW) === "list" ? "list" : "cards";
const savedTab = readPreference(LS_ACTIVE_TAB);
if (savedTab === "installed" || savedTab === "available" || savedTab === "roms" || savedTab === "help") activeTab = savedTab;

/** Atajo a document.querySelector. */
const $ = (sel) => document.querySelector(sel);
/** Atajo a document.querySelectorAll. */
const $$ = (sel) => document.querySelectorAll(sel);
/** Crea un elemento DOM con clase y texto opcionales. */
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// ── i18n ──

const { t, tRaw, setLocale, locale, onLocaleChange, localeLabel, availableLocales, ready: i18nReady } = window.__i18n;

/** True si el botón de vista pertenece al toggle de ROMs. */
function viewBtnIsRoms(btn) {
  return btn.closest(".view-toggle")?.id === "roms-view-toggle";
}

/** Sincroniza la clase .active de ambos toggles con el modo actual. */
function syncViewActive() {
  $$(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === (viewBtnIsRoms(btn) ? romsViewMode : viewMode));
  });
}

/** Re-translate all static UI elements on locale change. */
function updateStaticText() {
  document.title = t("brand.title");
  $("#brand-title").textContent = t("brand.title");
  $("#brand-tagline").textContent = t("brand.tagline");
  $("#btn-refresh").textContent = t("btn.refresh");
  $("#btn-refresh").title = t("btn.refresh");
  syncSettingsUI();
  // El popup de ajustes se re-traduce si está abierto (idioma, tema…)
  if ($("#settings-modal").classList.contains("show")) renderSettingsBody();
  const updateAllBtn = $("#btn-update-all");
  if (updateAllBtn) updateAllBtn.textContent = t("btn.updateAll");
  const globalCancelBtn = $("#global-task-cancel");
  if (globalCancelBtn) globalCancelBtn.textContent = t("task.cancel");

  $("#stat-label-roms").textContent = t("stat.roms");
  $("#stat-label-installed").textContent = t("stat.installed");
  $("#stat-label-mods").textContent = t("stat.mods");
  $("#stat-label-updates").textContent = t("stat.updates");

  $("#tab-label-installed").textContent = t("tabs.installed");
  $("#tab-label-available").textContent = t("tabs.available");
  $("#tab-label-roms").textContent = t("tabs.roms");
  $("#tab-label-help").textContent = t("tabs.help");
  renderHelp();
  $("#ports-search-installed").placeholder = t("ports.searchPlaceholder");
  $("#ports-search-available").placeholder = t("ports.searchPlaceholder");
  $$(".view-btn").forEach((btn) => {
    const isRoms = viewBtnIsRoms(btn);
    btn.title =
      btn.dataset.view === "list"
        ? t(isRoms ? "roms.viewList" : "ports.viewList")
        : t(isRoms ? "roms.viewCards" : "ports.viewCards");
  });
  syncViewActive();
  $("#mods-modal-close").title = t("mod.close");

  $("#btn-export-manifests").textContent = t("btn.exportManifests");
  $("#btn-export-manifests").title = t("btn.exportManifests");
  $("#btn-import-manifests").textContent = t("btn.importManifests");
  $("#btn-import-manifests").title = t("btn.importManifests");
  $("#btn-add-roms").textContent = t("btn.addRoms");
  $("#btn-add-roms").title = t("btn.addRoms");
  $("#btn-open-folder").textContent = t("btn.openAppFolder");
  $("#btn-open-folder").title = t("btn.openAppFolder");
  $("#drop-title").textContent = t("roms.dropTitle");
  $("#drop-hint").textContent = t("roms.dropHint");

  $("#footer-text").textContent = t("footer.madeWith");
  $("#footer-legal").textContent = t("footer.legal");

  // Update html lang attribute for accessibility
  document.documentElement.lang = locale();

  // Re-render dynamic content if state is available
  if (state) render();
}

// ── Tareas en segundo plano (progreso real + cancelación) ──

/** Devuelve la tarea activa de un port (si la hay). */
function taskForPort(portId) {
  for (const entry of activeTasks.values()) {
    if (entry.portId === portId) return entry.info;
  }
  return null;
}

/** Traduce la etapa interna de una tarea ("download", "extract", …). */
function taskStageLabel(stage) {
  const key = `stage.${stage}`;
  const label = t(key);
  return label === key ? stage : label;
}

/** Registra una tarea recién creada y arranca el polling de /api/tasks. */
function trackTask(task, portId, onDone) {
  activeTasks.set(task.id, { type: task.type, portId, info: task, onDone });
  schedulePoll();
}

function schedulePoll() {
  if (pollTimer) return;
  pollTimer = setInterval(pollTasks, POLL_INTERVAL_MS);
}

function stopPoll() {
  if (activeTasks.size === 0 && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Consulta /api/tasks, actualiza las barras y detecta tareas terminadas. */
async function pollTasks() {
  if (polling || activeTasks.size === 0) return;
  polling = true;
  try {
    const list = await api("/api/tasks");
    const byId = new Map(list.map((task) => [task.id, task]));
    const finished = [];
    for (const [taskId, entry] of activeTasks) {
      const info = byId.get(taskId);
      if (!info) {
        // La tarea desapareció del servidor (p. ej. reinicio): liberar el port.
        activeTasks.delete(taskId);
        busyPortIds.delete(entry.portId);
        continue;
      }
      entry.info = info;
      if (info.status !== "running") finished.push([taskId, entry, info]);
    }
    updateTaskUI();
    for (const [taskId, entry, info] of finished) {
      activeTasks.delete(taskId);
      busyPortIds.delete(entry.portId);
      handleTaskDone(entry, info);
    }
    stopPoll();
  } catch {
    // Red no disponible: reintentar en el siguiente tick.
  } finally {
    polling = false;
  }
}

/** Actualiza solo las barras de progreso (sin re-render completo). */
function updateTaskUI() {
  for (const [taskId, entry] of activeTasks) {
    const bar = document.querySelector(`.bar[data-task="${taskId}"]`);
    if (!bar) continue;
    const info = entry.info;
    if (info.pct > 0) {
      bar.style.width = `${info.pct}%`;
      bar.classList.remove("indeterminate");
    }
    const wrap = bar.closest(".progress-wrap");
    const stage = wrap && wrap.querySelector(".progress-stage");
    if (stage) stage.textContent = `${info.label}: ${taskStageLabel(info.stage)}`;
    const cancel = wrap && wrap.querySelector(".cancel-btn");
    if (cancel) cancel.hidden = info.status !== "running";
  }
  updateGlobalTaskUI();
}

/** Barra global para tareas sin port (update-all): progreso + cancelar. */
function updateGlobalTaskUI() {
  const wrap = $("#global-task");
  if (!wrap) return;
  let task = null;
  for (const entry of activeTasks.values()) {
    if (entry.portId === null && entry.info.status === "running") {
      task = entry.info;
      break;
    }
  }
  if (!task) {
    wrap.hidden = true;
    wrap.removeAttribute("data-task");
    return;
  }
  wrap.hidden = false;
  wrap.dataset.task = task.id;
  const bar = $("#global-task-bar");
  if (task.pct > 0) {
    bar.style.width = `${task.pct}%`;
    bar.classList.remove("indeterminate");
  } else {
    bar.classList.add("indeterminate");
  }
  $("#global-task-stage").textContent = `${task.label}: ${taskStageLabel(task.stage)}`;
}

/** Muestra el resultado de una tarea terminada (toast + notificación + recarga). */
function handleTaskDone(entry, info) {
  const port = entry.portId ? allPorts.find((p) => p.manifest.id === entry.portId) : undefined;
  const name = port ? port.manifest.name : info.label;
  const result = info.result || {};
  if (info.status === "done") {
    if (entry.type === "install") {
      toast(t("toast.installed", name, result.version ?? ""), "ok");
      notifySystem(t("brand.title"), t("notify.installDone", name, result.version ?? ""));
    } else if (entry.type === "update") {
      toast(t("toast.updated", name, result.latest ?? ""), "ok");
      notifySystem(t("brand.title"), t("notify.updateDone", name, result.latest ?? ""));
    } else if (entry.type === "update-all") {
      toast(t("toast.updatedAll", result.updated ?? 0), "ok");
      notifySystem(t("brand.title"), t("notify.updatedAll", result.updated ?? 0));
    }
    if (typeof entry.onDone === "function") entry.onDone();
  } else if (info.status === "cancelled") {
    toast(t("toast.cancelled", name), "warn");
  } else {
    toast(`${name}: ${info.error || t("toast.error")}`, "error", 6000);
    notifySystem(t("brand.title"), `${t("notify.error", name)}: ${info.error || ""}`);
  }
  load();
}

/** Arranca una tarea de port (install/update) y marca la tarjeta como ocupada. */
function startPortTask(p, endpoint, type, onDone) {
  busyPortIds.add(p.manifest.id);
  render(); // feedback inmediato: barra indeterminada + botones deshabilitados
  api(endpoint, { id: p.manifest.id })
    .then((data) => {
      if (!data.task) throw new Error(t("toast.error"));
      trackTask(data.task, p.manifest.id, onDone);
      render();
    })
    .catch((e) => {
      busyPortIds.delete(p.manifest.id);
      render();
      toast(e.message, "error");
    });
}

/** Cancela una tarea en marcha (POST /api/tasks/cancel). */
function cancelTask(taskId) {
  api("/api/tasks/cancel", { id: taskId }).catch((e) => toast(e.message, "error"));
}

/** True mientras haya una tarea update-all en marcha. */
function updateAllRunning() {
  for (const entry of activeTasks.values()) {
    if (entry.type === "update-all" && entry.info.status === "running") return true;
  }
  return false;
}

// ── Toast ──

/** Muestra un toast efímero (mensaje + tipo + duración + acción al hacer clic). */
function toast(msg, kind = "ok", duration = TOAST_DURATION_MS, onClick = null) {
  const node = $("#toast");
  node.textContent = msg;
  node.className = `toast show ${kind}`;
  node.classList.toggle("clickable", !!onClick);
  node.onclick = onClick;
  clearTimeout(node._timer);
  node._timer = setTimeout(() => {
    node.classList.remove("show");
    node.onclick = null;
  }, duration);
}

// ── Ajustes (idioma, tema, vistas) ──

/** Abre el popup de ajustes (re-renderiza el contenido para traducirlo). */
function openSettings() {
  renderSettingsBody();
  $("#settings-modal").classList.add("show");
  document.body.classList.add("modal-open");
}

/** Cierra el popup de ajustes. */
function closeSettings() {
  $("#settings-modal").classList.remove("show");
  document.body.classList.remove("modal-open");
}

/** Marca como activa la opción cuyo valor coincida dentro de un grupo .seg. */
function setSegActive(sel, value) {
  const seg = $(sel);
  if (!seg) return;
  seg.querySelectorAll(".seg-btn").forEach((btn) => {
    const on = btn.dataset.value === value;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

/** Sincroniza el tooltip del botón y las opciones marcadas del popup. */
function syncSettingsUI() {
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  setSegActive("#settings-lang", locale());
  setSegActive("#settings-theme", theme);
  setSegActive("#settings-view-ports", viewMode);
  setSegActive("#settings-view-roms", romsViewMode);
  const btn = $("#btn-settings");
  if (btn) btn.title = t("settings.title");
}

/** Aplica el tema (claro/oscuro) y lo persiste. */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writePreference(LS_THEME, theme);
  syncSettingsUI();
}

/** Construye el contenido del popup de ajustes (traducido). */
function renderSettingsBody() {
  const body = $("#settings-modal-body");
  body.innerHTML = "";
  const group = (label, id, options) => {
    const wrap = el("div", "settings-group");
    wrap.appendChild(el("div", "settings-label", label));
    const seg = el("div", "seg");
    seg.id = id;
    for (const opt of options) {
      const btn = el("button", "seg-btn", opt.label);
      btn.dataset.key = opt.key;
      btn.dataset.value = opt.value;
      btn.setAttribute("aria-pressed", "false");
      seg.appendChild(btn);
    }
    wrap.appendChild(seg);
    return wrap;
  };

  $("#settings-modal-title").textContent = t("settings.title");
  $("#settings-modal-close").title = t("settings.close");

  // Idioma
  body.appendChild(
    group(
      t("settings.language"),
      "settings-lang",
      availableLocales().map((loc) => ({ key: "locale", value: loc, label: localeLabel(loc) })),
    ),
  );
  // Tema
  body.appendChild(
    group(t("settings.theme"), "settings-theme", [
      { key: "theme", value: "light", label: `☀️ ${t("settings.themeLight")}` },
      { key: "theme", value: "dark", label: `🌙 ${t("settings.themeDark")}` },
    ]),
  );
  // Vista de ports y de ROMs
  body.appendChild(
    group(t("settings.viewPorts"), "settings-view-ports", [
      { key: "view", value: "cards", label: `▦ ${t("settings.viewCards")}` },
      { key: "view", value: "list", label: `☰ ${t("settings.viewList")}` },
    ]),
  );
  body.appendChild(
    group(t("settings.viewRoms"), "settings-view-roms", [
      { key: "view", value: "cards", label: `▦ ${t("settings.viewCards")}` },
      { key: "view", value: "list", label: `☰ ${t("settings.viewList")}` },
    ]),
  );

  syncSettingsUI();
}

/** Gestiona el botón de ajustes y los clics dentro del popup. */
function initSettings() {
  $("#btn-settings").addEventListener("click", () => {
    if ($("#settings-modal").classList.contains("show")) closeSettings();
    else openSettings();
  });
  $("#settings-modal-close").addEventListener("click", closeSettings);
  $("#settings-modal").addEventListener("click", (e) => {
    if (e.target === $("#settings-modal")) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#settings-modal").classList.contains("show")) closeSettings();
  });
  $("#settings-modal-body").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    const { key, value } = btn.dataset;
    if (key === "locale") {
      setLocale(value);
    } else if (key === "theme") {
      applyTheme(value);
    } else if (key === "view") {
      const isRoms = !!btn.closest("#settings-view-roms");
      writePreference(isRoms ? LS_ROMS_VIEW : LS_PORTS_VIEW, value);
      if (isRoms) {
        romsViewMode = value;
        if (state) renderRoms(state.scan);
      } else {
        viewMode = value;
        renderPorts();
      }
      syncViewActive();
      syncSettingsUI();
    }
  });
  // Subscribe to locale changes
  onLocaleChange(updateStaticText);
  // Initial render
  updateStaticText();
}

// ── Changelog (novedades de releases) ──

/** Abre el modal de novedades con las notas de una release (markdown ligero). */
function openChangelogModal({ title, version, notes }) {
  $("#changelog-modal-title").textContent = t("changelog.title");
  $("#changelog-modal-close").title = t("changelog.close");
  const body = $("#changelog-modal-body");
  body.innerHTML = "";
  const head = el("div", "changelog-head");
  head.appendChild(el("span", "changelog-app", title));
  if (version) head.appendChild(el("span", "badge version", `v${version}`));
  body.appendChild(head);
  if (notes && notes.trim()) {
    body.appendChild(renderNotes(notes));
  } else {
    body.appendChild(el("p", "changelog-empty", t("changelog.empty")));
  }
  $("#changelog-modal").classList.add("show");
  document.body.classList.add("modal-open");
}

/** Cierra el modal de novedades. */
function closeChangelogModal() {
  $("#changelog-modal").classList.remove("show");
  document.body.classList.remove("modal-open");
}

/**
 * Renderiza las notas de release de forma segura (solo textContent, nunca
 * HTML del servidor): soporta títulos `#`/`##`, listas `- ` y negritas **…**.
 */
function renderNotes(notes) {
  const wrap = el("div", "changelog-notes");
  for (const rawLine of notes.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (/^#{1,4}\s+/.test(line)) {
      wrap.appendChild(el("h4", "changelog-h", line.replace(/^#{1,4}\s+/, "")));
      continue;
    }
    const text = line.replace(/^[-*]\s+/, "");
    const p = el("p", "changelog-line");
    // Negritas **…** -> <strong> (alternando con nodos de texto).
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (i % 2 === 1) p.appendChild(el("strong", "", parts[i]));
      else p.appendChild(document.createTextNode(parts[i]));
    }
    wrap.appendChild(p);
  }
  return wrap;
}

// ── Carga de estado ──

async function load() {
  try {
    state = await api("/api/status");
    render();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── Render ──

/** Renderiza el estado completo: estadísticas, self-update, ports y ROMs. */
function render() {
  if (!state) return;
  const { ports, scan, platform } = state;

  $("#platform-chip").textContent = `Plataforma: ${platform.key}`;
  renderSelfUpdate(state.self);
  $("#stat-roms").textContent = scan.roms.length;
  $("#stat-installed").textContent = ports.filter((p) => p.installed).length;
  $("#stat-mods").textContent = ports.reduce((total, p) => total + p.mods.length, 0);
  $("#stat-updates").textContent = ports.filter((p) => p.updateAvailable).length;
  const dirs = state.cfg.romsDirs || [state.cfg.romsDir];
  const dirsLabel = dirs.length === 1 ? dirs[0] : `${dirs[0]} (+${dirs.length - 1})`;
  $("#cfg-roms-dir").textContent = `${t("footer.romsDir")}: ${dirsLabel}`;
  $("#roms-hint").textContent = t("roms.hint", scan.matches.length);
  const updates = ports.filter((p) => p.updateAvailable).length;
  const updateAllBtn = $("#btn-update-all");
  if (updateAllBtn) {
    updateAllBtn.disabled = updates === 0 || updateAllRunning();
    updateAllBtn.title = t("btn.updateAllHint", updates);
  }

  const installed = ports.filter((p) => p.installed);
  const available = ports.filter((p) => !p.installed);
  $("#ports-hint-installed").textContent = t("ports.hintInstalled", installed.length);
  $("#ports-hint-available").textContent = t("ports.hintAvailable", available.length);
  $("#tab-count-installed").textContent = installed.length;
  $("#tab-count-available").textContent = available.length;
  $("#tab-count-roms").textContent = scan.roms.length;

  allPorts = ports;
  renderPorts();
  renderRoms(scan);

  // Re-open the mods modal if it was open (e.g. after a re-render/refresh)
  if (modsModalPort) {
    const port = allPorts.find((p) => p.manifest.id === modsModalPort);
    if (port) openModsModal(port);
    else closeModsModal();
  }
}

/** Renderiza las dos listas de ports (instalados y disponibles) con su filtro. */
function renderPorts() {
  if (!state) return;
  renderPortsInto("#ports-grid-installed", allPorts.filter((p) => p.installed), installedQuery, t("ports.emptyInstalled"));
  renderPortsInto("#ports-grid-available", allPorts.filter((p) => !p.installed), availableQuery, t("ports.emptyAvailable"));
}

/** Pinta los ports de `list` en el contenedor aplicando el filtro de búsqueda. */
function renderPortsInto(containerSelector, list, query, emptyMsg) {
  const grid = $(containerSelector);
  grid.classList.toggle("list", viewMode === "list");
  grid.innerHTML = "";
  const q = query.toLowerCase();
  const filtered = q
    ? list.filter((p) => `${p.manifest.name} ${p.manifest.game}`.toLowerCase().includes(q))
    : list;
  if (filtered.length === 0) {
    grid.appendChild(el("div", "loading", q ? t("ports.empty") : emptyMsg));
    return;
  }
  for (const port of filtered) {
    grid.appendChild(portCard(port));
  }
}

/** Construye la tarjeta de un port (estado, ROMs, mods, acciones y progreso). */
function portCard(p) {
  const m = p.manifest;
  const card = el("div", `port-card${p.installed ? " installed" : ""}`);

  // Top row: icono del proyecto + título a la izquierda, badges a la derecha.
  const top = el("div", "port-top");
  const head = el("div", "port-head");
  {
    // Icono por convención: assets/<portId>.png (se gestiona aparte de los
    // manifiestos, que no llevan campo de icono). Si el archivo no existe,
    // el <img> se quita sin romper el layout.
    const icon = el("img", "port-icon");
    icon.src = "assets/" + m.id + ".png";
    icon.alt = m.name;
    icon.loading = "lazy";
    icon.addEventListener("error", function onError() {
      icon.removeEventListener("error", onError);
      // Si falla, usar el icono por defecto una sola vez.
      if (!icon.src.includes("assets/default.png")) {
        icon.src = "assets/default.png";
      } else {
        icon.remove();
      }
    });
    // La imagen abre el repositorio del port en el navegador por defecto.
    // En la app de escritorio desktop/window.ts redirige window.open a
    // shell.openExternal; en navegador abre una pestaña nueva.
    if (m.repo && /^[A-Za-z0-9._/-]+$/.test(m.repo)) {
      const repoUrl = `https://github.com/${m.repo}`;
      icon.title = t("port.sourceHint", `github.com/${m.repo}`);
      icon.classList.add("repo-link");
      icon.tabIndex = 0;
      icon.setAttribute("role", "link");
      icon.addEventListener("click", () => window.open(repoUrl, "_blank", "noopener"));
      icon.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.open(repoUrl, "_blank", "noopener");
        }
      });
    }
    head.appendChild(icon);
  }
  const titleBox = el("div");
  titleBox.appendChild(el("div", "port-title", m.name));
  titleBox.appendChild(el("div", "port-game", m.game));
  head.appendChild(titleBox);
  top.appendChild(head);

  const badges = el("div");
  // Con actualización pendiente solo se muestra el chip de update, que ya
  // incluye la versión instalada (⬆ 1.2.3 → 1.4.0); si no, el chip de versión.
  if (p.installed && !p.updateAvailable) {
    badges.appendChild(el("span", "badge version", p.version));
  }
  if (p.updateAvailable) {
    const badge = el("span", "badge update", `⬆ ${p.updateInfo.installed} → ${p.updateInfo.latest}`);
    badges.appendChild(badge);
    // Botón de novedades: abre el changelog de la versión nueva (si hay notas).
    if (p.updateInfo?.notes) {
      const notesBtn = el("button", "badge update notes-btn", "📝");
      notesBtn.title = t("changelog.button");
      notesBtn.addEventListener("click", () =>
        openChangelogModal({ title: m.name, version: p.updateInfo.latest, notes: p.updateInfo.notes }),
      );
      badges.appendChild(notesBtn);
    }
  }
  top.appendChild(badges);
  card.appendChild(top);

  card.appendChild(el("div", "port-desc", m.description));

  // ROM status (one slot per requirement — multirom ports show base + MQ)
  for (const slot of p.roms) {
    const romLine = el("div", "rom-line");
    if (slot.matched) {
      romLine.appendChild(el("span", "badge rom-ok", t("port.romOk")));
      romLine.appendChild(document.createTextNode(`${slot.name} — ${slot.romName}`));
      if (slot.matchedBy === "hash") romLine.appendChild(el("span", "badge version", t("roms.byHash")));
      if (slot.matchedBy === "gameid") romLine.appendChild(el("span", "badge version", t("roms.byGameId")));
    } else {
      romLine.appendChild(el("span", "badge rom-missing", t("port.romMissing")));
      romLine.appendChild(document.createTextNode(slot.name + (slot.required ? "" : ` ${t("port.optional")}`)));
    }
    card.appendChild(romLine);
  }

  // Mods — chips capped at MAX_MODS_INLINE. El botón "Añadir mods" vive en la
  // fila de acciones, junto a "Abrir archivos" y "Desinstalar".
  const modsRow = el("div", "mod-row");
  if (p.mods.length > 0) {
    const visible = p.mods.length > MAX_MODS_INLINE ? p.mods.slice(0, MAX_MODS_INLINE) : p.mods;
    for (const mod of visible) modsRow.appendChild(modChip(p, mod));
    if (p.mods.length > MAX_MODS_INLINE) {
      const openBtn = el("button", "btn ghost sm mods-open-btn", t("mod.openAll", p.mods.length));
      openBtn.addEventListener("click", () => openModsModal(p));
      modsRow.appendChild(openBtn);
    }
  }
  if (modsRow.children.length > 0) card.appendChild(modsRow);

  // Mientras haya una tarea en marcha para el port, se bloquean las acciones.
  const busy = busyPortIds.has(p.manifest.id);

  // Fila de acciones secundarias: añadir mods, abrir archivos y desinstalar
  // comparten la misma fila. En ports no instalados solo aparece "Añadir mods".
  const actions = el("div", "port-actions");
  const addModsBtn = el("button", "btn ghost sm mods-add-btn", t("mod.addMods"));
  addModsBtn.title = t("mod.addModsHint", p.modsRoot);
  addModsBtn.disabled = busy;
  addModsBtn.addEventListener("click", () => openPortModsFolder(p));
  actions.appendChild(addModsBtn);
  if (p.installed) {
    const files = el("button", "btn ghost sm", t("port.openFolder"));
    files.title = t("port.openFolderHint");
    files.disabled = busy;
    files.addEventListener("click", () => openPortFolder(p));
    actions.appendChild(files);
    const un = el("button", "btn red sm", t("port.uninstall"));
    un.disabled = busy;
    un.addEventListener("click", () => doUninstall(p));
    actions.appendChild(un);
  }
  card.appendChild(actions);

  // …y fila principal (update / play) en su propia línea, alineada a la derecha.
  const mainActions = el("div", "port-actions main");
  if (p.installed) {
    const upd = el("button", "btn sm", t("port.update"));
    upd.disabled = busy || !p.updateAvailable;
    upd.addEventListener("click", () => doUpdate(p));
    mainActions.appendChild(upd);
    if (p.updateAvailable) {
      const up = el("button", "btn warn sm", t("port.updateAndPlay"));
      up.disabled = busy;
      up.addEventListener("click", () => doUpdateAndLaunch(p));
      mainActions.appendChild(up);
    }
    const launch = el("button", "btn green sm", t("port.launch"));
    launch.disabled = busy;
    launch.addEventListener("click", () => doLaunch(p));
    mainActions.appendChild(launch);
  } else {
    const inst = el("button", "btn sm", p.hasRom ? t("port.install") : t("port.installNoRom"));
    inst.disabled = busy;
    inst.addEventListener("click", () => doInstall(p));
    mainActions.appendChild(inst);
  }
  card.appendChild(mainActions);

  // Progress real: barra con % de la tarea + etapa + botón cancelar.
  if (busyPortIds.has(p.manifest.id) || taskForPort(p.manifest.id)) {
    const task = taskForPort(p.manifest.id);
    const wrap = el("div", "progress-wrap");
    const progress = el("div", "progress");
    const bar = el("div", "bar");
    bar.dataset.task = task ? task.id : "";
    if (task && task.pct > 0) {
      bar.style.width = `${task.pct}%`;
    } else {
      bar.classList.add("indeterminate");
    }
    progress.appendChild(bar);
    wrap.appendChild(progress);
    if (task && task.status === "running") {
      wrap.appendChild(el("span", "progress-stage", `${task.label}: ${taskStageLabel(task.stage)}`));
      const cancel = el("button", "btn red sm cancel-btn", t("task.cancel"));
      cancel.title = t("task.cancel");
      cancel.addEventListener("click", () => cancelTask(task.id));
      wrap.appendChild(cancel);
    }
    card.appendChild(wrap);
  }

  return card;
}

/** Chip de un mod con su estado de enlace y botón para alternarlo. */
function modChip(p, mod) {
  const linked = p.linkedMods.includes(mod);
  const chip = el("span", "mod-chip");
  chip.appendChild(el("span", `dot ${linked ? "linked" : "unlinked"}`));
  chip.appendChild(document.createTextNode(mod));
  const btn = el("button", "", linked ? "✕" : "＋");
  btn.title = linked ? t("mod.unlink") : t("mod.link");
  btn.addEventListener("click", () => toggleMod(p, mod, linked));
  chip.appendChild(btn);
  return chip;
}

/** Abre el modal de mods de un port (habilitar/deshabilitar todos o uno a uno). */
function openModsModal(p) {
  modsModalPort = p.manifest.id;
  $("#mods-modal-title").textContent = t("mod.modalTitle", p.manifest.name);
  const body = $("#mods-modal-body");
  body.innerHTML = "";
  // Botón para habilitar/deshabilitar todos los mods a la vez
  if (p.mods.length > 0) {
    const allLinked = p.linkedMods.length === p.mods.length;
    const toggleAll = el(
      "button",
      `btn mods-toggle-all ${allLinked ? "red" : "green"}`,
      allLinked ? t("mod.disableAll") : t("mod.enableAll"),
    );
    toggleAll.addEventListener("click", () => toggleAllMods(p, !allLinked));
    body.appendChild(toggleAll);
  }
  const row = el("div", "mod-row mod-row-modal");
  for (const mod of p.mods) row.appendChild(modChip(p, mod));
  body.appendChild(row);
  $("#mods-modal").classList.add("show");
  document.body.classList.add("modal-open");
}

function closeModsModal() {
  modsModalPort = null;
  $("#mods-modal").classList.remove("show");
  document.body.classList.remove("modal-open");
}

/** Abre la carpeta central de mods del port (MODS/<gameDir>) en el gestor de archivos. */
function openPortModsFolder(p) {
  api("/api/open-mods-folder", { id: p.manifest.id }).catch((e) => toast(e.message, "error"));
}

/** Abre la carpeta del port instalado (ports/<id>) en el gestor de archivos. */
function openPortFolder(p) {
  api("/api/open-port-folder", { id: p.manifest.id }).catch((e) => toast(e.message, "error"));
}

/** Chip de versión + botón de auto-update de la propia app (si hay release nueva). */
function renderSelfUpdate(self) {
  const chip = $("#app-version");
  const btn = $("#btn-self-update");
  const notesBtn = $("#btn-self-changelog");
  if (!self) {
    chip.textContent = "";
    btn.hidden = true;
    notesBtn.hidden = true;
    return;
  }
  chip.textContent = t("self.version", self.current);
  const show = self.available && self.supported;
  btn.hidden = !show;
  btn.disabled = false;
  // Botón de novedades: visible si hay release nueva con notas, aunque el
  // auto-update no esté soportado en esta build (p. ej. CLI plano).
  notesBtn.hidden = !self.available || !self.notes;
  if (!notesBtn.hidden) {
    notesBtn.title = t("changelog.button");
    notesBtn.dataset.latest = self.latest;
    notesBtn.dataset.notes = self.notes;
  }
  if (show) {
    btn.textContent = t("self.updateBtn", self.latest);
    btn.title = t("self.updateAvailable", self.latest);
    btn.dataset.latest = self.latest;
    if (!selfToastShown) {
      selfToastShown = true;
      toast(t("toast.selfAvailable", self.latest), "warn", 9000, doSelfUpdate);
    }
  }
}

/** Descarga y aplica la nueva AppImage de Brisa (la app se cierra y relanza sola). */
async function doSelfUpdate() {
  const btn = $("#btn-self-update");
  if (!btn.hidden && btn.disabled) return;
  btn.disabled = true;
  const latest = btn.dataset.latest ?? "";
  toast(t("toast.selfUpdating", latest), "ok", 6000);
  try {
    // El endpoint exige POST (descarga el asset y lanza el updater). api() solo
    // hace POST cuando recibe body; sin él haría GET y el servidor respondería
    // 404 {"error":"not found"}.
    const data = await api("/api/self-update", {});
    toast(t("toast.selfUpdated", data.info.latest), "ok", 9000);
  } catch (e) {
    btn.disabled = false;
    toast(e.message, "error", 6000);
  }
}

/** Renderiza la lista de ROMs (vista tarjetas o lista) con sus ports asociados. */
function renderRoms(scan) {
  const list = $("#roms-list");
  list.classList.toggle("list", romsViewMode === "list");
  list.innerHTML = "";
  if (scan.roms.length === 0) {
    list.appendChild(el("div", "loading", t("roms.empty")));
    return;
  }
  const matchedByPath = {};
  for (const match of scan.matches) {
    const multi = match.manifest.roms.length > 1;
    const label = multi ? `${match.manifest.name} · ${match.requirement.name}` : match.manifest.name;
    (matchedByPath[match.rom.path] ??= []).push(label);
  }
  for (const rom of scan.roms) {
    list.appendChild(romsViewMode === "cards" ? romCard(rom, matchedByPath[rom.path]) : romListItem(rom, matchedByPath[rom.path]));
  }
}

function romHashRow(rom) {
  const hashRow = el("div", "rom-hash-row");
  hashRow.appendChild(el("span", "rom-hash", `sha1 ${rom.sha1.slice(0, 16)}…`));
  const copyBtn = el("button", "copy-btn", "⧉");
  copyBtn.title = t("roms.copyHash");
  copyBtn.addEventListener("click", () => copyHash(rom.sha1));
  hashRow.appendChild(copyBtn);
  return hashRow;
}

function romDeleteBtn(rom) {
  const del = el("button", "copy-btn del-btn", "🗑");
  del.title = t("roms.delete");
  del.addEventListener("click", () => deleteRom(rom));
  return del;
}

/** Vista de tarjetas: icono, nombre, hash, tamaño y acciones. */
function romCard(rom, matchedBy) {
  const card = el("div", "rom-card");
  const head = el("div", "rom-card-head");
  head.appendChild(el("div", "rom-icon", "💾"));
  head.appendChild(el("div", "rom-name", rom.name));
  card.appendChild(head);
  const meta = el("div", "rom-meta");
  meta.appendChild(romHashRow(rom));
  meta.appendChild(el("div", "rom-size", fmtSize(rom.size)));
  card.appendChild(meta);
  const foot = el("div", "rom-card-foot");
  if (matchedBy && matchedBy.length > 0) {
    for (const portName of matchedBy) foot.appendChild(el("div", "badge rom-ok", portName));
  } else {
    foot.appendChild(el("div", "badge rom-nomatch", t("roms.noMatch")));
  }
  foot.appendChild(el("div", "spacer"));
  foot.appendChild(romDeleteBtn(rom));
  card.appendChild(foot);
  return card;
}

/** Vista de lista: la fila compacta de siempre. */
function romListItem(rom, matchedBy) {
  const item = el("div", "rom-item");
  item.appendChild(el("div", "rom-icon", "💾"));
  item.appendChild(el("div", "rom-name", rom.name));
  const meta = el("div", "rom-meta");
  meta.appendChild(romHashRow(rom));
  meta.appendChild(el("div", "", fmtSize(rom.size)));
  const badges = el("div", "rom-badges");
  if (matchedBy && matchedBy.length > 0) {
    for (const portName of matchedBy) badges.appendChild(el("div", "badge rom-ok", portName));
  } else {
    badges.appendChild(el("div", "badge rom-nomatch", t("roms.noMatch")));
  }
  meta.appendChild(badges);
  meta.appendChild(romDeleteBtn(rom));
  item.appendChild(meta);
  return item;
}

// ── Ayuda ──

/** Renderiza la sección de ayuda (bienvenida, pasos y nota legal). */
function renderHelp() {
  const title = $("#help-title");
  if (!title) return;
  title.textContent = t("help.title");
  $("#help-intro").textContent = t("help.intro");
  const grid = $("#help-steps");
  grid.innerHTML = "";
  // Banner destacado solo en el primer arranque (persiste durante la sesión,
  // aunque se cambie de idioma).
  if (firstRun) grid.appendChild(el("div", "help-welcome", `🎉 ${t("help.welcome")}`));
  const steps = tRaw("help.steps") ?? [];
  for (const step of steps) {
    const card = el("div", "help-card");
    const icon = el("div", "help-icon", step.icon ?? "•");
    card.appendChild(icon);
    const body = el("div", "help-body");
    body.appendChild(el("h3", "help-card-title", step.title));
    body.appendChild(el("p", "help-card-text", step.text));
    card.appendChild(body);
    grid.appendChild(card);
  }
  const legal = el("div", "help-legal", t("help.legal"));
  const finish = el("button", "btn green", t("help.finish"));
  finish.addEventListener("click", () => switchTab("installed"));
  const foot = el("div", "help-foot");
  foot.appendChild(legal);
  foot.appendChild(finish);
  grid.appendChild(foot);
}

// ── ROMs: añadir, borrar, abrir carpeta ──

/** Activa el overlay de drag & drop: arrastrar archivos a la ventana sube ROMs. */
function initDropZone() {
  const overlay = $("#drop-overlay");
  let dragDepth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    overlay.classList.add("show");
  });
  window.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener("dragleave", (e) => {
    if (dragDepth <= 0) return;
    dragDepth--;
    if (dragDepth === 0) overlay.classList.remove("show");
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove("show");
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) uploadRoms(files);
  });
}

/** Conecta el botón "Add ROMs" con el input de archivo oculto. */
function initRomPicker() {
  const input = $("#rom-file-input");
  $("#btn-add-roms").addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files && input.files.length > 0) uploadRoms(Array.from(input.files));
    input.value = "";
  });
}

/** Sube los archivos seleccionados/arrastrados y resume el resultado en toasts. */
async function uploadRoms(files) {
  let added = 0;
  let skipped = 0;
  for (const file of files) {
    if (!file.name || file.size === 0) continue;
    try {
      const data = await uploadRom(file, (pct) => toast(`${t("toast.uploading", file.name)} ${pct}%`));
      if (data.skipped) skipped++;
      else added++;
    } catch (e) {
      toast(`${file.name}: ${e.message}`, "error", 4000);
    }
  }
  if (added > 0 && skipped > 0) {
    toast(`${t("toast.romsAdded", added)} · ${t("toast.romsSkipped", skipped)}`, "ok", 5000);
  } else if (added > 0) {
    toast(t("toast.romsAdded", added), "ok", 4000);
  } else if (skipped > 0) {
    toast(t("toast.romsSkipped", skipped), "warn", 4000);
  }
  load();
}

/** Borra un ROM tras confirmación y refresca el estado. */
async function deleteRom(rom) {
  if (!window.confirm(t("roms.deleteConfirm", rom.name))) return;
  try {
    await api("/api/roms/delete", { path: rom.path });
    toast(t("toast.romDeleted", rom.name), "ok");
    load();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── Manifiestos: exportar / importar ──

/** Descarga el ZIP con todos los manifiestos (GET /api/manifests/export). */
async function exportManifests() {
  try {
    const res = await fetch("/api/manifests/export");
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        msg = data.error || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const count = Number(res.headers.get("X-Manifest-Count") ?? 0);
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "brisa-manifests.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(t("toast.manifestsExported", count), "ok");
  } catch (e) {
    toast(e.message, "error");
  }
}

/** Conecta los botones de exportar/importar manifiestos y gestiona el archivo importado. */
function initManifestTools() {
  const fileInput = $("#manifest-file-input");
  $("#btn-import-manifests").addEventListener("click", () => fileInput.click());
  $("#btn-export-manifests").addEventListener("click", exportManifests);
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const payload = Array.isArray(parsed) ? { manifests: parsed } : parsed;
      const data = await api("/api/manifests/import", payload);
      const notes = (data.errors?.length ?? 0) + (data.warnings?.length ?? 0);
      if (data.imported === 0 && data.errors && data.errors.length > 0) {
        toast(`${t("toast.importError")}: ${data.errors[0]}`, "error", 5000);
      } else if (notes > 0) {
        toast(`${t("toast.manifestsImported", data.imported)} · ⚠ ${notes}`, "warn", 5000);
      } else {
        toast(t("toast.manifestsImported", data.imported), "ok");
      }
      load();
    } catch (e) {
      toast(`${t("toast.importError")}: ${e.message}`, "error", 5000);
    }
  });
}

// ── Acciones de ports ──

/** Marca un port como ocupado durante `fn` y recarga el estado al terminar. */
async function busyRun(id, fn) {
  busyPortIds.add(id);
  render();
  try {
    await fn();
  } finally {
    busyPortIds.delete(id);
    await load();
  }
}

/** Instala un port (tarea en segundo plano con progreso). */
function doInstall(p) {
  toast(t("toast.installing", p.manifest.name));
  startPortTask(p, "/api/install", "install");
}

/** Desinstala un port tras confirmación del usuario. */
function doUninstall(p) {
  // Confirmación explícita antes de desinstalar.
  openConfirmModal({
    title: t("confirm.uninstallTitle"),
    message: t("confirm.uninstallMessage", p.manifest.name),
    confirmText: t("confirm.uninstall"),
    onConfirm: () =>
      busyRun(p.manifest.id, async () => {
        await api("/api/uninstall", { id: p.manifest.id });
        toast(t("toast.uninstalled", p.manifest.name), "ok");
      }),
  });
}

/** Actualiza un port a su última versión (tarea en segundo plano). */
function doUpdate(p) {
  toast(t("toast.installing", p.manifest.name));
  startPortTask(p, "/api/update", "update");
}

/** Actualiza un port y lo lanza al terminar la actualización. */
function doUpdateAndLaunch(p) {
  toast(t("toast.installing", p.manifest.name));
  startPortTask(p, "/api/update", "update", () => {
    toast(t("toast.launching", p.manifest.name), "ok");
    launchPort(p.manifest.id);
  });
}

/** Actualiza todos los ports instalados con actualización disponible (una tarea). */
function doUpdateAll() {
  if (updateAllRunning()) return;
  toast(t("toast.updatingAll"));
  api("/api/update-all", {})
    .then((data) => {
      if (!data.task) throw new Error(t("toast.error"));
      trackTask(data.task, null, null);
      render();
      updateGlobalTaskUI();
    })
    .catch((e) => toast(e.message, "error"));
}

/** Lanza un port y avisa con un toast si hay una versión nueva disponible. */
function doLaunch(p) {
  api("/api/status").catch(() => {});
  toast(t("toast.launching", p.manifest.name), "ok");
  launchPort(p.manifest.id);
  // Auto update check: warn with a clickable toast if a new version is available
  api("/api/check-update", { id: p.manifest.id })
    .then(({ info }) => {
      if (info && info.available) {
        toast(t("toast.updateAvailable", info.name, info.installed, info.latest), "warn", 9000, () => doUpdate(p));
      }
    })
    .catch(() => {});
}

/** Enlaza o desenlaza un mod del port según su estado actual. */
function toggleMod(p, mod, linked) {
  busyRun(p.manifest.id, async () => {
    await api(linked ? "/api/mods/unlink" : "/api/mods/link", { id: p.manifest.id, mod });
    toast(linked ? t("toast.modUnlinked", mod) : t("toast.modLinked", mod), "ok");
  });
}

/** Habilita o deshabilita todos los mods de un port de una sola vez. */
function toggleAllMods(p, enable) {
  busyRun(p.manifest.id, async () => {
    await api(enable ? "/api/mods/link-all" : "/api/mods/unlink-all", { id: p.manifest.id });
    toast(enable ? t("toast.modsEnabledAll", p.mods.length) : t("toast.modsDisabledAll", p.mods.length), "ok");
  });
}

// ── Init ──

/** Conecta los buscadores de ports instalados y disponibles. */
function initPortsTools() {
  $("#ports-search-installed").addEventListener("input", (e) => {
    installedQuery = e.target.value.trim();
    renderPorts();
  });
  $("#ports-search-available").addEventListener("input", (e) => {
    availableQuery = e.target.value.trim();
    renderPorts();
  });
}

/**
 * Cambia la pestaña activa (installed / available / roms / help) y la persiste.
 * Con `persist = false` (primer arranque) no se guarda para no reabrir en la
 * pestaña de ayuda la próxima vez.
 */
function switchTab(tab, persist = true) {
  activeTab = tab;
  if (persist) writePreference(LS_ACTIVE_TAB, tab);
  $$(".tab-btn").forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", String(on));
  });
  $$(".tab-pane").forEach((pane) => pane.classList.toggle("active", pane.dataset.tab === tab));
}

/** Conecta las pestañas (instalados / disponibles / ROMs / ayuda). */
function initTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  switchTab(activeTab);
}

/** Conecta los toggles de vista tarjetas/lista para ports y ROMs (persistido). */
function initViewToggles() {
  $$(".view-toggle").forEach((toggle) => {
    const isRoms = toggle.id === "roms-view-toggle";
    toggle.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.view;
        if (isRoms) romsViewMode = mode;
        else viewMode = mode;
        writePreference(isRoms ? LS_ROMS_VIEW : LS_PORTS_VIEW, mode);
        syncViewActive();
        if (isRoms) {
          if (state) renderRoms(state.scan);
        } else {
          renderPorts();
        }
      });
    });
  });
}

/** Callback pendiente del modal de confirmación (null si no hay uno abierto). */
let confirmAction = null;

/** Abre el modal de confirmación con título, mensaje y acción al confirmar. */
function openConfirmModal({ title, message, confirmText, onConfirm }) {
  $("#confirm-modal-title").textContent = title;
  $("#confirm-modal-message").textContent = message;
  const okBtn = $("#confirm-modal-ok");
  okBtn.textContent = confirmText;
  $("#confirm-modal-cancel").textContent = t("confirm.cancel");
  confirmAction = onConfirm;
  $("#confirm-modal").classList.add("show");
  document.body.classList.add("modal-open");
}

/** Cierra el modal de confirmación sin ejecutar la acción. */
function closeConfirmModal() {
  confirmAction = null;
  $("#confirm-modal").classList.remove("show");
  document.body.classList.remove("modal-open");
}

/** Conecta los eventos del modal de novedades (cerrar, fondo, Escape, botón). */
function initChangelogModal() {
  $("#changelog-modal-close").addEventListener("click", closeChangelogModal);
  $("#changelog-modal").addEventListener("click", (e) => {
    if (e.target === $("#changelog-modal")) closeChangelogModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#changelog-modal").classList.contains("show")) closeChangelogModal();
  });
  $("#btn-self-changelog").addEventListener("click", () => {
    const btn = $("#btn-self-changelog");
    openChangelogModal({
      title: t("brand.title"),
      version: btn.dataset.latest ?? "",
      notes: btn.dataset.notes ?? "",
    });
  });
}

/** Conecta los eventos del modal de mods (cerrar, fondo, Escape). */
function initModsModal() {
  $("#mods-modal-close").addEventListener("click", closeModsModal);
  $("#mods-modal").addEventListener("click", (e) => {
    if (e.target === $("#mods-modal")) closeModsModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#mods-modal").classList.contains("show")) closeModsModal();
  });
}

/** Conecta los eventos del modal de confirmación (OK, cancelar, fondo, Escape). */
function initConfirmModal() {
  $("#confirm-modal-close").addEventListener("click", closeConfirmModal);
  $("#confirm-modal-cancel").addEventListener("click", closeConfirmModal);
  $("#confirm-modal-ok").addEventListener("click", () => {
    const action = confirmAction;
    closeConfirmModal();
    if (action) action();
  });
  $("#confirm-modal").addEventListener("click", (e) => {
    if (e.target === $("#confirm-modal")) closeConfirmModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#confirm-modal").classList.contains("show")) closeConfirmModal();
  });
}

async function init() {
  await i18nReady();
  // Primer arranque: el flag se persiste en el servidor (stateDir) para que
  // sobreviva reinicios de Electron (localStorage no persiste con sandbox).
  let helpSeen = false;
  try {
    const data = await api("/api/help-seen");
    helpSeen = data.seen;
  } catch {
    // Si el endpoint no existe aún (versión antigua del servidor),
    // fallback a localStorage.
    helpSeen = readPreference(LS_HELP_SEEN) === "1";
  }
  if (!helpSeen) {
    firstRun = true;
    // Marcar en servidor + localStorage (doble seguridad).
    api("/api/help-seen", {}).catch(() => {});
    writePreference(LS_HELP_SEEN, "1");
  }
  initSettings();
  initTabs();
  // Solo en el primer arranque se abre la ayuda sin persistir la pestaña.
  if (firstRun) switchTab("help", false);
  initPortsTools();
  initViewToggles();
  initModsModal();
  initChangelogModal();
  initConfirmModal();
  initDropZone();
  initRomPicker();
  initManifestTools();
  $("#btn-update-all").addEventListener("click", doUpdateAll);
  $("#global-task-cancel").addEventListener("click", () => {
    const id = $("#global-task").dataset.task;
    if (id) cancelTask(id);
  });
  $("#btn-open-folder").addEventListener("click", () => {
    api("/api/open-folder", {}).catch((e) => toast(e.message, "error"));
  });
  $("#btn-refresh").addEventListener("click", () => load());
  $("#btn-self-update").addEventListener("click", doSelfUpdate);
  load();
  setInterval(() => {
    if (busyPortIds.size === 0) load();
  }, AUTO_REFRESH_MS);
}

init();
