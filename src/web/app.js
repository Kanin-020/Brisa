/** Construye la tarjeta de un port (estado, ROMs, mods, acciones y progreso). */
function portCard(port) {
  const manifest = port.manifest;
  const card = el("div", `port-card${port.installed ? " installed" : ""}`);

  // Fila superior: icono + título + badges de versión/actualización
  card.appendChild(createPortHeader(port, manifest));

  // Descripción del port
  card.appendChild(el("div", "port-desc", manifest.description));

  // Estado de ROMs (un slot por requisito — ports multirom muestran base + MQ)
  for (const romSlot of port.roms) {
    card.appendChild(createRomStatusLine(romSlot));
  }

  // Mods — chips limitados a MAX_MODS_INLINE
  const modsRow = createModsRow(port);
  if (modsRow) card.appendChild(modsRow);

  // Acciones secundarias (añadir mods, abrir archivos, desinstalar)
  card.appendChild(createSecondaryActions(port));

  // Acciones principales (instalar, actualizar, jugar)
  card.appendChild(createMainActions(port));

  // Barra de progreso si hay tarea en marcha
  const progressSection = createProgressSection(port);
  if (progressSection) card.appendChild(progressSection);

  return card;
}

/** Crea la fila superior con icono, título y badges de versión/actualización. */
function createPortHeader(port, manifest) {
  const top = el("div", "port-top");
  const head = el("div", "port-head");

  // Icono del port (assets/<portId>.png)
  head.appendChild(createPortIcon(manifest));

  // Título y nombre del juego
  const titleBox = el("div");
  titleBox.appendChild(el("div", "port-title", manifest.name));
  titleBox.appendChild(el("div", "port-game", manifest.game));
  head.appendChild(titleBox);

  top.appendChild(head);

  // Badges de versión y actualización
  top.appendChild(createVersionBadges(port, manifest));

  return top;
}

/** Crea el icono del port con fallback al icono por defecto. */
function createPortIcon(manifest) {
  const icon = el("img", "port-icon");
  icon.src = "assets/" + manifest.id + ".png";
  icon.alt = manifest.name;
  icon.loading = "lazy";

  // Fallback al icono por defecto si falla la carga
  icon.addEventListener("error", function onError() {
    icon.removeEventListener("error", onError);
    if (!icon.src.includes("assets/default.png")) {
      icon.src = "assets/default.png";
    } else {
      icon.remove();
    }
  });

  // Click para abrir repositorio en GitHub
  if (manifest.repo && /^[A-Za-z0-9._/-]+$/.test(manifest.repo)) {
    const repoUrl = `https://github.com/${manifest.repo}`;
    icon.title = t("port.sourceHint", `github.com/${manifest.repo}`);
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

  return icon;
}

/** Crea badges de versión y actualización disponible. */
function createVersionBadges(port, manifest) {
  const badges = el("div");

  // Badge de versión (solo si está instalado y no hay actualización pendiente)
  if (port.installed && !port.updateAvailable) {
    badges.appendChild(el("span", "badge version", port.version));
  }

  // Badge de actualización disponible
  if (port.updateAvailable) {
    const updateBadge = el(
      "span",
      "badge update",
      `⬆ ${port.updateInfo.installed} → ${port.updateInfo.latest}`,
    );
    badges.appendChild(updateBadge);

    // Botón de changelog si hay notas
    if (port.updateInfo?.notes) {
      const notesBtn = el("button", "badge update notes-btn", "📝");
      notesBtn.title = t("changelog.button");
      notesBtn.addEventListener("click", () =>
        openChangelogModal({
          title: manifest.name,
          version: port.updateInfo.latest,
          notes: port.updateInfo.notes,
        }),
      );
      badges.appendChild(notesBtn);
    }
  }

  return badges;
}

/** Crea la línea de estado de una ROM (matching o faltante). */
function createRomStatusLine(romSlot) {
  const romLine = el("div", "rom-line");

  if (romSlot.matched) {
    romLine.appendChild(el("span", "badge rom-ok", t("port.romOk")));
    romLine.appendChild(document.createTextNode(`${romSlot.name} — ${romSlot.romName}`));

    // Badge del método de matching
    if (romSlot.matchedBy === "hash") {
      romLine.appendChild(el("span", "badge version", t("roms.byHash")));
    }
    if (romSlot.matchedBy === "gameid") {
      romLine.appendChild(el("span", "badge version", t("roms.byGameId")));
    }
  } else {
    romLine.appendChild(el("span", "badge rom-missing", t("port.romMissing")));
    const optionalLabel = romSlot.required ? "" : ` ${t("port.optional")}`;
    romLine.appendChild(document.createTextNode(romSlot.name + optionalLabel));
  }

  return romLine;
}

/** Crea la fila de chips de mods (limitada a MAX_MODS_INLINE). */
function createModsRow(port) {
  if (port.mods.length === 0) return null;

  const modsRow = el("div", "mod-row");
  const visibleMods = port.mods.length > MAX_MODS_INLINE
    ? port.mods.slice(0, MAX_MODS_INLINE)
    : port.mods;

  for (const mod of visibleMods) {
    modsRow.appendChild(createModChip(port, mod));
  }

  // Botón "Ver todos" si hay más mods de los mostrados
  if (port.mods.length > MAX_MODS_INLINE) {
    const openAllBtn = el("button", "btn ghost sm mods-open-btn", t("mod.openAll", port.mods.length));
    openAllBtn.addEventListener("click", () => openModsModal(port));
    modsRow.appendChild(openAllBtn);
  }

  return modsRow;
}

/** Crea un chip de mod con su estado de enlace y botón para alternarlo. */
function createModChip(port, modName) {
  const isLinked = port.linkedMods.includes(modName);
  const chip = el("span", "mod-chip");

  // Indicador visual de estado
  chip.appendChild(el("span", `dot ${isLinked ? "linked" : "unlinked"}`));

  // Nombre del mod
  chip.appendChild(document.createTextNode(modName));

  // Botón para alternar enlace
  const toggleBtn = el("button", "", isLinked ? "✕" : "＋");
  toggleBtn.title = isLinked ? t("mod.unlink") : t("mod.link");
  toggleBtn.addEventListener("click", () => toggleMod(port, modName, isLinked));
  chip.appendChild(toggleBtn);

  return chip;
}

/** Crea la fila de acciones secundarias (añadir mods, abrir archivos, desinstalar). */
function createSecondaryActions(port) {
  const actions = el("div", "port-actions");
  const isBusy = busyPortIds.has(port.manifest.id);

  // Botón "Añadir mods"
  const addModsBtn = el("button", "btn ghost sm mods-add-btn", t("mod.addMods"));
  addModsBtn.title = t("mod.addModsHint", port.modsRoot);
  addModsBtn.disabled = isBusy;
  addModsBtn.addEventListener("click", () => openPortModsFolder(port));
  actions.appendChild(addModsBtn);

  // Acciones adicionales solo para ports instalados
  if (port.installed) {
    // Botón "Abrir carpeta"
    const openFolderBtn = el("button", "btn ghost sm", t("port.openFolder"));
    openFolderBtn.title = t("port.openFolderHint");
    openFolderBtn.disabled = isBusy;
    openFolderBtn.addEventListener("click", () => openPortFolder(port));
    actions.appendChild(openFolderBtn);

    // Botón "Desinstalar"
    const uninstallBtn = el("button", "btn red sm", t("port.uninstall"));
    uninstallBtn.disabled = isBusy;
    uninstallBtn.addEventListener("click", () => doUninstall(port));
    actions.appendChild(uninstallBtn);
  }

  return actions;
}

/** Crea la fila de acciones principales (instalar, actualizar, jugar). */
function createMainActions(port) {
  const mainActions = el("div", "port-actions main");
  const isBusy = busyPortIds.has(port.manifest.id);

  if (port.installed) {
    // Botón "Actualizar"
    const updateBtn = el("button", "btn sm", t("port.update"));
    updateBtn.disabled = isBusy || !port.updateAvailable;
    updateBtn.addEventListener("click", () => doUpdate(port));
    mainActions.appendChild(updateBtn);

    // Botón "Actualizar y jugar" (solo si hay actualización disponible)
    if (port.updateAvailable) {
      const updateAndPlayBtn = el("button", "btn warn sm", t("port.updateAndPlay"));
      updateAndPlayBtn.disabled = isBusy;
      updateAndPlayBtn.addEventListener("click", () => doUpdateAndLaunch(port));
      mainActions.appendChild(updateAndPlayBtn);
    }

    // Botón "Jugar"
    const launchBtn = el("button", "btn green sm", t("port.launch"));
    launchBtn.disabled = isBusy;
    launchBtn.addEventListener("click", () => doLaunch(port));
    mainActions.appendChild(launchBtn);
  } else {
    // Botón "Instalar"
    const installBtn = el("button", "btn sm", port.hasRom ? t("port.install") : t("port.installNoRom"));
    installBtn.disabled = isBusy;
    installBtn.addEventListener("click", () => doInstall(port));
    mainActions.appendChild(installBtn);
  }

  return mainActions;
}

/** Crea la sección de progreso si hay una tarea en marcha. */
function createProgressSection(port) {
  if (!busyPortIds.has(port.manifest.id) && !taskForPort(port.manifest.id)) {
    return null;
  }

  const task = taskForPort(port.manifest.id);
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

  // Etapa actual y botón cancelar (solo si la tarea está en ejecución)
  if (task && task.status === "running") {
    wrap.appendChild(el("span", "progress-stage", `${task.label}: ${taskStageLabel(task.stage)}`));

    const cancelBtn = el("button", "btn red sm cancel-btn", t("task.cancel"));
    cancelBtn.title = t("task.cancel");
    cancelBtn.addEventListener("click", () => cancelTask(task.id));
    wrap.appendChild(cancelBtn);
  }

  return wrap;
}
