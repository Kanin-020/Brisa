/** @jsx h */
import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { t } from '../../helpers.js';

/**
 * Toast notification component.
 * @param {{ message: string, kind?: string, duration?: number, onClick?: Function, onClose?: Function }} props
 */
export function BrisaToast({ message, kind = 'ok', duration = 3200, onClick, onClose }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (message) {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (duration > 0) {
        timerRef.current = setTimeout(() => {
          setVisible(false);
          onClose?.();
        }, duration);
      }
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [message, duration]);

  if (!message) return null;

  return (
    <div
      class={`toast ${kind} ${visible ? 'show' : ''}`}
      onClick={() => { onClick?.(); setVisible(false); onClose?.(); }}
    >
      {message}
    </div>
  );
}
