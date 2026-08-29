import { h, render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
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

  const lastExitTime = useRef(0);

  // Auto-switch to game mode when a gamepad connects, back when all disconnect
  useEffect(() => {
    const onConnect = () => {
      lastExitTime.current = 0; // reset cooldown on fresh connect
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

  // Re-enter game mode when a gamepad button is pressed in normal mode
  useEffect(() => {
    if (mode !== 'normal') return;
    let animFrame: number;
    const COOLDOWN_MS = 3000;
    const poll = () => {
      const pads = navigator.getGamepads();
      for (const gp of pads) {
        if (!gp || !gp.connected) continue;
        for (const btn of gp.buttons) {
          if (btn.pressed && Date.now() - lastExitTime.current > COOLDOWN_MS) {
            setMode('game');
            return;
          }
        }
      }
      animFrame = requestAnimationFrame(poll);
    };
    animFrame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(animFrame);
  }, [mode]);

  if (mode === 'game') {
    return (
      <GameMode
        onExit={() => {
          lastExitTime.current = Date.now();
          window.history.replaceState({}, '', window.location.pathname);
          setMode('normal');
        }}
      />
    );
  }
  return <BrisaApp />;
}

// Dev rebuild detector: when server restarts, open a new tab instead of stale page
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  let serverWasDown = false;
  setInterval(async () => {
    try {
      const res = await fetch('/api/status', { method: 'HEAD', cache: 'no-store' });
      if (serverWasDown && res.ok) {
        serverWasDown = false;
        window.open(window.location.href, '_blank');
      }
    } catch {
      serverWasDown = true;
    }
  }, 3000);
}

// Wait for i18n translations to load before rendering
void window.__i18n!.ready().then(() => {
  render(<Root />, document.getElementById('app')!);
});
