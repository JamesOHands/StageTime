// @ts-check

import { clamp } from '../config.js';
/** @typedef {import('three').PerspectiveCamera} PerspectiveCamera */
/** @typedef {import('../events.js').ReactionKind} ReactionKind */
/**
 * @typedef {Object} InputActions
 * @property {() => void} toggleSession
 * @property {(kind: ReactionKind) => void} react
 * @property {() => void} toggleDebug
 * @property {(amount: number) => void} adjustVolume
 * @property {() => void} exit
 */

export class DesktopInput {
  /** @param {HTMLCanvasElement} canvas @param {PerspectiveCamera} camera
   * @param {InputActions} actions @param {() => boolean} active */
  constructor(canvas, camera, actions, active) {
    this.canvas = canvas;
    this.camera = camera;
    this.actions = actions;
    this.active = active;
    this.yaw = 0;
    this.pitch = -0.14;
    this.dragging = false;
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !active()) return;
      this.dragging = true;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try {
          const result = canvas.requestPointerLock();
          if (result && typeof result.catch === 'function') void result.catch(() => {
            // Drag-to-look remains available when pointer lock is refused.
          });
        } catch { /* Drag-to-look fallback. */ }
      }
    });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    window.addEventListener('blur', () => { this.dragging = false; });
    document.addEventListener('mousemove', e => {
      if (!active() || (document.pointerLockElement !== canvas && !this.dragging)) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch = clamp(this.pitch - e.movementY * 0.0023, -Math.PI * 0.47, Math.PI * 0.47);
      camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    });
    document.addEventListener('pointerlockchange', () => {
      canvas.classList.toggle('locked', document.pointerLockElement === canvas);
      if (document.pointerLockElement !== canvas) this.dragging = false;
    });
    document.addEventListener('keydown', e => {
      if (!active() || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === '+' || key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault(); actions.adjustVolume(0.05); return;
      }
      if (key === '-' || key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault(); actions.adjustVolume(-0.05); return;
      }
      if (e.repeat) return;
      switch (key) {
        case ' ': e.preventDefault(); actions.toggleSession(); break;
        case 'l': e.preventDefault(); actions.react('laugh'); break;
        case 't': e.preventDefault(); actions.react('titter'); break;
        case 'r': e.preventDefault(); actions.react('ripple'); break;
        case 'p': e.preventDefault(); actions.react('applause'); break;
        case 'c': e.preventDefault(); actions.react('cough'); break;
        case 'd': e.preventDefault(); actions.toggleDebug(); break;
      }
    });
  }

  reset() {
    this.yaw = 0;
    this.pitch = -0.14;
    this.camera.rotation.set(this.pitch, 0, 0, 'YXZ');
  }

  release() {
    this.dragging = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
}
