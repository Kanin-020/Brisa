import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { t } from '../../helpers';
import { useGamepad } from '../../hooks/useGamepad';
import type { AppState, Port, Task, ActiveTask } from '../../types';
import { BrisaToast } from '../toast/toast';

type GameTab = 'installed' | 'available';
type FocusZone = 'tabs' | 'grid';

interface GameCardProps {
  port: Port;
  isSelected: boolean;
  busy: boolean;
  task: Task | null;
  running: boolean;
  onClick: () => void;
  onDblClick: () => void;
  onAction: () => void;
  mainLabel: string;
}

function GameCard({ port, isSelected, busy, task, running, onClick, onDblClick, onAction, mainLabel }: GameCardProps) {
  return (
    <div
      class={`gm-card ${isSelected ? 'selected' : ''} ${port.installed ? 'installed' : ''} ${running ? 'running' : ''}`}
      onClick={onClick}
      onDblClick={onDblClick}
    >
      <div class="gm-card-icon-wrap">
        <img
          class="gm-card-icon"
          src={`assets/${port.manifest.id}.png`}
          alt=""
          onError={(e: h.JSX.TargetedEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).src = 'assets/default.png';
          }}
        />
      </div>
      <div class="gm-card-center">
        <div class="gm-card-name">{port.manifest.name}</div>
        <div class="gm-card-game">{port.manifest.game}</div>
        <div class="gm-card-badges">
          {port.installed && !port.updateAvailable && (
            <span class="badge version">{port.version}</span>
          )}
          {port.updateAvailable && port.updateInfo && (
            <span class="badge update">⬆ {port.updateInfo.latest}</span>
          )}
          {running && <span class="badge running-badge">▶ Running</span>}
        </div>
      </div>
      {port.roms?.map((slot, j) => (
        <div key={j} class="gm-card-rom">
          <span class={`badge ${slot.matched ? 'rom-ok' : 'rom-missing'}`}>
            {slot.matched ? '✓' : '✗'}
          </span>
          <span>{slot.name}</span>
        </div>
      ))}
      <button
        class={`gm-action-btn ${port.installed ? (port.updateAvailable ? 'warn' : 'green') : ''} ${running ? 'stop' : ''}`}
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); onAction(); }}
      >
        {mainLabel}
      </button>
      {busy && task && (
        <div class="gm-progress">
          <div class="gm-progress-bar">
            <div
              class={`gm-progress-fill ${task.pct <= 0 ? 'indeterminate' : ''}`}
              style={task.pct > 0 ? `width: ${task.pct}%` : ''}
            />
          </div>
          <span class="gm-progress-label">{task.label}: {task.stage}</span>
        </div>
      )}
    </div>
  );
}

interface GameModeProps {
  onExit: () => void;
}

export function GameMode({ onExit }: GameModeProps) {
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<GameTab>('installed');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusZone, setFocusZone] = useState<FocusZone>('grid');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'carousel'>(() => {
    try { return (localStorage.getItem('gm-layout') as 'grid' | 'carousel') || 'grid'; } catch { return 'grid'; }
  });
  const [toastMsg, setToastMsg] = useState('');
  const [toastKind, setToastKind] = useState<'ok' | 'warn' | 'error'>('ok');
  const [busyPorts, setBusyPorts] = useState<Set<string>>(new Set());
  const [runningPorts, setRunningPorts] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState(0);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    try { return (document.documentElement.dataset.theme as 'light' | 'dark') || 'dark'; } catch { return 'dark'; }
  });
  const activeTasks = useRef<Map<string, ActiveTask>>(new Map());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef(2);

  const showToast = useCallback((msg: string, kind: 'ok' | 'warn' | 'error' = 'ok') => {
    setToastMsg('');
    requestAnimationFrame(() => { setToastMsg(msg); setToastKind(kind); });
  }, []);

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

  useEffect(() => { loadState(); }, [loadState]);

  // ── Settings: Escape key closes modal ──
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSettingsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  // ── Polling ──
  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch('/api/tasks');
        const tasks: Task[] = await res.json();
        const byId = new Map(tasks.map((t) => [t.id, t]));
        for (const [taskId, entry] of activeTasks.current) {
          const info = byId.get(taskId);
          if (!info) {
            activeTasks.current.delete(taskId);
            setBusyPorts((prev) => { const n = new Set(prev); if (entry.portId) n.delete(entry.portId); return n; });
            continue;
          }
          if (info.status !== 'running') {
            activeTasks.current.delete(taskId);
            setBusyPorts((prev) => { const n = new Set(prev); if (entry.portId) n.delete(entry.portId); return n; });
            if (info.status === 'done' && entry.onDone) entry.onDone();
            await loadState();
          }
        }
        if (activeTasks.current.size === 0 && pollTimer.current) {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
        }
      } catch { /* retry */ }
    }, 700);
  }, [loadState]);

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  // ── Derived data ──
  const ports = state?.ports ?? [];
  const installed = ports.filter((p) => p.installed);
  const available = ports.filter((p) => !p.installed);
  const currentList = activeTab === 'installed' ? installed : available;
  const selected = currentList[selectedIndex] ?? null;

  const getTask = (portId: string): Task | null => {
    for (const [, entry] of activeTasks.current) {
      if (entry.portId === portId) return entry.task;
    }
    return null;
  };

  // ── Dynamic grid columns (measured from actual rendered layout) ──
  useEffect(() => {
    const updateColumns = () => {
      if (layoutMode !== 'grid' || !gridRef.current) return;
      const children = gridRef.current.children;
      if (children.length < 2) { columnsRef.current = Math.max(1, children.length); return; }
      const firstTop = (children[0] as HTMLElement).getBoundingClientRect().top;
      let cols = 1;
      for (let i = 1; i < children.length; i++) {
        if (Math.abs((children[i] as HTMLElement).getBoundingClientRect().top - firstTop) > 5) break;
        cols++;
      }
      columnsRef.current = cols;
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    // Also re-measure after layout settles
    const raf = requestAnimationFrame(updateColumns);
    return () => { window.removeEventListener('resize', updateColumns); cancelAnimationFrame(raf); };
  }, [layoutMode, currentList.length]);

  // ── Toggle layout helper ──
  const toggleLayout = useCallback(() => {
    setLayoutMode((prev) => {
      const next = prev === 'grid' ? 'carousel' : 'grid';
      try { localStorage.setItem('gm-layout', next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ── Theme toggle helper ──
  const toggleTheme = useCallback(() => {
    setCurrentTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('brisa-theme', next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ── Settings helpers (named to avoid JSX parser issues with complex inline handlers) ──
  const applyLayout = (mode: 'grid' | 'carousel') => {
    setLayoutMode(mode);
    try { localStorage.setItem('gm-layout', mode); } catch { /* ignore */ }
  };
  const applyTheme = (theme: 'light' | 'dark') => {
    setCurrentTheme(theme);
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('brisa-theme', theme); } catch { /* ignore */ }
  };

  // ── Actions ──
  const doAction = useCallback(async (port: Port, action: 'install' | 'launch' | 'update' | 'stop') => {
    const portId = port.manifest.id;
    if (action === 'stop') {
      try {
        await fetch('/api/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: portId }),
        });
        setRunningPorts((prev) => { const n = new Set(prev); n.delete(portId); return n; });
        showToast(`⏹ Stopped ${port.manifest.name}`, 'ok');
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error');
      }
      return;
    }
    setBusyPorts((prev) => new Set([...prev, portId]));
    try {
      const endpoint = action === 'launch' ? '/api/launch' : `/api/${action}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: portId }),
      });
      const data = await res.json();
      if (data.task) {
        activeTasks.current.set(data.task.id, { task: data.task, portId });
        startPolling();
      }
      if (action === 'launch' && data.pid) {
        setRunningPorts((prev) => new Set([...prev, portId]));
      }
      showToast(`${action === 'launch' ? '▶ Launching' : action === 'install' ? '⬇ Installing' : '⬆ Updating'} ${port.manifest.name}...`, 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
      setBusyPorts((prev) => { const n = new Set(prev); n.delete(portId); return n; });
    }
  }, [startPolling]);

  // ── Tab switching helper ──
  const switchTab = useCallback((tab: GameTab) => {
    setActiveTab(tab);
    setSelectedIndex(0);
    setFocusZone('grid');
  }, []);

  // ── Carousel center offset ──
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const [carouselOffset, setCarouselOffset] = useState(0);

  useEffect(() => {
    if (layoutMode === 'carousel' && carouselTrackRef.current) {
      const track = carouselTrackRef.current;
      const firstCard = track.querySelector('.gm-card') as HTMLElement | null;
      if (!firstCard) return;
      const cardW = firstCard.offsetWidth;
      const gap = 16;
      const stride = cardW + gap;
      const offset = -(selectedIndex * stride);
      const n = currentList.length;
      const maxOffset = 0;
      const minOffset = -((n - 1) * stride);
      setCarouselOffset(Math.min(maxOffset, Math.max(minOffset, offset)));
    }
  }, [selectedIndex, layoutMode, currentList.length]);

  // ── Scroll selected into view (grid only) ──
  useEffect(() => {
    if (layoutMode === 'grid' && focusZone === 'grid') {
      const el = gridRef.current?.children[selectedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex, activeTab, layoutMode, focusZone]);

  // ── Derived i18n ──
  const availableLocales = window.__i18n?.availableLocales?.() ?? [];
  const currentLocale = window.__i18n?.locale?.() ?? 'en';

  // ── Settings navigation helpers ──
  // Groups: [Layout(2), Theme(2), Langs(N), Exit(1)]
  const settingsGroups = [
    { start: 0, count: 2 },                                     // Layout
    { start: 2, count: 2 },                                     // Theme
    { start: 4, count: availableLocales.length },                // Languages
    { start: 4 + availableLocales.length, count: 1 },            // Exit
  ];
  const settingsOptionCount = settingsGroups.reduce((s, g) => s + g.count, 0);

  const settingsGroupOf = (idx: number): number => {
    for (let g = 0; g < settingsGroups.length; g++) {
      if (idx >= settingsGroups[g].start && idx < settingsGroups[g].start + settingsGroups[g].count) return g;
    }
    return settingsGroups.length - 1;
  };

  // Move left/right within the same group (wrap)
  const settingsMoveLeft = (idx: number): number => {
    const g = settingsGroups[settingsGroupOf(idx)];
    return idx > g.start ? idx - 1 : g.start + g.count - 1;
  };
  const settingsMoveRight = (idx: number): number => {
    const g = settingsGroups[settingsGroupOf(idx)];
    return idx < g.start + g.count - 1 ? idx + 1 : g.start;
  };
  // Move up/down to previous/next group (pick first item)
  const settingsMoveUp = (idx: number): number => {
    const gi = settingsGroupOf(idx);
    return gi > 0 ? settingsGroups[gi - 1].start : settingsGroups[settingsGroups.length - 1].start;
  };
  const settingsMoveDown = (idx: number): number => {
    const gi = settingsGroupOf(idx);
    return gi < settingsGroups.length - 1 ? settingsGroups[gi + 1].start : settingsGroups[0].start;
  };

  const applySettingsOption = useCallback((idx: number) => {
    if (idx === 0) applyLayout('grid');
    else if (idx === 1) applyLayout('carousel');
    else if (idx === 2) applyTheme('light');
    else if (idx === 3) applyTheme('dark');
    else if (idx >= 4 && idx < 4 + availableLocales.length) {
      const loc = availableLocales[idx - 4];
      if (loc) window.__i18n?.setLocale(loc);
    } else if (idx === 4 + availableLocales.length) {
      setSettingsOpen(false);
      onExit();
    }
  }, [availableLocales, onExit]);

  // ── Gamepad navigation ──
  const gamepad = useGamepad({
    onUp: () => {
      if (settingsOpen) {
        setSettingsFocus((i) => settingsMoveUp(i));
        return;
      }
      if (focusZone === 'tabs') return;
      if (layoutMode === 'carousel') {
        setSelectedIndex((i) => {
          if (i > 0) return i - 1;
          setFocusZone('tabs');
          return 0;
        });
        return;
      }
      setSelectedIndex((i) => {
        const cols = columnsRef.current;
        const target = i - cols;
        if (target >= 0) return target;
        setFocusZone('tabs');
        return 0;
      });
    },
    onDown: () => {
      if (settingsOpen) {
        setSettingsFocus((i) => settingsMoveDown(i));
        return;
      }
      if (focusZone === 'tabs') {
        setFocusZone('grid');
        setSelectedIndex(0);
        return;
      }
      if (layoutMode === 'carousel') {
        setSelectedIndex((i) => Math.min(currentList.length - 1, i + 1));
        return;
      }
      setSelectedIndex((i) => Math.min(currentList.length - 1, i + columnsRef.current));
    },
    onLeft: () => {
      if (settingsOpen) {
        setSettingsFocus((i) => settingsMoveLeft(i));
        return;
      }
      if (focusZone === 'tabs') {
        switchTab('installed');
        return;
      }
      if (layoutMode === 'carousel') {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      setSelectedIndex((i) => {
        const cols = columnsRef.current;
        const col = i % cols;
        if (col > 0) return i - 1;
        // First in row → go to last of previous row
        const prev = i - col - 1;
        if (prev >= 0) return prev;
        return i;
      });
    },
    onRight: () => {
      if (settingsOpen) {
        setSettingsFocus((i) => settingsMoveRight(i));
        return;
      }
      if (focusZone === 'tabs') {
        switchTab('available');
        return;
      }
      if (layoutMode === 'carousel') {
        setSelectedIndex((i) => Math.min(currentList.length - 1, i + 1));
        return;
      }
      setSelectedIndex((i) => {
        const cols = columnsRef.current;
        const col = i % cols;
        if (col < cols - 1 && i + 1 < currentList.length) return i + 1;
        // Last in row → go to first of next row
        const next = i + (cols - col);
        if (next < currentList.length) return next;
        return i;
      });
    },
    onConfirm: () => {
      if (settingsOpen) {
        applySettingsOption(settingsFocus);
        return;
      }
      if (focusZone === 'tabs') {
        setFocusZone('grid');
        setSelectedIndex(0);
        return;
      }
      if (!selected) return;
      if (runningPorts.has(selected.manifest.id)) {
        doAction(selected, 'stop');
      } else if (selected.installed) {
        doAction(selected, selected.updateAvailable ? 'update' : 'launch');
      } else {
        doAction(selected, 'install');
      }
    },
    onCancel: () => {
      if (settingsOpen) { setSettingsOpen(false); return; }
      // B button in grid: no-op
    },
    onMenu: () => {
      if (settingsOpen) { setSettingsOpen(false); return; }
      switchTab(activeTab === 'installed' ? 'available' : 'installed');
    },
    onTabNext: () => {
      if (settingsOpen) return;
      switchTab('available');
    },
    onTabPrev: () => {
      if (settingsOpen) return;
      switchTab('installed');
    },
    onExit: () => {
      if (settingsOpen) { setSettingsOpen(false); return; }
      onExit();
    },
    onToggleLayout: () => {
      if (settingsOpen) return;
      toggleLayout();
    },
    onOpenSettings: () => {
      setSettingsOpen((prev) => {
        if (!prev) setSettingsFocus(0);
        return !prev;
      });
    },
  });

  // ── Keyboard navigation (for testing without gamepad) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen) {
        if (e.key === 'Escape') setSettingsOpen(false);
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
          if (focusZone === 'tabs') { switchTab('installed'); break; }
          if (layoutMode === 'carousel') { setSelectedIndex((i) => Math.max(0, i - 1)); break; }
          setSelectedIndex((i) => { const cols = columnsRef.current; const col = i % cols; if (col > 0) return i - 1; const prev = i - cols - (col - 1) - 1; return prev >= 0 ? prev : i; });
          break;
        case 'ArrowRight':
          if (focusZone === 'tabs') { switchTab('available'); break; }
          if (layoutMode === 'carousel') { setSelectedIndex((i) => Math.min(currentList.length - 1, i + 1)); break; }
          setSelectedIndex((i) => { const cols = columnsRef.current; const col = i % cols; if (col < cols - 1 && i + 1 < currentList.length) return i + 1; const next = i + (cols - col); return next < currentList.length ? next : i; });
          break;
        case 'ArrowUp':
          if (focusZone === 'tabs') break;
          if (layoutMode === 'carousel') {
            setSelectedIndex((i) => { if (i > 0) return i - 1; setFocusZone('tabs'); return 0; });
          } else {
            setSelectedIndex((i) => { const target = i - columnsRef.current; if (target >= 0) return target; setFocusZone('tabs'); return 0; });
          }
          break;
        case 'ArrowDown':
          if (focusZone === 'tabs') { setFocusZone('grid'); setSelectedIndex(0); break; }
          if (layoutMode === 'carousel') { setSelectedIndex((i) => Math.min(currentList.length - 1, i + 1)); break; }
          setSelectedIndex((i) => Math.min(currentList.length - 1, i + columnsRef.current));
          break;
        case 'Enter':
          if (focusZone === 'tabs') { setFocusZone('grid'); setSelectedIndex(0); break; }
          if (selected) {
            if (runningPorts.has(selected.manifest.id)) doAction(selected, 'stop');
            else if (selected.installed) doAction(selected, selected.updateAvailable ? 'update' : 'launch');
            else doAction(selected, 'install');
          }
          break;
        case 'Escape': onExit(); break;
        case 'Tab':
          e.preventDefault();
          switchTab(activeTab === 'installed' ? 'available' : 'installed');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentList.length, selected, doAction, onExit, focusZone, activeTab, layoutMode, switchTab, runningPorts, settingsOpen]);

  const isBusy = (portId: string) => busyPorts.has(portId);
  const isRunning = (portId: string) => runningPorts.has(portId);
  const getMainLabel = (port: Port) => {
    if (isBusy(port.manifest.id)) return '⏳ ...';
    if (isRunning(port.manifest.id)) return `⏹ ${t('port.stop') ?? 'Stop'}`;
    if (port.installed) return port.updateAvailable ? `⬆ ${t('port.update')}` : `▶ ${t('port.launch')}`;
    return port.hasRom ? `⬇ ${t('port.install')}` : `⬇ ${t('port.installNoRom')}`;
  };

  return (
    <div class="game-mode">
      {/* Header */}
      <header class="gm-header">
        <div class="gm-brand">
          <img src="/icon.png" alt="" class="gm-logo" />
          <h1 class="gm-title">Brisa</h1>
        </div>
        <div class={`gm-tabs ${focusZone === 'tabs' ? 'gm-tabs-focused' : ''}`}>
          <button
            class={`gm-tab ${activeTab === 'installed' ? 'active' : ''}`}
            onClick={() => { switchTab('installed'); setFocusZone('grid'); }}
          >
            {t('tabs.installed')} <span class="gm-count">{installed.length}</span>
          </button>
          <button
            class={`gm-tab ${activeTab === 'available' ? 'active' : ''}`}
            onClick={() => { switchTab('available'); setFocusZone('grid'); }}
          >
            {t('tabs.available')} <span class="gm-count">{available.length}</span>
          </button>
        </div>
        <button
          class="gm-layout-btn"
          title={layoutMode === 'grid' ? 'Carousel' : 'Grid'}
          onClick={toggleLayout}
        >
          {layoutMode === 'grid' ? '☰' : '▦'}
        </button>
        <button class="gm-settings-btn" onClick={() => setSettingsOpen(true)}>⚙️</button>
        <button class="gm-exit-btn" onClick={onExit}>✕ {t('settings.close')}</button>
      </header>

      {/* Gamepad hint */}
      <div class="gm-hint">
        {gamepad.current.connected
          ? `🎮 Select=Salir · Start=Config · X=Layout · R1/R2=Pestaña · A=Acción`
          : '⌨ ↑↓←→ Enter=Acción · Tab=Pestaña · Esc=Salir'}
      </div>

      {/* Grid / Carousel */}
      {layoutMode === 'carousel' ? (
        <div class="gm-carousel-viewport">
          <div
            class="gm-carousel-track"
            ref={carouselTrackRef}
            style={`transform: translateX(${carouselOffset}px)`}
          >
            {currentList.length === 0 ? (
              <div class="gm-empty">
                {activeTab === 'installed' ? t('ports.emptyInstalled') : t('ports.emptyAvailable')}
              </div>
            ) : (
              currentList.map((port, i) => (
                <GameCard
                  key={port.manifest.id}
                  port={port}
                  isSelected={i === selectedIndex}
                  busy={isBusy(port.manifest.id)}
                  running={isRunning(port.manifest.id)}
                  task={getTask(port.manifest.id)}
                  onClick={() => { setSelectedIndex(i); setFocusZone('grid'); }}
                  onDblClick={() => {
                    if (isRunning(port.manifest.id)) doAction(port, 'stop');
                    else if (port.installed) doAction(port, port.updateAvailable ? 'update' : 'launch');
                    else doAction(port, 'install');
                  }}
                  onAction={() => {
                    if (isRunning(port.manifest.id)) doAction(port, 'stop');
                    else if (port.installed) doAction(port, port.updateAvailable ? 'update' : 'launch');
                    else doAction(port, 'install');
                  }}
                  mainLabel={getMainLabel(port)}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <div class="gm-grid" ref={gridRef}>
          {currentList.length === 0 ? (
            <div class="gm-empty">
              {activeTab === 'installed' ? t('ports.emptyInstalled') : t('ports.emptyAvailable')}
            </div>
          ) : (
            currentList.map((port, i) => (
              <GameCard
                key={port.manifest.id}
                port={port}
                isSelected={i === selectedIndex && focusZone === 'grid'}
                busy={isBusy(port.manifest.id)}
                running={isRunning(port.manifest.id)}
                task={getTask(port.manifest.id)}
                onClick={() => { setSelectedIndex(i); setFocusZone('grid'); }}
                onDblClick={() => {
                  if (isRunning(port.manifest.id)) doAction(port, 'stop');
                  else if (port.installed) doAction(port, port.updateAvailable ? 'update' : 'launch');
                  else doAction(port, 'install');
                }}
                onAction={() => {
                  if (isRunning(port.manifest.id)) doAction(port, 'stop');
                  else if (port.installed) doAction(port, port.updateAvailable ? 'update' : 'launch');
                  else doAction(port, 'install');
                }}
                mainLabel={getMainLabel(port)}
              />
            ))
          )}
        </div>
      )}

      {/* Footer */}
      <footer class="gm-footer">
        <span>{t('footer.madeWith')}</span>
      </footer>

      {/* Settings Modal */}
      {settingsOpen && (
        <div class="gm-settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div class="gm-settings-modal" onClick={(e) => e.stopPropagation()}>
            <div class="gm-settings-head">
              <h3>⚙️ {t('settings.title')}</h3>
              <button class="gm-settings-close" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <div class="gm-settings-body">
              {/* Layout */}
              <div class="gm-settings-group">
                <div class="gm-settings-label">Layout</div>
                <div class="gm-settings-row">
                  <button class={`gm-settings-btn-opt ${layoutMode === 'grid' ? 'active' : ''} ${settingsFocus === 0 ? 'gm-focused' : ''}`} onClick={() => applyLayout('grid')}>{'▦'} Grid</button>
                  <button class={`gm-settings-btn-opt ${layoutMode === 'carousel' ? 'active' : ''} ${settingsFocus === 1 ? 'gm-focused' : ''}`} onClick={() => applyLayout('carousel')}>{'☰'} Carousel</button>
                </div>
              </div>
              {/* Theme */}
              <div class="gm-settings-group">
                <div class="gm-settings-label">{t('settings.theme')}</div>
                <div class="gm-settings-row">
                  <button class={`gm-settings-btn-opt ${currentTheme === 'light' ? 'active' : ''} ${settingsFocus === 2 ? 'gm-focused' : ''}`} onClick={() => applyTheme('light')}>{'☀️'} {t('settings.themeLight')}</button>
                  <button class={`gm-settings-btn-opt ${currentTheme === 'dark' ? 'active' : ''} ${settingsFocus === 3 ? 'gm-focused' : ''}`} onClick={() => applyTheme('dark')}>{'🌙'} {t('settings.themeDark')}</button>
                </div>
              </div>
              {/* Language */}
              {availableLocales.length > 0 && (
                <div class="gm-settings-group">
                  <div class="gm-settings-label">{t('settings.language')}</div>
                  <div class="gm-settings-row gm-settings-locales">
                    {availableLocales.map((loc, li) => {
                      const locIdx = 4 + li;
                      return (
                        <button
                          key={loc}
                          class={`gm-settings-btn-opt ${currentLocale === loc ? 'active' : ''} ${settingsFocus === locIdx ? 'gm-focused' : ''}`}
                          onClick={() => window.__i18n?.setLocale(loc)}
                        >
                          {window.__i18n?.localeLabel?.(loc) ?? loc}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Exit */}
              <div class="gm-settings-group">
                <button class={`gm-settings-exit-btn ${settingsFocus === settingsOptionCount - 1 ? 'gm-focused' : ''}`} onClick={onExit}>
                  ✕ {t('settings.close')} Game Mode
                </button>
              </div>
            </div>
            <div class="gm-settings-foot">
              Select o Esc para cerrar
            </div>
          </div>
        </div>
      )}

      <BrisaToast message={toastMsg} kind={toastKind} />
    </div>
  );
}
