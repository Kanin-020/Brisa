import { h } from 'preact';
import { t } from '../../helpers';
import type { ModChipProps } from '../../types';

export function BrisaModChip({ name, linked, portId, onToggle }: ModChipProps) {
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
