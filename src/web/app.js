/* Brisa GUI — interfaz: estado, renderizado y eventos.
 * La capa de red vive en api.js y las utilidades en utils.js.
 * (api, uploadRom, launchPort, fmtSize, copyHash están definidas ahí.) */

let state = null;
let busyPortIds = new Set();

const MAX_MODS_INLINE = 3;

let allPorts = [];
let installedQuery = "";
let availableQuery = "";
let viewMode = "cards";
let romsViewMode = "cards";
let activeTab = "installed";
let modsModalPort = null;
let selfToastShown = false;
try {
  viewMode = localStorage.getItem("brisa-ports-view") === "list" ? "list" : "cards";
} catch {
  /* localStorage may be unavailable */
}
try {
  romsViewMode = localStorage.getItem("brisa-roms-view") === "list" ? "list" : "cards";
} catch {
  /* localStorage may be unavailable */
}
try {
  const savedTab = localStorage.getItem("brisa-active-tab");
  if (savedTab === "installed" || savedTab === "available" || savedTab === "roms") activeTab = savedTab;
} catch {
  /* localStorage may be unavailable */
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// ── i18n ──

const { t, setLocale, locale, onLocaleChange, localeLabel, availableLocales, ready: i18nReady } = window.__i18n;

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

  $("#stat-label-roms").textContent = t("stat.roms");
  $("#stat-label-installed").textContent = t("stat.installed");
  $("#stat-label-mods").textContent = t("stat.mods");
  $("#stat-label-updates").textContent = t("stat.updates");

  $("#tab-label-installed").textContent = t("tabs.installed");
  $("#tab-label-available").textContent = t("tabs.available");
  $("#tab-label-roms").textContent = t("tabs.roms");
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

  // Update locale buttons active state
  $$(".locale-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.locale === locale());
  });

  // Re-render dynamic content if state is available
  if (state) render();
}

// ── Toast ──

function toast(msg, kind = "ok", duration = 3200, onClick = null) {
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

// ── Locale switcher ──

function initLocaleSwitcher() {
  const container = $("#locale-selector");
  container.innerHTML = "";
  const locales = availableLocales();
  locales.forEach((loc, i) => {
    if (i > 0) {
      const divider = document.createElement("span");
      divider.className = "locale-divider";
      divider.textContent = "|";
      container.appendChild(divider);
    }
    const btn = document.createElement("button");
    btn.className = "locale-btn";
    btn.dataset.locale = loc;
    btn.textContent = localeLabel(loc);
    btn.addEventListener("click", () => {
      setLocale(loc);
    });
    container.appendChild(btn);
  });
  // Subscribe to locale changes
  onLocaleChange(updateStaticText);
  // Initial render
  updateStaticText();
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

function render() {
  if (!state) return;
  const { ports, scan, platform } = state;

  $("#platform-chip").textContent = `Plataforma: ${platform.key}`;
  renderSelfUpdate(state.self);
  $("#stat-roms").textContent = scan.roms.length;
  $("#stat-installed").textContent = ports.filter((p) => p.installed).length;
  $("#stat-mods").textContent = ports.reduce((total, p) => total + p.mods.length, 0);
  $("#stat-updates").textContent = ports.filter((p) => p.updateAvailable).length;
  $("#cfg-roms-dir").textContent = `${t("footer.romsDir")}: ${state.cfg.romsDir}`;
  $("#roms-hint").textContent = t("roms.hint", scan.matches.length);

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

function renderPorts() {
  if (!state) return;
  renderPortsInto("#ports-grid-installed", allPorts.filter((p) => p.installed), installedQuery, t("ports.emptyInstalled"));
  renderPortsInto("#ports-grid-available", allPorts.filter((p) => !p.installed), availableQuery, t("ports.emptyAvailable"));
}

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
    icon.addEventListener("error", () => icon.remove());
    head.appendChild(icon);
  }
  const titleBox = el("div");
  titleBox.appendChild(el("div", "port-title", m.name));
  titleBox.appendChild(el("div", "port-game", m.game));
  head.appendChild(titleBox);
  top.appendChild(head);

  const badges = el("div");
  if (p.installed) {
    badges.appendChild(el("span", "badge version", p.version));
  }
  if (p.updateAvailable) {
    const badge = el("span", "badge update", `⬆ ${p.updateInfo.installed} → ${p.updateInfo.latest}`);
    badges.appendChild(badge);
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

  // Mods — chips capped at MAX_MODS_INLINE; "Añadir mods" opens the port's mods folder
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
  const addModsBtn = el("button", "btn ghost sm mods-add-btn", t("mod.addMods"));
  addModsBtn.title = t("mod.addModsHint", p.modsRoot);
  addModsBtn.addEventListener("click", () => openPortModsFolder(p));
  modsRow.appendChild(addModsBtn);
  card.appendChild(modsRow);

  // Acciones: fila secundaria (abrir archivos / desinstalar) a la izquierda…
  const actions = el("div", "port-actions");
  if (p.installed) {
    const files = el("button", "btn ghost sm", t("port.openFolder"));
    files.title = t("port.openFolderHint");
    files.addEventListener("click", () => openPortFolder(p));
    actions.appendChild(files);
    const un = el("button", "btn red sm", t("port.uninstall"));
    un.addEventListener("click", () => doUninstall(p));
    actions.appendChild(un);
    card.appendChild(actions);
  }

  // …y fila principal (update / play) en su propia línea, alineada a la derecha.
  const mainActions = el("div", "port-actions main");
  if (p.installed) {
    const upd = el("button", "btn sm", t("port.update"));
    upd.disabled = !p.updateAvailable;
    upd.addEventListener("click", () => doUpdate(p));
    mainActions.appendChild(upd);
    if (p.updateAvailable) {
      const up = el("button", "btn warn sm", t("port.updateAndPlay"));
      up.addEventListener("click", () => doUpdateAndLaunch(p));
      mainActions.appendChild(up);
    }
    const launch = el("button", "btn green sm", t("port.launch"));
    launch.addEventListener("click", () => doLaunch(p));
    mainActions.appendChild(launch);
  } else {
    const inst = el("button", "btn sm", p.hasRom ? t("port.install") : t("port.installNoRom"));
    inst.addEventListener("click", () => doInstall(p));
    mainActions.appendChild(inst);
  }
  card.appendChild(mainActions);

  // Progress bar
  if (busyPortIds.has(p.manifest.id)) {
    const progress = el("div", "progress");
    progress.appendChild(el("div", "bar"));
    card.appendChild(progress);
  }

  return card;
}

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
  if (!self) {
    chip.textContent = "";
    btn.hidden = true;
    return;
  }
  chip.textContent = t("self.version", self.current);
  const show = self.available && self.supported;
  btn.hidden = !show;
  btn.disabled = false;
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

// ── ROMs: añadir, borrar, abrir carpeta ──

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

function initRomPicker() {
  const input = $("#rom-file-input");
  $("#btn-add-roms").addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    if (input.files && input.files.length > 0) uploadRoms(Array.from(input.files));
    input.value = "";
  });
}

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

function doInstall(p) {
  busyRun(p.manifest.id, async () => {
    toast(t("toast.installing", p.manifest.name));
    const data = await api("/api/install", { id: p.manifest.id });
    toast(t("toast.installed", p.manifest.name, data.state.version), "ok");
  });
}

function doUninstall(p) {
  busyRun(p.manifest.id, async () => {
    await api("/api/uninstall", { id: p.manifest.id });
    toast(t("toast.uninstalled", p.manifest.name), "ok");
  });
}

function doUpdate(p) {
  busyRun(p.manifest.id, async () => {
    toast(t("toast.installing", p.manifest.name));
    const data = await api("/api/update", { id: p.manifest.id });
    toast(t("toast.updated", p.manifest.name, data.info.latest), "ok");
  });
}

function doUpdateAndLaunch(p) {
  busyRun(p.manifest.id, async () => {
    toast(t("toast.installing", p.manifest.name));
    const data = await api("/api/update", { id: p.manifest.id });
    toast(`${t("toast.updated", p.manifest.name, data.info.latest)} · ${t("toast.launching", p.manifest.name)}`, "ok");
    launchPort(p.manifest.id);
  });
}

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

/** Cambia la pestaña activa (installed / available / roms) y la persiste. */
function switchTab(tab) {
  activeTab = tab;
  try {
    localStorage.setItem("brisa-active-tab", tab);
  } catch {
    /* ignore */
  }
  $$(".tab-btn").forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", String(on));
  });
  $$(".tab-pane").forEach((pane) => pane.classList.toggle("active", pane.dataset.tab === tab));
}

function initTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  switchTab(activeTab);
}

/** Toggle tarjetas/lista para ports y ROMs (persistido en localStorage). */
function initViewToggles() {
  $$(".view-toggle").forEach((toggle) => {
    const isRoms = toggle.id === "roms-view-toggle";
    toggle.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.view;
        if (isRoms) romsViewMode = mode;
        else viewMode = mode;
        try {
          localStorage.setItem(isRoms ? "brisa-roms-view" : "brisa-ports-view", mode);
        } catch {
          /* ignore */
        }
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

function initModsModal() {
  $("#mods-modal-close").addEventListener("click", closeModsModal);
  $("#mods-modal").addEventListener("click", (e) => {
    if (e.target === $("#mods-modal")) closeModsModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#mods-modal").classList.contains("show")) closeModsModal();
  });
}

async function init() {
  await i18nReady();
  initLocaleSwitcher();
  initTabs();
  initPortsTools();
  initViewToggles();
  initModsModal();
  initDropZone();
  initRomPicker();
  initManifestTools();
  $("#btn-open-folder").addEventListener("click", () => {
    api("/api/open-folder", {}).catch((e) => toast(e.message, "error"));
  });
  $("#btn-refresh").addEventListener("click", () => load());
  $("#btn-self-update").addEventListener("click", doSelfUpdate);
  load();
  setInterval(() => {
    if (busyPortIds.size === 0) load();
  }, 8000);
}

init();
