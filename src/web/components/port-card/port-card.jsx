/** @jsx h */
import { h, Fragment } from 'preact';
import { t, MAX_MODS_INLINE } from '../../helpers.js';
import { BrisaModChip } from './mod-chip.jsx';
import { BrisaProgressBar } from '../progress-bar/progress-bar.jsx';

/**
 * Port card showing status, ROMs, mods, actions and progress.
 * @param {{ port: object, busy?: boolean, task?: object, onInstall?: Function, onUpdate?: Function, onUpdateAndPlay?: Function, onLaunch?: Function, onUninstall?: Function, onOpenFolder?: Function, onOpenMods?: Function, onToggleMod?: Function, onCancelTask?: Function }} props
 */
export function BrisaPortCard({
  port,
  busy = false,
  task,
  onInstall,
  onUpdate,
  onUpdateAndPlay,
  onLaunch,
  onUninstall,
  onOpenFolder,
  onOpenMods,
  onToggleMod,
  onCancelTask,
}) {
  const manifest = port.manifest;
  const isInstalled = port.installed;
  const isBusy = busy || (task && task.status === 'running');

  const repoUrl = manifest.repo && /^[A-Za-z0-9._/-]+$/.test(manifest.repo)
    ? `https://github.com/${manifest.repo}`
    : '';

  return (
    <div class={`port-card ${isInstalled ? 'installed' : ''}`}>
      {/* Header */}
      <div class="port-top">
        <div class="port-head">
          <img
            class="port-icon"
            src={`assets/${manifest.id}.png`}
            alt={manifest.name}
            onerror={(e) => { e.target.src = 'assets/default.png'; }}
            {...(repoUrl ? { title: `Source: github.com/${manifest.repo}`, onClick: () => window.open(repoUrl, '_blank', 'noopener') } : {})}
          />
          <div>
            <div class="port-title">{manifest.name}</div>
            <div class="port-game">{manifest.game}</div>
          </div>
        </div>
        <div class="badges">
          {isInstalled && !port.updateAvailable && (
            <span class="badge version">{port.version}</span>
          )}
          {port.updateAvailable && (
            <span class="badge update">⬆ {port.updateInfo.installed} → {port.updateInfo.latest}</span>
          )}
        </div>
      </div>

      {/* Description */}
      <div class="port-desc">{manifest.description}</div>

      {/* ROMs */}
      {port.roms?.map((slot, i) => (
        <div key={i} class="rom-line">
          <span class={`badge ${slot.matched ? 'rom-ok' : 'rom-missing'}`}>{slot.matched ? t('port.romOk') : t('port.romMissing')}</span>
          <span>{slot.name}{slot.required ? '' : ' ' + t('port.optional')}</span>
          {slot.matched && <span>— {slot.romName}</span>}
        </div>
      ))}

      {/* Mods */}
      {port.mods?.length > 0 && (
        <div class="mod-row">
          {port.mods.slice(0, MAX_MODS_INLINE).map((mod, i) => (
            <BrisaModChip
              key={i}
              name={mod}
              linked={port.linkedMods.includes(mod)}
              portId={manifest.id}
              onToggle={onToggleMod}
            />
          ))}
          {port.mods.length > MAX_MODS_INLINE && (
            <button class="btn ghost sm" onClick={() => onOpenMods?.(port)}>
              {t('mod.openAll', port.mods.length)}
            </button>
          )}
        </div>
      )}

      {/* Secondary actions */}
      <div class="port-actions">
        <button
          class="btn ghost sm"
          title={t('mod.addModsHint', port.modsRoot)}
          disabled={isBusy}
          onClick={() => onOpenMods?.(port)}
        >
          {t('mod.addMods')}
        </button>
        {isInstalled && (
          <>
            <button
              class="btn ghost sm"
              disabled={isBusy}
              onClick={() => onOpenFolder?.(port)}
            >
              {t('port.openFolder')}
            </button>
            <button
              class="btn red sm"
              disabled={isBusy}
              onClick={() => onUninstall?.(port)}
            >
              {t('port.uninstall')}
            </button>
          </>
        )}
      </div>

      {/* Main actions */}
      <div class="port-actions main">
        {isInstalled ? (
          <>
            <button
              class="btn sm"
              disabled={isBusy || !port.updateAvailable}
              onClick={() => onUpdate?.(port)}
            >
              {t('port.update')}
            </button>
            {port.updateAvailable && (
              <button
                class="btn warn sm"
                disabled={isBusy}
                onClick={() => onUpdateAndPlay?.(port)}
              >
                {t('port.updateAndPlay')}
              </button>
            )}
            <button
              class="btn green sm"
              disabled={isBusy}
              onClick={() => onLaunch?.(port)}
            >
              {t('port.launch')}
            </button>
          </>
        ) : (
          <button
            class="btn sm"
            disabled={isBusy}
            onClick={() => onInstall?.(port)}
          >
            {port.hasRom ? t('port.install') : t('port.installNoRom')}
          </button>
        )}
      </div>

      {/* Progress */}
      {isBusy && task && (
        <div class="progress-wrap">
          <BrisaProgressBar
            percent={task.pct || 0}
            stage={task.stage || ''}
            label={task.label || ''}
            indeterminate={!task.pct || task.pct <= 0}
            cancellable={task.status === 'running'}
            taskId={task.id}
            onCancel={onCancelTask}
          />
        </div>
      )}
    </div>
  );
}
