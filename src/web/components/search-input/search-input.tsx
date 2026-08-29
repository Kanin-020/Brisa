import { h } from 'preact';
import { useState, useRef, useCallback } from 'preact/hooks';
import type { SearchInputProps } from '../../types';

export function BrisaSearchInput({
  placeholder = 'Buscar…',
  value = '',
  onSearch,
  onClear,
}: SearchInputProps) {
  const [query, setQuery] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounce = useCallback((fn: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(), 200);
  }, []);

  const handleInput = useCallback(
    (e: h.JSX.TargetedEvent<HTMLInputElement>) => {
      const val = e.currentTarget.value;
      setQuery(val);
      debounce(() => onSearch?.(val));
    },
    [onSearch, debounce],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    onSearch?.('');
    onClear?.();
  }, [onSearch, onClear]);

  return (
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input
        type="search"
        placeholder={placeholder}
        value={query}
        onInput={handleInput}
        autocomplete="off"
        spellcheck={false}
      />
      {query && (
        <button class="clear-btn visible" title="Limpiar" onClick={handleClear}>
          ×
        </button>
      )}
    </div>
  );
}
