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
  onTabNext: () => void;
  onTabPrev: () => void;
  onExit: () => void;
  onToggleLayout: () => void;
  onOpenSettings: () => void;
}

/** Maps standard gamepad buttons to actions. */
const BUTTON_MAP: Record<number, keyof GamepadActions> = {
  0: 'onConfirm', // A / Cross
  1: 'onCancel', // B / Circle
  2: 'onToggleLayout', // X / Square → toggle grid/carousel
  3: 'onMenu', // Y / Triangle → tab switch
  4: 'onTabPrev', // LB / L1
  5: 'onTabNext', // RB / R1
  6: 'onTabPrev', // LT / L2 (alt)
  7: 'onTabNext', // RT / R2 (alt)
  8: 'onExit', // Select / Back → exit game mode
  9: 'onOpenSettings', // Start → open settings
  12: 'onUp', // D-pad Up
  13: 'onDown', // D-pad Down
  14: 'onLeft', // D-pad Left
  15: 'onRight', // D-pad Right
};

/** Axis threshold for D-pad emulation via analog sticks. */
const AXIS_THRESHOLD = 0.5;

export function useGamepad(actions: GamepadActions) {
  const stateRef = useRef<GamepadState>({ connected: false, id: '' });
  const actionsRef = useRef(actions);
  const prevPressed = useRef<Set<number>>(new Set());
  const prevAxis = useRef<Map<string, boolean>>(new Map());
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
    const prev = prevAxis.current.get(key);

    if (axisIndex === 0) {
      // Left stick X
      if (value < -AXIS_THRESHOLD && !prev) {
        actionsRef.current.onLeft();
        prevAxis.current.set(key, true);
      } else if (value > AXIS_THRESHOLD && !prev) {
        actionsRef.current.onRight();
        prevAxis.current.set(key, true);
      } else if (Math.abs(value) < AXIS_THRESHOLD / 2) {
        prevAxis.current.set(key, false);
      }
    } else if (axisIndex === 1) {
      // Left stick Y (inverted: up is negative)
      if (value < -AXIS_THRESHOLD && !prev) {
        actionsRef.current.onUp();
        prevAxis.current.set(key, true);
      } else if (value > AXIS_THRESHOLD && !prev) {
        actionsRef.current.onDown();
        prevAxis.current.set(key, true);
      } else if (Math.abs(value) < AXIS_THRESHOLD / 2) {
        prevAxis.current.set(key, false);
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

    // Start polling if a gamepad is already connected
    const pads = navigator.getGamepads();
    for (const gp of pads) {
      if (gp && gp.connected) {
        stateRef.current = { connected: true, id: gp.id };
        animFrame = requestAnimationFrame(poll);
        break;
      }
    }

    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
      cancelAnimationFrame(animFrame);
    };
  }, [handleButton, handleAxis]);

  return stateRef;
}
