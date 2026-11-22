// @ts-check
/**
 * Desktop controls: click to lock the mouse and look around; keys trigger events.
 *   Space start/stop · L laugh · T titter · P applause · C cough · D debug · + / − volume
 */

/** @typedef {'toggleSession'|'laugh'|'titter'|'applause'|'cough'|'debug'|'volumeUp'|'volumeDown'|'exitVR'} Action */

/** @type {Record<string, Action>} */
const KEYS = {
  ' ': 'toggleSession',
  l: 'laugh',
  t: 'titter',
  p: 'applause',
  c: 'cough',
  d: 'debug',
  '+': 'volumeUp',
  '=': 'volumeUp',
  '-': 'volumeDown',
  _: 'volumeDown',
};

export class DesktopControls {
  /**
   * @param {import('three').PerspectiveCamera} camera
   * @param {HTMLElement} surface element that captures the mouse
   * @param {(action: Action) => void} onAction
   */
  constructor(camera, surface, onAction) {
    this.camera = camera;
    this.surface = surface;
    this.onAction = onAction;
    this.enabled = false;
    this.yaw = 0;
    this.pitch = -0.12;
    this.apply();

    surface.addEventListener('click', () => {
      if (this.enabled && document.pointerLockElement !== surface) surface.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== surface) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
      this.apply();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = /** @type {HTMLElement | null} */ (e.target);
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const action = KEYS[e.key.toLowerCase()] ?? KEYS[e.key];
      if (!action) return;
      e.preventDefault();
      this.onAction(action);
    });
  }

  apply() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /** @param {boolean} on */
  setEnabled(on) {
    this.enabled = on;
    if (!on && document.pointerLockElement === this.surface) document.exitPointerLock?.();
  }
}
