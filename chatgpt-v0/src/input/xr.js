// @ts-check

import { CONFIG } from '../config.js';
/** @typedef {import('./desktop.js').InputActions} InputActions */

/** WebXR's xr-standard layout reserves 0 trigger, 1 squeeze, 2 touchpad
 * and 3 thumbstick. The Quest Touch / Touch Plus profiles expose the two
 * face buttons next (4 and 5), and thumbstick Y at axes[3].
 * Never assume inputSources[0] is the right hand. */
export class XRInput {
  /** @param {InputActions} actions */
  constructor(actions) {
    this.actions = actions;
    /** @type {Map<string, boolean>} */
    this.previous = new Map();
    /** @type {number | null} */
    this.startHold = null;
    /** @type {number | null} */
    this.exitHold = null;
    this.startFired = false;
    this.exitFired = false;
    this.nextVolume = 0;
  }

  reset() {
    this.previous.clear();
    this.startHold = this.exitHold = null;
    this.startFired = this.exitFired = false;
    this.nextVolume = 0;
  }

  /** @param {string} name @param {boolean} pressed @param {() => void} action */
  edge(name, pressed, action) {
    if (pressed && !this.previous.get(name)) action();
    this.previous.set(name, pressed);
  }

  /** @param {XRSession} session @param {number} now */
  poll(session, now) {
    /** @type {Gamepad | undefined} */
    let left, right;
    for (const source of session.inputSources) {
      const gamepad = source.gamepad;
      if (!gamepad) continue;
      const touchProfile = source.profiles.some(profile => profile.includes('oculus-touch') || profile.includes('meta-quest-touch'));
      if (gamepad.mapping !== 'xr-standard' && !touchProfile) continue;
      if (source.handedness === 'left') left = gamepad;
      if (source.handedness === 'right') right = gamepad;
    }
    /** @param {Gamepad | undefined} gamepad @param {number} index */
    const pressed = (gamepad, index) => Boolean(gamepad?.buttons[index]?.pressed);
    const bothGrips = pressed(left, 1) && pressed(right, 1);
    if (bothGrips) {
      if (this.exitHold === null) this.exitHold = now;
      if (!this.exitFired && now - this.exitHold >= CONFIG.ctrlHoldMs) {
        this.exitFired = true;
        this.actions.exit();
      }
      // Keep safety-critical exit independent of face-button inputs.
      return;
    }
    this.exitHold = null;
    this.exitFired = false;
    this.edge('A', pressed(right, 4), () => this.actions.react('laugh'));
    this.edge('B', pressed(right, 5), () => this.actions.react('titter'));
    this.edge('X', pressed(left, 4), () => this.actions.react('applause'));
    this.edge('Y', pressed(left, 5), () => this.actions.react('cough'));
    this.edge('left-stick', pressed(left, 3), () => this.actions.toggleDebug());
    const rightStick = pressed(right, 3);
    if (rightStick) {
      if (this.startHold === null) this.startHold = now;
      if (!this.startFired && now - this.startHold >= CONFIG.ctrlHoldMs) {
        this.startFired = true;
        this.actions.toggleSession();
      }
    } else {
      this.startHold = null;
      this.startFired = false;
      const y = right?.axes[3] ?? 0;
      if (Math.abs(y) < 0.4) this.nextVolume = 0;
      else if (Math.abs(y) > 0.68 && now >= this.nextVolume) {
        this.actions.adjustVolume(y < 0 ? 0.05 : -0.05);
        this.nextVolume = now + 180;
      }
    }
  }
}
