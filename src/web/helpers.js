// Shared helpers for Preact components
/** @jsx h */
import { h } from "preact";

/** i18n helper — reads from window.__i18n */
export function t(key, ...args) {
  if (window.__i18n?.t) return window.__i18n.t(key, ...args);
  return key;
}

/** Format bytes to human-readable size */
export function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Maximum number of mod chips shown inline */
export const MAX_MODS_INLINE = 3;
