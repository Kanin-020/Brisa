/* Port Hub GUI */
let state = null;
let busy = new Set();

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function toast(msg, kind = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3200);
}

async function api(path, body) {
  const opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function load() {
  try {
    state = await api("/api/status");
    render();
  } catch (e) {
    toast(e.message, "error");
  }
}

function render() {
  if (!state) return;
  const { ports, scan, platform } = state;

  $("#platform-chip").textContent = `Plataforma: ${platform.key}`;
  $("#stat-roms").textContent = scan.roms.length;
  $("#stat-installed").textContent = ports.filter((p) => p.installed).length;
  $("#stat-mods").textContent = ports.reduce((a, p) => a + p.mods.length, 0);
  $("#stat-updates").textContent = ports.filter((p) => p.updateAvailable).length;
  $("#cfg-roms-dir").textContent = `ROMs: ${state.cfg.romsDir}`;
  $("#ports-hint").textContent = `${ports.length} ports en el registro`;
  $("#roms-hint").textContent = `${scan.matches.length} coincidencias ROM↔requisito`;

  renderPorts(ports);
  renderRoms(scan);
}

function renderPorts(ports) {
  const grid = $("#ports-grid");
  grid.innerHTML = "";
  for (const p of ports) {
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
      romLine.appendChild(el("span", "badge rom-ok", "ROM ✓"));
      romLine.appendChild(document.createTextNode(`${s.name} — ${s.romName}`));
      if (s.matchedBy === "hash") romLine.appendChild(el("span", "badge version", "por hash"));
      if (s.matchedBy === "gameid") romLine.appendChild(el("span", "badge version", "por game ID"));
    } else {
      romLine.appendChild(el("span", "badge rom-missing", "ROM ✗"));
      romLine.appendChild(document.createTextNode(s.name + (s.required ? "" : " (opcional)")));
    }
    card.appendChild(romLine);
  }

  // Mods
  if (p.mods.length > 0) {
    const row = el("div", "mod-row");
    for (const mod of p.mods) {
      const linked = p.linkedMods.includes(mod);
      const chip = el("span", "mod-chip");
      chip.appendChild(el("span", `dot ${linked ? "linked" : "unlinked"}`));
      chip.appendChild(document.createTextNode(mod));
      const btn = el("button", "", linked ? "✕" : "＋");
      btn.title = linked ? "Desenlazar" : "Enlazar";
      btn.addEventListener("click", () => toggleMod(p, mod, linked));
      chip.appendChild(btn);
      row.appendChild(chip);
    }
    card.appendChild(row);
  }

  // Actions
  const actions = el("div", "port-actions");
  if (p.installed) {
    const upd = el("button", "btn sm", "Actualizar");
    upd.disabled = !p.updateAvailable;
    upd.addEventListener("click", () => doUpdate(p));
    actions.appendChild(upd);
  }
  actions.appendChild(el("div", "spacer"));
  if (p.installed) {
    const un = el("button", "btn red sm", "Desinstalar");
    un.addEventListener("click", () => doUninstall(p));
    actions.appendChild(un);
    const launch = el("button", "btn green sm", "▶ Jugar");
    launch.addEventListener("click", () => doLaunch(p));
    actions.appendChild(launch);
  } else {
    const inst = el("button", "btn sm", p.hasRom ? "Instalar" : "Instalar (sin ROM)");
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

function renderRoms(scan) {
  const list = $("#roms-list");
  list.innerHTML = "";
  if (scan.roms.length === 0) {
    list.appendChild(el("div", "loading", "No hay ROMs todavía. Cópiálos a la carpeta de ROMs."));
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
    meta.appendChild(el("div", "rom-hash", `sha1 ${r.sha1.slice(0, 16)}…`));
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
    toast(`Instalando ${p.manifest.name}…`);
    const data = await api("/api/install", { id: p.manifest.id });
    toast(`✓ ${p.manifest.name} v${data.state.version} instalado`, "ok");
  });
}

function doUninstall(p) {
  busyRun(p.manifest.id, async () => {
    await api("/api/uninstall", { id: p.manifest.id });
    toast(`✓ ${p.manifest.name} desinstalado`, "ok");
  });
}

function doUpdate(p) {
  busyRun(p.manifest.id, async () => {
    toast(`Actualizando ${p.manifest.name}…`);
    const data = await api("/api/update", { id: p.manifest.id });
    toast(`✓ ${p.manifest.name} → ${data.info.latest}`, "ok");
  });
}

function doLaunch(p) {
  api("/api/status").catch(() => {});
  toast(`Lanzando ${p.manifest.name}…`, "ok");
  // The server launches via CLI; here we just notify. Launch endpoint:
  fetch(`/api/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.manifest.id }) }).catch(() => {});
}

function toggleMod(p, mod, linked) {
  busyRun(p.manifest.id, async () => {
    await api(linked ? "/api/mods/unlink" : "/api/mods/link", { id: p.manifest.id, mod });
    toast(linked ? `Mod "${mod}" desenlazado` : `Mod "${mod}" enlazado`, "ok");
  });
}

$("#btn-refresh").addEventListener("click", () => load());
load();
setInterval(() => {
  if (busy.size === 0) load();
}, 8000);
