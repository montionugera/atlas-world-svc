import { renderHook } from '@testing-library/react';
import { useKeyboardControls } from './useKeyboardControls';

const key = (type: 'keydown' | 'keyup', k: string, mods: Partial<KeyboardEventInit> = {}) => {
  const ev = new KeyboardEvent(type, { key: k, cancelable: true, ...mods });
  window.dispatchEvent(ev);
  return ev;
};

function setup() {
  const updatePlayerInput = jest.fn();
  const sendPlayerAction = jest.fn();
  const switchWeapon = jest.fn();
  const view = renderHook(() => useKeyboardControls({ updatePlayerInput, sendPlayerAction, switchWeapon }));
  const lastMove = () => updatePlayerInput.mock.calls.at(-1);
  return { ...view, updatePlayerInput, sendPlayerAction, switchWeapon, lastMove };
}

describe('useKeyboardControls', () => {
  it.each([
    ['w', [0, -2]],
    ['s', [0, 2]],
    ['a', [-2, 0]],
    ['d', [2, 0]],
    ['ArrowUp', [0, -2]],
    ['ArrowRight', [2, 0]],
  ])('%s sends the expected move vector and release stops', (k, expected) => {
    const { lastMove } = setup();
    key('keydown', k);
    expect(lastMove()).toEqual(expected);
    key('keyup', k);
    expect(lastMove()).toEqual([0, 0]);
  });

  it('uppercase (Shift/CapsLock held) letters still move', () => {
    const { lastMove } = setup();
    key('keydown', 'W', { shiftKey: true });
    expect(lastMove()).toEqual([0, -2]);
  });

  it('normalizes diagonals to the same speed', () => {
    const { lastMove } = setup();
    key('keydown', 'w');
    key('keydown', 'd');
    const [vx, vy] = lastMove();
    expect(Math.hypot(vx, vy)).toBeCloseTo(2);
  });

  it('clears modifiers whose keyup was swallowed (macOS Cmd+Ctrl+Shift+4)', () => {
    const { result, lastMove } = setup();
    key('keydown', 'Meta', { metaKey: true });
    key('keydown', 'Control', { metaKey: true, ctrlKey: true });
    expect(result.current.pressedKeys.current.has('meta')).toBe(true);
    // next real key event reports no modifiers held → stale ones are dropped
    key('keydown', 's');
    const keys = result.current.pressedKeys.current;
    expect(keys.has('meta')).toBe(false);
    expect(keys.has('control')).toBe(false);
    expect(lastMove()).toEqual([0, 2]);
  });

  it('window blur and focus drop all held keys (no stuck movement)', () => {
    const { lastMove, sendPlayerAction } = setup();
    key('keydown', 'd');
    window.dispatchEvent(new Event('blur'));
    expect(lastMove()).toEqual([0, 0]);
    expect(sendPlayerAction).toHaveBeenCalledWith('attack', false);
    key('keydown', 'a');
    window.dispatchEvent(new Event('focus'));
    expect(lastMove()).toEqual([0, 0]);
  });

  it('prevents page scroll for arrows and space', () => {
    setup();
    expect(key('keydown', 'ArrowDown').defaultPrevented).toBe(true);
    expect(key('keydown', ' ').defaultPrevented).toBe(true);
    expect(key('keydown', 'x').defaultPrevented).toBe(false);
  });

  it('space attacks, 1-4 skills, shift dashes, 5-9 weapons', () => {
    const { sendPlayerAction, switchWeapon } = setup();
    key('keydown', ' ');
    expect(sendPlayerAction).toHaveBeenCalledWith('attack', true);
    key('keyup', ' ');
    expect(sendPlayerAction).toHaveBeenCalledWith('attack', false);
    key('keydown', '3');
    expect(sendPlayerAction).toHaveBeenCalledWith('useSkill', true, expect.objectContaining({ skillId: 'skill_3' }));
    key('keydown', 'Shift', { shiftKey: true });
    expect(sendPlayerAction).toHaveBeenCalledWith('useSkill', true, { skillId: 'skill_dash' });
    key('keydown', '6');
    expect(switchWeapon).toHaveBeenCalledWith('magic_staff');
  });

  it('ignores OS key-repeat events', () => {
    const { updatePlayerInput } = setup();
    key('keydown', 'd');
    const n = updatePlayerInput.mock.calls.length;
    key('keydown', 'd', { repeat: true });
    expect(updatePlayerInput.mock.calls.length).toBe(n);
  });

  it('removes listeners on unmount', () => {
    const { unmount, updatePlayerInput } = setup();
    unmount();
    const n = updatePlayerInput.mock.calls.length;
    key('keydown', 'd');
    expect(updatePlayerInput.mock.calls.length).toBe(n);
  });
});
