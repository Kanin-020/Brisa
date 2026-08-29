/** @jsx h */
import { h } from 'preact';
import { t, formatSize } from '../../helpers.js';

/**
 * ROM card showing file info and actions.
 * @param {{ name: string, sha1: string, size: number, path: string, matchedPorts?: string[], onDelete?: Function }} props
 */
export function BrisaRomCard({ name, sha1, size, path: romPath, matchedPorts = [], onDelete }) {
  const handleCopyHash = () => {
    navigator.clipboard?.writeText(sha1);
  };

  const handleDelete = () => {
    if (confirm(t('roms.deleteConfirm', name))) {
      onDelete?.(romPath, name);
    }
  };

  return (
    <div class="rom-card">
      <div class="rom-card-head">
        <span class="rom-icon">💾</span>
        <span class="rom-name">{name}</span>
      </div>
      <div class="rom-meta">
        <div class="rom-hash-row">
          <span class="rom-hash">sha1 {sha1?.slice(0, 16)}…</span>
          <button class="copy-btn" title={t('roms.copyHash')} onClick={handleCopyHash}>⧉</button>
        </div>
        <div class="rom-size">{formatSize(size)}</div>
      </div>
      <div class="rom-card-foot">
        {matchedPorts.length > 0
          ? matchedPorts.map((p, i) => <span key={i} class="badge rom-ok">{p}</span>)
          : <span class="badge rom-nomatch">{t('roms.noMatch')}</span>
        }
        <span class="spacer" />
        <button class="copy-btn del-btn" title={t('roms.delete')} onClick={handleDelete}>🗑</button>
      </div>
    </div>
  );
}
