/** @jsx h */
import { h } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';
import { t } from '../../helpers.js';

/**
 * Reusable modal dialog.
 * @param {{ open: boolean, title: string, onClose: Function, onConfirm?: Function, children }} props
 */
export function BrisaModal({ open, title, onClose, onConfirm, children }) {
  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape') onClose?.();
  }, [onClose]);

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
          <button class="modal-close" title="Cerrar" onClick={onClose}>✕</button>
        </div>
        <div class="modal-body">{children}</div>
        {onConfirm && (
          <div class="modal-foot">
            <button class="btn ghost sm" onClick={onClose}>Cancelar</button>
            <button class="btn red sm" onClick={onConfirm}>Aceptar</button>
          </div>
        )}
      </div>
    </div>
  );
}
