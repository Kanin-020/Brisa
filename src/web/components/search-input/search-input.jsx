/** @jsx h */
import { h } from 'preact';
import { useState, useRef, useCallback } from 'preact/hooks';

/**
 * Search input with debounce and clear button.
 * @param {{ placeholder?: string, value?: string, onSearch?: Function, onClear?: Function }} props
 */
export function BrisaSearchInput({ placeholder = 'Buscar…', value = '', onSearch, onClear }) {
  const [query, setQuery] = useState(value);
  const timerRef = useRef(null);

  const debounce = useCallback((fn) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(), 200);
  }, []);

  const handleInput = useCallback((e) => {
    const val = e.target.value;
    setQuery(val);
    debounce(() => onSearch?.(val));
  }, [onSearch, debounce]);

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
        spellcheck="false"
      />
      {query && (
        <button class="clear-btn visible" title="Limpiar" onClick={handleClear}>×</button>
      )}
    </div>
  );
}
