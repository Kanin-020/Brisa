/** @jsx h */
import { h } from 'preact';
import { t } from '../../helpers.js';

/**
 * Mod chip with linked/unlinked indicator and toggle button.
 * @param {{ name: string, linked: boolean, portId: string, onToggle?: Function }} props
 */
export function BrisaModChip({ name, linked, portId, onToggle }) {
  const icon = linked ? '✕' : '＋';
  const title = linked ? t('mod.unlink') : t('mod.link');
  const btnClass = linked ? 'unlink' : 'link';

  return (
    <span class="mod-chip">
      <span class={`dot ${linked ? 'linked' : 'unlinked'}`} />
      <span class="mod-name">{name}</span>
      <button
        class={`toggle-btn ${btnClass}`}
        title={title}
        onClick={() => onToggle?.(portId, name, linked)}
      >
        {icon}
      </button>
    </span>
  );
}
