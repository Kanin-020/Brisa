import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { BrisaApp } from './app/brisa-app';
import { GameMode } from './components/game-mode/game-mode';

// i18n (sets up window.__i18n at import time, starts async init)
import './i18n';

// Component CSS (bundled by esbuild into bundle.css)
import './styles';

/** Check if any gamepad is currently connected. */
function hasConnectedGamepad(): boolean {
  const pads = navigator.getGamepads?.();
  if (!pads) return false;
  for (const gp of pads) {
    if (gp) return true;
  }
  return false;
}

function Root() {
  const [mode, setMode] = useState<'normal' | 'game'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('gamemode') !== null || params.get('bigpicture') !== null ? 'game' : 'normal';
  });

  // Auto-switch to game mode when a gamepad connects, back when all disconnect
  useEffect(() => {
    const onConnect = () => {
      setMode((prev) => {
        if (prev === 'game') return prev;
        return 'game';
      });
    };

    const onDisconnect = () => {
      // Only auto-exit if NO gamepads remain
      if (!hasConnectedGamepad()) {
        setMode((prev) => {
          if (prev === 'normal') return prev;
          // Don't auto-exit if the user explicitly entered via URL param
          const params = new URLSearchParams(window.location.search);
          if (params.get('gamemode') !== null || params.get('bigpicture') !== null) return prev;
          return 'normal';
        });
      }
    };

    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

  if (mode === 'game') {
    return <GameMode onExit={() => { window.history.replaceState({}, '', window.location.pathname); setMode('normal'); }} />;
  }
  return <BrisaApp />;
}

// Wait for i18n translations to load before rendering
void window.__i18n!.ready().then(() => {
  render(<Root />, document.getElementById('app')!);
});
