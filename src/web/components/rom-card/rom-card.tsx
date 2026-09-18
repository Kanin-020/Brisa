import { h } from 'preact';
import { t, formatSize } from '../../helpers';
import type { RomCardProps } from '../../types';
import { MaterialIcon } from '../icons';

export function BrisaRomCard({
  name,
  sha1,
  size,
  path: romPath,
  matchedPorts = [],
  onDelete,
}: RomCardProps) {
  const handleCopyHash = (): void => {
    navigator.clipboard?.writeText(sha1);
  };

  const handleDelete = (): void => {
    if (confirm(t('roms.deleteConfirm', name))) {
      onDelete?.(romPath, name);
    }
  };

  return (
    <div class="rom-card">
      <div class="rom-card-head">
        <span class="rom-icon">
          <MaterialIcon name="album" size={20} filled weight={300} />
        </span>
        <span class="rom-name">{name}</span>
      </div>
      <div class="rom-meta">
        <div class="rom-hash-row">
          <span class="rom-hash">sha1 {sha1?.slice(0, 16)}…</span>
          <button class="copy-btn" title={t('roms.copyHash')} onClick={handleCopyHash}>
            <MaterialIcon name="content_copy" size={14} />
          </button>
        </div>
        <div class="rom-size">{formatSize(size)}</div>
      </div>
      <div class="rom-card-foot">
        {matchedPorts.length > 0 ? (
          matchedPorts.map((p, i) => (
            <span key={i} class="badge rom-ok">
              {p}
            </span>
          ))
        ) : (
          <span class="badge rom-nomatch">{t('roms.noMatch')}</span>
        )}
        <span class="spacer" />
        <button class="copy-btn del-btn" title={t('roms.delete')} onClick={handleDelete}>
          <MaterialIcon name="delete" size={15} />
        </button>
      </div>
    </div>
  );
}
