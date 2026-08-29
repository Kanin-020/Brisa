import { useEffect, useRef, useCallback } from 'preact/hooks';

export interface GamepadState {
  connected: boolean;
  id: string;
}

export interface GamepadActions {
  onUp: () => void;
  onDown: () => void;
  onLeft: () => void;
  onRight: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onMenu: () => void;
}

/** Maps standard gamepad buttons to actions. */
const BUTTON_MAP: Record<number, keyof GamepadActions> = {
  0: 'onConfirm',   // A / Cross
  1: 'onCancel',    // B / Circle
  2: 'onCancel',    // X / Square (alt cancel)
  3: 'onMenu',      // Y / Triangle
  8: 'onMenu',      // Select / Back
  9: 'onMenu',      // Start
  12: 'onUp',       // D-pad Up
  13: 'onDown',     // D-pad Down
  14: 'onLeft',     // D-pad Left
  15: 'onRight',    // D-pad Right
};

/** Axis threshold for D-pad emulation via analog sticks. */
const AXIS_THRESHOLD = 0.5;

export function useGamepad(actions: GamepadActions) {
  const stateRef = useRef<GamepadState>({ connected: false, id: '' });
  const actionsRef = useRef(actions);
  const prevPressed = useRef<Set<number>>(new Set());
  const cooldown = useRef<Set<number>>(new Set());

  // Keep actions ref current
  actionsRef.current = actions;

  const handleButton = useCallback((btnIndex: number, pressed: boolean) => {
    const action = BUTTON_MAP[btnIndex];
    if (!action) return;

    const wasPressed = prevPressed.current.has(btnIndex);
    if (pressed && !wasPressed && !cooldown.current.has(btnIndex)) {
      actionsRef.current[action]();
      cooldown.current.add(btnIndex);
      setTimeout(() => cooldown.current.delete(btnIndex), 150);
    }

    if (pressed) {
      prevPressed.current.add(btnIndex);
    } else {
      prevPressed.current.delete(btnIndex);
    }
  }, []);

  const handleAxis = useCallback((axisIndex: number, value: number) => {
    const key = `axis_${axisIndex}`;
    const prev = (prevPressed.current as unknown as Map<string, boolean>).get(key);

    if (axisIndex === 0) {
      // Left stick X
      if (value < -AXIS_THRESHOLD && !prev) {
        actionsRef.current.onLeft();
        (prevPressed.current as unknown as Map<string, boolean>).set(key, true);
      } else if (value > AXIS_THRESHOLD && !prev) {
        actionsRef.current.onRight();
        (prevPressed.current as unknown as Map<string, boolean>).set(key, true);
      } else if (Math.abs(value) < AXIS_THRESHOLD / 2) {
        (prevPressed.current as unknown as Map<string, boolean>).set(key, false);
      }
    } else if (axisIndex === 1) {
      // Left stick Y (inverted: up is negative)
      if (value < -AXIS_THRESHOLD && !prev) {
        actionsRef.current.onUp();
        (prevPressed.current as unknown as Map<string, boolean>).set(key, true);
      } else if (value > AXIS_THRESHOLD && !prev) {
        actionsRef.current.onDown();
        (prevPressed.current as unknown as Map<string, boolean>).set(key, true);
      } else if (Math.abs(value) < AXIS_THRESHOLD / 2) {
        (prevPressed.current as unknown as Map<string, boolean>).set(key, false);
      }
    }
  }, []);

  useEffect(() => {
    let animFrame: number;

    const poll = () => {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;

        // Handle buttons
        for (let i = 0; i < gp.buttons.length; i++) {
          handleButton(i, gp.buttons[i].pressed);
        }

        // Handle axes
        for (let i = 0; i < Math.min(gp.axes.length, 4); i++) {
          handleAxis(i, gp.axes[i]);
        }
      }
      animFrame = requestAnimationFrame(poll);
    };

    const onConnect = (e: GamepadEvent) => {
      stateRef.current = { connected: true, id: e.gamepad.id };
      animFrame = requestAnimationFrame(poll);
    };

    const onDisconnect = () => {
      stateRef.current = { connected: false, id: '' };
      cancelAnimationFrame(animFrame);
    };

    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    // Start polling if already connected
    if (navigator.getGamepads().length > 0) {
      animFrame = requestAnimationFrame(poll);
    }

    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
      cancelAnimationFrame(animFrame);
    };
  }, [handleButton, handleAxis]);

  return stateRef;
}
