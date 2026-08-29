import { h } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';
import { t } from '../../helpers';
import type { ModalProps } from '../../types';

export function BrisaModal({ open, title, onClose, onConfirm, children }: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.classList.add('modal-open');
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('modal-open');
    };
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div class="modal-overlay show" role="dialog" aria-modal="true">
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h3>{title}</h3>
          <button class="modal-close" title={t('settings.close')} onClick={onClose}>
            ✕
          </button>
        </div>
        <div class="modal-body">{children}</div>
        {onConfirm && (
          <div class="modal-foot">
            <button class="btn ghost sm" onClick={onClose}>
              {t('confirm.cancel')}
            </button>
            <button class="btn red sm" onClick={onConfirm}>
              {t('confirm.uninstall')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
