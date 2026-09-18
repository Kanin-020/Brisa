import { h } from 'preact';

/**
 * Material Symbols (Outlined) icon — renders the icon by ligature name.
 * Replaces unicode glyphs/emojis: icons center via flexbox, inherit
 * `currentColor`, and scale crisply at any size.
 *
 * Requires `import 'material-symbols/outlined.css'` (done in styles.ts).
 */

interface MaterialIconProps {
  /** Icon ligature name, e.g. "play_arrow", "settings", "folder_open" */
  name: string;
  /** Rendered size in px (default 18) */
  size?: number;
  /** Use the filled variation */
  filled?: boolean;
  /** Stroke weight 100–700 (default 400) */
  weight?: number;
}

export function MaterialIcon({ name, size = 18, filled = false, weight = 400 }: MaterialIconProps) {
  return (
    <span
      class="icon material-symbols-outlined"
      aria-hidden="true"
      style={`font-size:${size}px;font-variation-settings:'FILL' ${filled ? 1 : 0},'wght' ${weight},'GRAD' 0,'opsz' 24;`}
    >
      {name}
    </span>
  );
}
