// @ts-check
/**
 * Quest controller input (xr-standard gamepad mapping) and the handheld mic.
 *
 *   Right: A laugh · B titter · hold thumbstick press 1 s start/stop · thumbstick up/down volume
 *   Left:  X applause · Y cough · thumbstick press debug overlay
 *   Both grips held 1 s: exit VR
 */

import * as THREE from 'three';

/** @typedef {import('./desktop.js').Action} Action */

const BTN = { trigger: 0, grip: 1, stick: 3, a: 4, b: 5 };
const HOLD_MS = 1000;

/** @param {'left'|'right'} side */
function makeHandProxy(side) {
  const g = new THREE.Group();
  g.name = `hand-${side}`;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.11), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  body.position.set(0, -0.01, 0.02);
  g.add(body);
  return g;
}

function makeMic() {
  const g = new THREE.Group();
  g.name = 'hand-mic';
  const metal = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.014, 0.18, 10), metal);
  const grille = new THREE.Mesh(new THREE.SphereGeometry(0.031, 12, 8), new THREE.MeshLambertMaterial({ color: 0x77777c }));
  grille.position.y = 0.105;
  g.add(handle, grille);
  // Point the mic forward and slightly up out of the fist.
  g.rotation.x = -1.2;
  g.position.set(0, 0.01, -0.03);
  return g;
}

export class XRControls {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {(action: Action) => void} onAction
   */
  constructor(renderer, scene, onAction) {
    this.renderer = renderer;
    this.onAction = onAction;
    /** @type {'left'|'right'|'none'} */
    this.micHand = 'right';
    /** @type {Record<'left'|'right', THREE.Group | null>} */
    this.grips = { left: null, right: null };
    this.mic = makeMic();
    /** @type {Map<string, boolean>} */
    this.prev = new Map();
    /** @type {Map<string, number>} */
    this.holdSince = new Map();
    /** @type {Set<string>} */
    this.holdFired = new Set();
    this.volumeRepeatAt = 0;

    for (const i of [0, 1]) {
      const grip = renderer.xr.getControllerGrip(i);
      scene.add(grip);
      grip.addEventListener('connected', (/** @type {any} */ e) => {
        const side = /** @type {'left'|'right'} */ (e.data?.handedness === 'left' ? 'left' : 'right');
        grip.userData.side = side;
        grip.clear();
        grip.add(makeHandProxy(side));
        this.grips[side] = grip;
        this.placeMic();
        this.onGripsChanged?.();
      });
      grip.addEventListener('disconnected', () => {
        const side = /** @type {'left'|'right'|undefined} */ (grip.userData.side);
        if (side && this.grips[side] === grip) this.grips[side] = null;
        grip.clear();
        this.onGripsChanged?.();
      });
    }
    /** @type {(() => void) | null} */
    this.onGripsChanged = null;
  }

  /** @param {'left'|'right'|'none'} hand */
  setMicHand(hand) {
    this.micHand = hand;
    this.placeMic();
  }

  placeMic() {
    this.mic.removeFromParent();
    if (this.micHand === 'none') return;
    this.grips[this.micHand]?.add(this.mic);
  }

  get holdsMic() {
    return this.micHand !== 'none' && this.grips[this.micHand] !== null;
  }

  /** @param {XRInputSource} source @param {number} [strength] */
  pulse(source, strength = 0.5) {
    try {
      /** @type {any} */ (source.gamepad)?.hapticActuators?.[0]?.pulse?.(strength, 60);
    } catch {
      // Haptics are optional.
    }
  }

  /** Read buttons once per frame. @param {number} now ms */
  poll(now) {
    const session = this.renderer.xr.getSession();
    if (!session) return;
    let leftGrip = false;
    let rightGrip = false;
    /** @type {XRInputSource | null} */
    let anySource = null;

    for (const source of session.inputSources) {
      const gp = source.gamepad;
      if (!gp || (source.handedness !== 'left' && source.handedness !== 'right')) continue;
      anySource = source;
      const side = source.handedness;
      /** @param {number} idx */
      const pressed = (idx) => !!gp.buttons[idx]?.pressed;
      /** @param {string} key @param {boolean} down */
      const edge = (key, down) => {
        const id = `${side}:${key}`;
        const was = this.prev.get(id) ?? false;
        this.prev.set(id, down);
        return down && !was;
      };

      if (side === 'right') {
        if (edge('a', pressed(BTN.a))) this.onAction('laugh');
        if (edge('b', pressed(BTN.b))) this.onAction('titter');
        if (this.held('right:stick', pressed(BTN.stick), now)) {
          this.pulse(source);
          this.onAction('toggleSession');
        }
        const y = gp.axes[3] ?? 0;
        if (Math.abs(y) > 0.7 && now >= this.volumeRepeatAt) {
          this.onAction(y < 0 ? 'volumeUp' : 'volumeDown');
          this.volumeRepeatAt = now + 300;
        } else if (Math.abs(y) < 0.3) {
          this.volumeRepeatAt = 0;
        }
        rightGrip = pressed(BTN.grip);
      } else {
        if (edge('x', pressed(BTN.a))) this.onAction('applause');
        if (edge('y', pressed(BTN.b))) this.onAction('cough');
        if (edge('stick', pressed(BTN.stick))) this.onAction('debug');
        leftGrip = pressed(BTN.grip);
      }
    }

    if (this.held('both:grips', leftGrip && rightGrip, now)) {
      if (anySource) this.pulse(anySource, 0.8);
      this.onAction('exitVR');
    }
  }

  /** True once when `down` has been held for HOLD_MS. @param {string} id @param {boolean} down @param {number} now */
  held(id, down, now) {
    if (!down) {
      this.holdSince.delete(id);
      this.holdFired.delete(id);
      return false;
    }
    if (!this.holdSince.has(id)) this.holdSince.set(id, now);
    if (!this.holdFired.has(id) && now - /** @type {number} */ (this.holdSince.get(id)) >= HOLD_MS) {
      this.holdFired.add(id);
      return true;
    }
    return false;
  }

  /** How far through a hold each control is (0–1), for on-screen feedback. @param {number} now */
  holdProgress(now) {
    /** @type {Record<string, number>} */
    const out = {};
    for (const [id, since] of this.holdSince) if (!this.holdFired.has(id)) out[id] = Math.min(1, (now - since) / HOLD_MS);
    return out;
  }
}
