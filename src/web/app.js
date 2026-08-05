/* Brisa GUI — i18n-ready */
let state = null;
let busy = new Set();

const MAX_MODS_INLINE = 3;

let allPorts = [];
let searchQuery = "";
let viewMode = "cards";
let modsModalPort = null;
try {
  viewMode = localStorage.getItem("brisa-ports-view") === "list" ? "list" : "cards";
} catch {
  /* localStorage may be unavailable */
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// ── i18n helpers ──

const { t, setLocale, locale, onLocaleChange, localeLabel, availableLocales, ready: i18nReady } = window.__i18n;

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

  $("#ports-title").textContent = t("ports.title");
  $("#ports-search").placeholder = t("ports.searchPlaceholder");
  $$(".view-btn").forEach((btn) => {
    btn.title = btn.dataset.view === "list" ? t("ports.viewList") : t("ports.viewCards");
    btn.classList.toggle("active", btn.dataset.view === viewMode);
  });
  $("#mods-modal-close").title = t("mod.close");
  $("#roms-title").textContent = t("roms.title");

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
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  t.classList.toggle("clickable", !!onClick);
  t.onclick = onClick;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove("show");
    t.onclick = null;
  }, duration);
}

// ── API ──

async function api(path, body) {
  const opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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

// ── Loader ──

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
  $("#stat-roms").textContent = scan.roms.length;
  $("#stat-installed").textContent = ports.filter((p) => p.installed).length;
  $("#stat-mods").textContent = ports.reduce((a, p) => a + p.mods.length, 0);
  $("#stat-updates").textContent = ports.filter((p) => p.updateAvailable).length;
  $("#cfg-roms-dir").textContent = `${t("footer.romsDir")}: ${state.cfg.romsDir}`;
  $("#ports-hint").textContent = t("ports.hint", ports.length);
  $("#roms-hint").textContent = t("roms.hint", scan.matches.length);

  allPorts = ports;
  renderPorts();
  renderRoms(scan);

  // Re-open the mods modal if it was open (e.g. after a re-render/refresh)
  if (modsModalPort) {
    const p = allPorts.find((x) => x.manifest.id === modsModalPort);
    if (p) openModsModal(p);
    else closeModsModal();
  }
}

function renderPorts() {
  const grid = $("#ports-grid");
  grid.classList.toggle("list", viewMode === "list");
  grid.innerHTML = "";
  const query = searchQuery.toLowerCase();
  const filtered = query
    ? allPorts.filter((p) => `${p.manifest.name} ${p.manifest.game}`.toLowerCase().includes(query))
    : allPorts;
  if (filtered.length === 0) {
    grid.appendChild(el("div", "loading", query ? t("ports.empty") : t("loading")));
    return;
  }
  for (const p of filtered) {
    grid.appendChild(portCard(p));
  }
}

function portCard(p) {
  const m = p.manifest;
  const card = el("div", `port-card${p.installed ? " installed" : ""}`);

  // Top row
  const top = el("div", "port-top");
  const titleBox = el("div");
  titleBox.appendChild(el("div", "port-title", m.name));
  titleBox.appendChild(el("div", "port-game", m.game));
  top.appendChild(titleBox);

  const badges = el("div");
  if (p.installed) {
    badges.appendChild(el("span", "badge version", p.version));
  }
  if (p.updateAvailable) {
    const b = el("span", "badge update", `⬆ ${p.updateInfo.installed} → ${p.updateInfo.latest}`);
    badges.appendChild(b);
  }
  top.appendChild(badges);
  card.appendChild(top);

  card.appendChild(el("div", "port-desc", m.description));

  // ROM status (one slot per requirement — multirom ports show base + MQ)
  for (const s of p.roms) {
    const romLine = el("div", "rom-line");
    if (s.matched) {
      romLine.appendChild(el("span", "badge rom-ok", t("port.romOk")));
      romLine.appendChild(document.createTextNode(`${s.name} — ${s.romName}`));
      if (s.matchedBy === "hash") romLine.appendChild(el("span", "badge version", t("roms.byHash")));
      if (s.matchedBy === "gameid") romLine.appendChild(el("span", "badge version", t("roms.byGameId")));
    } else {
      romLine.appendChild(el("span", "badge rom-missing", t("port.romMissing")));
      romLine.appendChild(document.createTextNode(s.name + (s.required ? "" : ` ${t("port.optional")}`)));
    }
    card.appendChild(romLine);
  }

  // Mods — capped at MAX_MODS_INLINE chips; "Abrir mods" opens a modal with all of them
  if (p.mods.length > 0) {
    const row = el("div", "mod-row");
    const visible = p.mods.length > MAX_MODS_INLINE ? p.mods.slice(0, MAX_MODS_INLINE) : p.mods;
    for (const mod of visible) row.appendChild(modChip(p, mod));
    if (p.mods.length > MAX_MODS_INLINE) {
      const openBtn = el("button", "btn ghost sm mods-open-btn", t("mod.openAll", p.mods.length));
      openBtn.addEventListener("click", () => openModsModal(p));
      row.appendChild(openBtn);
    }
    card.appendChild(row);
  } else if (p.installed) {
    const hint = el("div", "mods-empty");
    hint.appendChild(document.createTextNode(`${t("mod.empty")}: `));
    hint.appendChild(el("code", "", p.modsRoot));
    card.appendChild(hint);
  }

  // Actions
  const actions = el("div", "port-actions");
  if (p.installed) {
    const upd = el("button", "btn sm", t("port.update"));
    upd.disabled = !p.updateAvailable;
    upd.addEventListener("click", () => doUpdate(p));
    actions.appendChild(upd);
    if (p.updateAvailable) {
      const up = el("button", "btn warn sm", t("port.updateAndPlay"));
      up.addEventListener("click", () => doUpdateAndLaunch(p));
      actions.appendChild(up);
    }
  }
  actions.appendChild(el("div", "spacer"));
  if (p.installed) {
    const un = el("button", "btn red sm", t("port.uninstall"));
    un.addEventListener("click", () => doUninstall(p));
    actions.appendChild(un);
    const launch = el("button", "btn green sm", t("port.launch"));
    launch.addEventListener("click", () => doLaunch(p));
    actions.appendChild(launch);
  } else {
    const inst = el("button", "btn sm", p.hasRom ? t("port.install") : t("port.installNoRom"));
    inst.addEventListener("click", () => doInstall(p));
    actions.appendChild(inst);
  }
  card.appendChild(actions);

  // Progress bar
  if (busy.has(p.manifest.id)) {
    const prog = el("div", "progress");
    prog.appendChild(el("div", "bar"));
    card.appendChild(prog);
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

function renderRoms(scan) {
  const list = $("#roms-list");
  list.innerHTML = "";
  if (scan.roms.length === 0) {
    list.appendChild(el("div", "loading", t("roms.empty")));
    return;
  }
  const byName = {};
  for (const mm of scan.matches) {
    const multi = mm.manifest.roms.length > 1;
    byName[mm.rom.path] = multi ? `${mm.manifest.name} · ${mm.requirement.name}` : mm.manifest.name;
  }
  for (const r of scan.roms) {
    const item = el("div", "rom-item");
    item.appendChild(el("div", "rom-icon", "💾"));
    const name = el("div", "rom-name", r.name);
    item.appendChild(name);
    const meta = el("div", "rom-meta");
    const hashRow = el("div", "rom-hash-row");
    hashRow.appendChild(el("span", "rom-hash", `sha1 ${r.sha1.slice(0, 16)}…`));
    const copyBtn = el("button", "copy-btn", "⧉");
    copyBtn.title = t("roms.copyHash");
    copyBtn.addEventListener("click", () => copyHash(r.sha1));
    hashRow.appendChild(copyBtn);
    meta.appendChild(hashRow);
    meta.appendChild(el("div", "", fmtSize(r.size)));
    if (byName[r.path]) meta.appendChild(el("div", "badge rom-ok", byName[r.path]));
    item.appendChild(meta);
    list.appendChild(item);
  }
}

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function copyHash(hash) {
  const done = () => toast(t("toast.copied"), "ok");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(hash).then(done).catch(() => legacyCopy(hash, done));
  } else {
    legacyCopy(hash, done);
  }
}

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

async function busyRun(id, fn) {
  busy.add(id);
  render();
  try {
    await fn();
  } finally {
    busy.delete(id);
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

function launchPort(p) {
  fetch(`/api/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.manifest.id }) }).catch(() => {});
}

function doUpdateAndLaunch(p) {
  busyRun(p.manifest.id, async () => {
    toast(t("toast.installing", p.manifest.name));
    const data = await api("/api/update", { id: p.manifest.id });
    toast(`${t("toast.updated", p.manifest.name, data.info.latest)} · ${t("toast.launching", p.manifest.name)}`, "ok");
    launchPort(p);
  });
}

function doLaunch(p) {
  api("/api/status").catch(() => {});
  toast(t("toast.launching", p.manifest.name), "ok");
  launchPort(p);
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

// ── Init ──

function initPortsTools() {
  const search = $("#ports-search");
  search.addEventListener("input", () => {
    searchQuery = search.value.trim();
    renderPorts();
  });
  $$(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewMode = btn.dataset.view;
      try {
        localStorage.setItem("brisa-ports-view", viewMode);
      } catch {
        /* ignore */
      }
      $$(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewMode));
      renderPorts();
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
  initPortsTools();
  initModsModal();
  $("#btn-refresh").addEventListener("click", () => load());
  load();
  setInterval(() => {
    if (busy.size === 0) load();
  }, 8000);
}

init();