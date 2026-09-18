import { h } from 'preact';
import { t } from '../../helpers';
import { MaterialIcon } from '../icons';
import type { ModChipProps } from '../../types';

export function BrisaModChip({ name, linked, portId, onToggle }: ModChipProps) {
  const title = linked ? t('mod.unlink') : t('mod.link');

  return (
    <span class="mod-chip">
      <span class={`dot ${linked ? 'linked' : 'unlinked'}`} />
      <span class="mod-name">{name}</span>
      <button
        class={`toggle-btn ${linked ? 'unlink' : 'link'}`}
        title={title}
        onClick={() => onToggle?.(portId, name, linked)}
      >
        <MaterialIcon name={linked ? 'close' : 'add'} size={12} weight={600} />
      </button>
    </span>
  );
}
