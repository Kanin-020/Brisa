import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { ToastProps } from '../../types';

export function BrisaToast({
  message,
  kind = 'ok',
  duration = 3200,
  onClick,
  onClose,
}: ToastProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, duration]);

  if (!message) return null;

  return (
    <div
      class={`toast ${kind} ${visible ? 'show' : ''}`}
      onClick={() => {
        onClick?.();
        setVisible(false);
        onClose?.();
      }}
    >
      {message}
    </div>
  );
}
