import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { t } from '../../helpers';
import { useGamepad } from '../../hooks/useGamepad';
import type { AppState, Port, Task, ActiveTask } from '../../types';
import { BrisaToast } from '../toast/toast';

type GameTab = 'installed' | 'available';

interface GameCardProps {
  port: Port;
  isSelected: boolean;
  busy: boolean;
  task: Task | null;
  onClick: () => void;
  onDblClick: () => void;
  onAction: () => void;
  mainLabel: string;
}

function GameCard({ port, isSelected, busy, task, onClick, onDblClick, onAction, mainLabel }: GameCardProps) {
  return (
    <div
      class={`gm-card ${isSelected ? 'selected' : ''} ${port.installed ? 'installed' : ''}`}
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
        class={`gm-action-btn ${port.installed ? (port.updateAvailable ? 'warn' : 'green') : ''}`}
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
  const [layoutMode, setLayoutMode] = useState<'grid' | 'carousel'>(() => {
    try { return (localStorage.getItem('gm-layout') as 'grid' | 'carousel') || 'grid'; } catch { return 'grid'; }
  });
  const [toastMsg, setToastMsg] = useState('');
  const [toastKind, setToastKind] = useState<'ok' | 'warn' | 'error'>('ok');
  const [busyPorts, setBusyPorts] = useState<Set<string>>(new Set());
  const activeTasks = useRef<Map<string, ActiveTask>>(new Map());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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

  // ── Actions ──
  const doAction = useCallback(async (port: Port, action: 'install' | 'launch' | 'update') => {
    const portId = port.manifest.id;
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
      showToast(`${action === 'launch' ? '▶ Launching' : action === 'install' ? '⬇ Installing' : '⬆ Updating'} ${port.manifest.name}...`, 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
      setBusyPorts((prev) => { const n = new Set(prev); n.delete(portId); return n; });
    }
  }, [startPolling]);

  // ── Carousel center offset ──
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const [carouselOffset, setCarouselOffset] = useState(0);

  useEffect(() => {
    if (layoutMode === 'carousel' && carouselTrackRef.current) {
      const track = carouselTrackRef.current;
      // ::before and ::after handle edge padding, so we just shift by card stride
      const firstCard = track.querySelector('.gm-card') as HTMLElement | null;
      if (!firstCard) return;
      const cardW = firstCard.offsetWidth;
      const gap = 16; // must match CSS gap
      const stride = cardW + gap;
      // At index 0, offset=0 centers the first card (via ::before padding)
      const offset = -(selectedIndex * stride);
      // Clamp: never go positive, and don't scroll past last card
      const n = currentList.length;
      const maxOffset = 0;
      const minOffset = -((n - 1) * stride);
      setCarouselOffset(Math.min(maxOffset, Math.max(minOffset, offset)));
    }
  }, [selectedIndex, layoutMode, currentList.length]);

  // ── Scroll selected into view (grid only) ──
  useEffect(() => {
    if (layoutMode === 'grid') {
      const el = gridRef.current?.children[selectedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex, activeTab, layoutMode]);

  // ── Gamepad navigation ──
  const gamepad = useGamepad({
    onUp: () => setSelectedIndex((i) => Math.max(0, i - 2)),
    onDown: () => setSelectedIndex((i) => Math.min(currentList.length - 1, i + 2)),
    onLeft: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    onRight: () => setSelectedIndex((i) => Math.min(currentList.length - 1, i + 1)),
    onConfirm: () => {
      if (!selected) return;
      if (selected.installed) {
        doAction(selected, selected.updateAvailable ? 'update' : 'launch');
      } else {
        doAction(selected, 'install');
      }
    },
    onCancel: () => onExit(),
    onMenu: () => {
      setActiveTab((prev) => {
        const next = prev === 'installed' ? 'available' : 'installed';
        setSelectedIndex(0);
        return next;
      });
    },
  });

  // ── Keyboard navigation (for testing without gamepad) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft': setSelectedIndex((i) => Math.max(0, i - 1)); break;
        case 'ArrowRight': setSelectedIndex((i) => Math.min(currentList.length - 1, i + 1)); break;
        case 'ArrowUp': setSelectedIndex((i) => Math.max(0, i - (layoutMode === 'carousel' ? 1 : 3))); break;
        case 'ArrowDown': setSelectedIndex((i) => Math.min(currentList.length - 1, i + (layoutMode === 'carousel' ? 1 : 3))); break;
        case 'Enter':
          if (selected) {
            if (selected.installed) doAction(selected, selected.updateAvailable ? 'update' : 'launch');
            else doAction(selected, 'install');
          }
          break;
        case 'Escape': onExit(); break;
        case 'Tab':
          e.preventDefault();
          setActiveTab((prev) => { setSelectedIndex(0); return prev === 'installed' ? 'available' : 'installed'; });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentList.length, selected, doAction, onExit]);

  const isBusy = (portId: string) => busyPorts.has(portId);
  const getMainLabel = (port: Port) => {
    if (isBusy(port.manifest.id)) return '⏳ ...';
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
        <div class="gm-tabs">
          <button
            class={`gm-tab ${activeTab === 'installed' ? 'active' : ''}`}
            onClick={() => { setActiveTab('installed'); setSelectedIndex(0); }}
          >
            {t('tabs.installed')} <span class="gm-count">{installed.length}</span>
          </button>
          <button
            class={`gm-tab ${activeTab === 'available' ? 'active' : ''}`}
            onClick={() => { setActiveTab('available'); setSelectedIndex(0); }}
          >
            {t('tabs.available')} <span class="gm-count">{available.length}</span>
          </button>
        </div>
        <button
          class="gm-layout-btn"
          title={layoutMode === 'grid' ? 'Carousel' : 'Grid'}
          onClick={() => {
            const next = layoutMode === 'grid' ? 'carousel' : 'grid';
            setLayoutMode(next);
            try { localStorage.setItem('gm-layout', next); } catch { /* ignore */ }
          }}
        >
          {layoutMode === 'grid' ? '☰' : '▦'}
        </button>
        <button class="gm-exit-btn" onClick={onExit}>✕ {t('settings.close')}</button>
      </header>

      {/* Gamepad hint */}
      <div class="gm-hint">
        {gamepad.current.connected
          ? `🎮 ${gamepad.current.id}`
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
                  task={getTask(port.manifest.id)}
                  onClick={() => setSelectedIndex(i)}
                  onDblClick={() => {
                    if (port.installed) doAction(port, port.updateAvailable ? 'update' : 'launch');
                    else doAction(port, 'install');
                  }}
                  onAction={() => {
                    if (port.installed) doAction(port, port.updateAvailable ? 'update' : 'launch');
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
                isSelected={i === selectedIndex}
                busy={isBusy(port.manifest.id)}
                task={getTask(port.manifest.id)}
                onClick={() => setSelectedIndex(i)}
                onDblClick={() => {
                  if (port.installed) doAction(port, port.updateAvailable ? 'update' : 'launch');
                  else doAction(port, 'install');
                }}
                onAction={() => {
                  if (port.installed) doAction(port, port.updateAvailable ? 'update' : 'launch');
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

      <BrisaToast message={toastMsg} kind={toastKind} />
    </div>
  );
}
