import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { t } from '../helpers';
import { BrisaPortCard } from '../components/port-card/port-card';
import { BrisaRomCard } from '../components/rom-card/rom-card';
import { BrisaToast } from '../components/toast/toast';
import type { AppState, Port, Task, ActiveTask, I18nHelpStep } from '../types';

/** i18n helper — always reads window.__i18n at call time */
function ti(key: string, ...args: (string | number)[]): string {
  return window.__i18n?.t(key, ...args) ?? t(key, ...args);
}

type TabId = 'installed' | 'available' | 'roms' | 'help';

export function BrisaApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try {
      const saved = localStorage.getItem('brisa-active-tab');
      if (saved === 'installed' || saved === 'available' || saved === 'roms' || saved === 'help')
        return saved;
    } catch {
      /* ignore */
    }
    return 'installed';
  });
  const [toastMsg, setToastMsg] = useState('');
  const [toastKind, setToastKind] = useState<'ok' | 'warn' | 'error'>('ok');
  const [busyPorts, setBusyPorts] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dropVisible, setDropVisible] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    try {
      return (document.documentElement.dataset.theme as 'light' | 'dark') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [queryInstalled, setQueryInstalled] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    try { return (localStorage.getItem('brisa-ports-view') as 'cards' | 'list') || 'cards'; } catch { return 'cards'; }
  });
  const [romsViewMode, setRomsViewMode] = useState<'cards' | 'list'>(() => {
    try { return (localStorage.getItem('brisa-roms-view') as 'cards' | 'list') || 'cards'; } catch { return 'cards'; }
  });
  const romFileInputRef = useRef<HTMLInputElement>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogTitle, setChangelogTitle] = useState('');
  const [changelogVersion, setChangelogVersion] = useState('');
  const [changelogNotes, setChangelogNotes] = useState('');
  const [currentLocale, setCurrentLocale] = useState(() => {
    try {
      return window.__i18n?.locale() ?? 'en';
    } catch {
      return 'en';
    }
  });
  const [queryAvailable, setQueryAvailable] = useState('');
  const activeTasks = useRef<Map<string, ActiveTask>>(new Map());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── State loading ──
  const loadState = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      const data: AppState = await res.json();
      setState(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // ── Subscribe to locale changes ──
  useEffect(() => {
    if (window.__i18n?.onLocaleChange) {
      return window.__i18n!.onLocaleChange((loc: string) => {
        setCurrentLocale(loc);
        document.documentElement.lang = loc;
      });
    }
    return undefined;
  }, []);

  // ── Settings modal: Escape key + body.modal-open ──
  useEffect(() => {
    if (settingsOpen) {
      document.body.classList.add('modal-open');
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setSettingsOpen(false);
      };
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.classList.remove('modal-open');
      };
    }
    document.body.classList.remove('modal-open');
    return undefined;
  }, [settingsOpen]);

  // ── Drag & drop ROMs ──
  useEffect(() => {
    let dragDepth = 0;
    const hasFiles = (e: DragEvent): boolean =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      setDropVisible(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = () => {
      if (dragDepth <= 0) return;
      dragDepth--;
      if (dragDepth === 0) setDropVisible(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      setDropVisible(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) uploadRoms(files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // ── Toast ──
  const showToast = useCallback((msg: string, kind: 'ok' | 'warn' | 'error' = 'ok', _duration = 3200) => {
    setToastMsg('');
    requestAnimationFrame(() => {
      setToastMsg(msg);
      setToastKind(kind);
    });
  }, []);

  // ── Polling for tasks ──
  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(pollTasks, 700);
  }, []);

  const stopPolling = useCallback(() => {
    if (activeTasks.current.size === 0 && pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const pollTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const tasks: Task[] = await res.json();
      const byId = new Map(tasks.map((task) => [task.id, task]));

      for (const [taskId, entry] of activeTasks.current) {
        const info = byId.get(taskId);
        if (!info) {
          activeTasks.current.delete(taskId);
          setBusyPorts((prev) => {
            const next = new Set(prev);
            if (entry.portId) next.delete(entry.portId);
            return next;
          });
          continue;
        }
        if (info.status !== 'running') {
          activeTasks.current.delete(taskId);
          setBusyPorts((prev) => {
            const next = new Set(prev);
            if (entry.portId) next.delete(entry.portId);
            return next;
          });
          if (info.status === 'done' && entry.onDone) entry.onDone();
          await loadState();
        }
      }
      stopPolling();
    } catch {
      /* retry next tick */
    }
  }, [loadState, stopPolling]);

  // ── Track a new task ──
  const trackTask = useCallback(
    (task: Task, portId: string | null, onDone: (() => void) | null = null) => {
      activeTasks.current.set(task.id, { task, portId, onDone: onDone ?? undefined });
      if (portId) setBusyPorts((prev) => new Set([...prev, portId]));
      startPolling();
    },
    [startPolling],
  );

  // ── API actions ──
  const installPort = useCallback(
    async (port: Port) => {
      const portId = port.manifest.id;
      setBusyPorts((prev) => new Set([...prev, portId]));
      showToast(ti('toast.installing', port.manifest.name), 'ok');
      try {
        const res = await fetch('/api/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: portId }),
        });
        const data = await res.json();
        if (data.task) trackTask(data.task, portId);
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
        setBusyPorts((prev) => {
          const next = new Set(prev);
          next.delete(portId);
          return next;
        });
      }
    },
    [trackTask],
  );

  const updatePort = useCallback(
    async (port: Port, launchAfter = false) => {
      const portId = port.manifest.id;
      setBusyPorts((prev) => new Set([...prev, portId]));
      showToast(ti('toast.installing', port.manifest.name), 'ok');
      try {
        const res = await fetch('/api/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: portId }),
        });
        const data = await res.json();
        if (data.task)
          trackTask(
            data.task,
            portId,
            launchAfter ? () => doLaunchPort(port) : null,
          );
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
        setBusyPorts((prev) => {
          const next = new Set(prev);
          next.delete(portId);
          return next;
        });
      }
    },
    [trackTask],
  );

  const doLaunchPort = useCallback(async (port: Port) => {
    try {
      await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: port.manifest.id }),
      });
      showToast(ti('toast.launching', port.manifest.name), 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, []);

  const uninstallPort = useCallback(
    async (port: Port) => {
      if (!confirm(ti('confirm.uninstallMessage', port.manifest.name))) return;
      try {
        await fetch('/api/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: port.manifest.id }),
        });
        setBusyPorts((prev) => {
          const next = new Set(prev);
          next.delete(port.manifest.id);
          return next;
        });
        showToast(ti('toast.uninstalled', port.manifest.name), 'ok');
        await loadState();
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
      }
    },
    [loadState],
  );

  const toggleMod = useCallback(
    async (portId: string, mod: string, isLinked: boolean) => {
      const endpoint = isLinked ? '/api/mods/unlink' : '/api/mods/link';
      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: portId, mod }),
        });
        showToast(
          isLinked ? ti('toast.modUnlinked', mod) : ti('toast.modLinked', mod),
          'ok',
        );
        await loadState();
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
      }
    },
    [loadState],
  );

  // ── ROM upload ──
  const uploadRom = useCallback(
    (
      file: File,
      onProgress?: (pct: number) => void,
    ): Promise<{ skipped?: boolean }> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/roms/upload');
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress)
            onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(xhr.responseText || '{}');
          } catch {
            /* ignore */
          }
          if (xhr.status >= 200 && xhr.status < 300)
            resolve(data as { skipped?: boolean });
          else reject(new Error((data.error as string) || `HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('network error'));
        xhr.send(file);
      });
    },
    [],
  );

  const uploadRoms = useCallback(
    async (files: File[]) => {
      let added = 0;
      let skipped = 0;
      for (const file of files) {
        if (!file.name || file.size === 0) continue;
        try {
          const data = await uploadRom(file, (pct) =>
            showToast(`${ti('toast.uploading', file.name)} ${pct}%`),
          );
          if (data.skipped) skipped++;
          else added++;
        } catch (err) {
          showToast(
            `${file.name}: ${err instanceof Error ? err.message : String(err)}`,
            'error',
            4000,
          );
        }
      }
      if (added > 0 && skipped > 0) {
        showToast(
          `${ti('toast.romsAdded', added)} · ${ti('toast.romsSkipped', skipped)}`,
          'ok',
          5000,
        );
      } else if (added > 0) {
        showToast(ti('toast.romsAdded', added), 'ok', 4000);
      } else if (skipped > 0) {
        showToast(ti('toast.romsSkipped', skipped), 'warn', 4000);
      }
      await loadState();
    },
    [uploadRom, showToast, loadState],
  );

  const cancelTask = useCallback(async (taskId: string) => {
    try {
      await fetch('/api/tasks/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId }),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const openPortFolder = useCallback(async (port: Port) => {
    try {
      await fetch('/api/open-port-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: port.manifest.id }),
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, []);

  const openPortModsFolder = useCallback(async (port: Port) => {
    try {
      await fetch('/api/open-mods-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: port.manifest.id }),
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, []);

  // ── Tab switching with persistence ──
  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('brisa-active-tab', tab);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Settings helpers ──
  const applyTheme = useCallback((theme: 'light' | 'dark') => {
    document.documentElement.dataset.theme = theme;
    setCurrentTheme(theme);
    try {
      localStorage.setItem('brisa-theme', theme);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Self-update ──
  const doSelfUpdate = useCallback(async () => {
    if (!state?.self?.latest) return;
    showToast(ti('toast.selfUpdating', state.self.latest), 'ok', 6000);
    try {
      const res = await fetch('/api/self-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      showToast(ti('toast.selfUpdated', data.info?.latest ?? state.self.latest), 'ok', 9000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error', 6000);
    }
  }, [state]);

  // ── ROMs folder ──
  const openRomsFolder = useCallback(async () => {
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, []);

  // ── Derived data ──
  const ports = state?.ports ?? [];
  const scan = state?.scan ?? { roms: [], matches: [] };
  const installed = ports.filter((p) => p.installed);
  const available = ports.filter((p) => !p.installed);
  const totalMods = ports.reduce((sum, p) => sum + (p.mods?.length ?? 0), 0);
  const totalUpdates = ports.filter((p) => p.updateAvailable).length;

  const getTask = (portId: string): Task | null => {
    for (const [, entry] of activeTasks.current) {
      if (entry.portId === portId) return entry.task;
    }
    return null;
  };

  const filterPorts = (portsList: Port[], query: string): Port[] => {
    if (!query) return portsList;
    const q = query.toLowerCase();
    return portsList.filter((p) =>
      `${p.manifest.name} ${p.manifest.game}`.toLowerCase().includes(q),
    );
  };

  const filteredInstalled = filterPorts(installed, queryInstalled);
  const filteredAvailable = filterPorts(available, queryAvailable);

  // ── Help steps ──
  const helpSteps: I18nHelpStep[] =
    window.__i18n?.tRaw ? ((window.__i18n!.tRaw('help.steps') as I18nHelpStep[]) ?? []) : [];

  return (
    <div class="app">
      {/* Header */}
      <header class="topbar">
        <div class="brand">
          <div class="logo">
            <img
              src="/icon.png"
              alt="Brisa"
              onError={(e: h.JSX.TargetedEvent<HTMLImageElement>) => {
                (e.target as HTMLImageElement).remove();
              }}
            />
          </div>
          <div>
            <h1 id="brand-title">{ti('brand.title')}</h1>
            <span id="brand-tagline" class="tagline">
              {ti('brand.tagline')}
            </span>
          </div>
        </div>
        <div class="topbar-right">
          {state?.platform && <span class="chip">Plataforma: {state.platform.key}</span>}
          {state?.self && <span class="chip">{ti('self.version', state.self.current)}</span>}
          {state?.self?.available && state.self.supported && (
            <button
              class="btn sm update-app"
              title={ti('self.updateAvailable', state.self.latest)}
              onClick={doSelfUpdate}
            >
              ⬆ {ti('self.updateBtn', state.self.latest)}
            </button>
          )}
          {state?.self?.available && state.self.notes && (
            <button
              class="btn ghost sm"
              title={ti('changelog.button')}
              onClick={() => {
                setChangelogTitle(ti('brand.title'));
                setChangelogVersion(state.self!.latest);
                setChangelogNotes(state.self!.notes ?? '');
                setChangelogOpen(true);
              }}
            >
              📝
            </button>
          )}
          <button class="btn ghost" onClick={loadState}>
            {ti('btn.refresh')}
          </button>
          <button
            class="btn ghost sm"
            title="Game Mode"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('gamemode', '');
              window.location.href = url.toString();
            }}
          >
            🎮
          </button>
          <button
            class="btn ghost sm settings-btn"
            title={ti('settings.title')}
            onClick={() => setSettingsOpen(true)}
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Stats */}
      <div class="stats">
        <div class="stat-card">
          <div class="stat-value">{scan.roms.length}</div>
          <div class="stat-label">{ti('stat.roms')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{installed.length}</div>
          <div class="stat-label">{ti('stat.installed')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{totalMods}</div>
          <div class="stat-label">{ti('stat.mods')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{totalUpdates}</div>
          <div class="stat-label">{ti('stat.updates')}</div>
        </div>
      </div>

      {/* Tabs */}
      <div class="tabs-row">
        <nav class="tabs" role="tablist">
          {(
            [
              { id: 'installed' as const, label: ti('tabs.installed'), count: installed.length },
              { id: 'available' as const, label: ti('tabs.available'), count: available.length },
              { id: 'roms' as const, label: ti('tabs.roms'), count: scan.roms.length },
              { id: 'help' as const, label: ti('tabs.help') },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              class={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => switchTab(tab.id)}
            >
              <span class="tab-label">{tab.label}</span>
              {'count' in tab && <span class="tab-count">{tab.count}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <main>
        {(['installed', 'available'] as const).map((tabId) => {
          const isInstalled = tabId === 'installed';
          const list = isInstalled ? filteredInstalled : filteredAvailable;
          const query = isInstalled ? queryInstalled : queryAvailable;
          const setQuery = isInstalled ? setQueryInstalled : setQueryAvailable;
          const emptyMsg = isInstalled ? ti('ports.emptyInstalled') : ti('ports.emptyAvailable');

          return (
            <section
              key={tabId}
              class={`section tab-pane ${activeTab === tabId ? 'active' : ''}`}
              style={activeTab !== tabId ? 'display:none' : ''}
            >
              <div class="section-head">
                <span class="hint">
                  {isInstalled
                    ? ti('ports.hintInstalled', installed.length)
                    : ti('ports.hintAvailable', available.length)}
                </span>
                <div class="section-tools">
                  <input
                    class="search-input"
                    type="search"
                    placeholder={ti('ports.searchPlaceholder')}
                    autocomplete="off"
                    spellcheck={false}
                    value={query}
                    onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                  />
                  <div class="view-toggle">
                    <button
                      class={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                      title={ti('ports.viewCards')}
                      onClick={() => { setViewMode('cards'); try { localStorage.setItem('brisa-ports-view', 'cards'); } catch { /* ignore */ } }}
                    >▦</button>
                    <button
                      class={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                      title={ti('ports.viewList')}
                      onClick={() => { setViewMode('list'); try { localStorage.setItem('brisa-ports-view', 'list'); } catch { /* ignore */ } }}
                    >☰</button>
                  </div>
                </div>
              </div>
              <div id={`ports-grid-${tabId}`} class={`grid${viewMode === 'list' ? ' list' : ''}`}>
                {list.length === 0 ? (
                  <div class="loading">{query ? ti('ports.empty') : emptyMsg}</div>
                ) : (
                  list.map((port) => (
                    <BrisaPortCard
                      key={port.manifest.id}
                      port={port}
                      busy={busyPorts.has(port.manifest.id)}
                      task={getTask(port.manifest.id)}
                      onInstall={installPort}
                      onUpdate={(p) => updatePort(p)}
                      onUpdateAndPlay={(p) => updatePort(p, true)}
                      onLaunch={doLaunchPort}
                      onUninstall={uninstallPort}
                      onOpenFolder={openPortFolder}
                      onOpenMods={openPortModsFolder}
                      onToggleMod={toggleMod}
                      onCancelTask={cancelTask}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}

        {/* ROMs tab */}
        <section
          class={`section tab-pane ${activeTab === 'roms' ? 'active' : ''}`}
          style={activeTab !== 'roms' ? 'display:none' : ''}
        >
          <div class="section-head">
            <span class="hint">{ti('roms.hint', scan.matches.length)}</span>
            <div class="section-tools">
              <button class="btn ghost sm" onClick={() => romFileInputRef.current?.click()}>
                {ti('btn.addRoms')}
              </button>
              <button class="btn ghost sm" onClick={openRomsFolder}>
                {ti('btn.openAppFolder')}
              </button>
              <input
                ref={romFileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files && target.files.length > 0) {
                    uploadRoms(Array.from(target.files));
                    target.value = '';
                  }
                }}
              />
              <div class="view-toggle">
                <button
                  class={`view-btn ${romsViewMode === 'cards' ? 'active' : ''}`}
                  title={ti('roms.viewCards')}
                  onClick={() => { setRomsViewMode('cards'); try { localStorage.setItem('brisa-roms-view', 'cards'); } catch { /* ignore */ } }}
                >▦</button>
                <button
                  class={`view-btn ${romsViewMode === 'list' ? 'active' : ''}`}
                  title={ti('roms.viewList')}
                  onClick={() => { setRomsViewMode('list'); try { localStorage.setItem('brisa-roms-view', 'list'); } catch { /* ignore */ } }}
                >☰</button>
              </div>
            </div>
          </div>
          <div id="roms-list" class={`roms-grid${romsViewMode === 'list' ? ' list' : ''}`}>
            {scan.roms.length === 0 ? (
              <div class="loading">{ti('roms.empty')}</div>
            ) : (
              scan.roms.map((rom, i) => {
                const matchedPorts =
                  scan.matches
                    ?.filter((m) => m.rom.path === rom.path)
                    .map((m) => m.manifest.name) ?? [];
                return (
                  <BrisaRomCard
                    key={i}
                    name={rom.name}
                    sha1={rom.sha1}
                    size={rom.size}
                    path={rom.path}
                    matchedPorts={matchedPorts}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* Help tab */}
        <section
          class={`section tab-pane ${activeTab === 'help' ? 'active' : ''}`}
          style={activeTab !== 'help' ? 'display:none' : ''}
        >
          <div class="section-head">
            <h2 id="help-title">{ti('help.title')}</h2>
          </div>
          <p id="help-intro" class="help-intro">
            {ti('help.intro')}
          </p>
          <div id="help-steps" class="help-grid">
            {helpSteps.map((step, i) => (
              <div key={i} class="help-card">
                <div class="help-icon">{step.icon || '•'}</div>
                <div class="help-body">
                  <h3 class="help-card-title">{step.title}</h3>
                  <p class="help-card-text">{step.text}</p>
                </div>
              </div>
            ))}
            <div class="help-foot">
              <div class="help-legal">{ti('help.legal')}</div>
              <button class="btn green" onClick={() => switchTab('installed')}>
                {ti('help.finish')}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer class="footer">
        <span>{ti('footer.madeWith')}</span> · <span>{ti('footer.legal')}</span>
      </footer>

      {/* Settings Modal */}
      <div
        id="settings-modal"
        class={`modal-overlay ${settingsOpen ? 'show' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSettingsOpen(false);
        }}
      >
        <div class="modal modal-settings">
          <div class="modal-head">
            <h3 id="settings-modal-title">{ti('settings.title')}</h3>
            <button
              id="settings-modal-close"
              class="modal-close"
              title={ti('settings.close')}
              onClick={() => setSettingsOpen(false)}
            >
              ✕
            </button>
          </div>
          <div id="settings-modal-body" class="modal-body">
            <div class="settings-group">
              <div class="settings-label">{ti('settings.language')}</div>
              <div class="seg" id="settings-lang">
                {(window.__i18n?.availableLocales?.() ?? []).map((loc) => (
                  <button
                    key={loc}
                    class={`seg-btn ${currentLocale === loc ? 'active' : ''}`}
                    data-key="locale"
                    data-value={loc}
                    aria-pressed={currentLocale === loc}
                    onClick={() => window.__i18n?.setLocale(loc)}
                  >
                    {window.__i18n?.localeLabel?.(loc) ?? loc}
                  </button>
                ))}
              </div>
            </div>
            <div class="settings-group">
              <div class="settings-label">{ti('settings.theme')}</div>
              <div class="seg" id="settings-theme">
                <button
                  class={`seg-btn ${currentTheme === 'light' ? 'active' : ''}`}
                  data-value="light"
                  aria-pressed={currentTheme === 'light'}
                  onClick={() => applyTheme('light')}
                >
                  ☀️ {ti('settings.themeLight')}
                </button>
                <button
                  class={`seg-btn ${currentTheme === 'dark' ? 'active' : ''}`}
                  data-value="dark"
                  aria-pressed={currentTheme === 'dark'}
                  onClick={() => applyTheme('dark')}
                >
                  🌙 {ti('settings.themeDark')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Changelog Modal */}
      <div
        class={`modal-overlay ${changelogOpen ? 'show' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => { if (e.target === e.currentTarget) setChangelogOpen(false); }}
      >
        <div class="modal modal-changelog">
          <div class="modal-head">
            <h3>{ti('changelog.title')}</h3>
            <button class="modal-close" onClick={() => setChangelogOpen(false)}>✕</button>
          </div>
          <div class="modal-body changelog-body">
            <div class="changelog-head">
              <span class="changelog-app">{changelogTitle}</span>
              {changelogVersion && <span class="badge version">v{changelogVersion}</span>}
            </div>
            {changelogNotes ? (
              <div class="changelog-notes">
                {changelogNotes.split(/\r?\n/).filter(Boolean).map((line, i) => (
                  <p key={i} class="changelog-line">{line}</p>
                ))}
              </div>
            ) : (
              <p class="changelog-empty">{ti('changelog.empty')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Drop overlay */}
      <div id="drop-overlay" class={`drop-overlay ${dropVisible ? 'show' : ''}`}>
        <div class="drop-box">
          <div class="drop-icon">📥</div>
          <div class="drop-title">{ti('roms.dropTitle')}</div>
          <div class="drop-hint">{ti('roms.dropHint')}</div>
        </div>
      </div>

      {/* Toast */}
      <BrisaToast message={toastMsg} kind={toastKind} />
    </div>
  );
}
