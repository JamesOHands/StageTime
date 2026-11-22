// @ts-check
/**
 * Debug overlay: a small panel in VR (on the left controller, or a fixed spot if there's
 * no controller) and a text box on desktop. Redrawn a few times a second, not every frame.
 */

import * as THREE from 'three';

/** Frame-rate meter with the lowest one-second figure over the last 10 s. */
export class FrameStats {
  constructor() {
    /** @type {number[]} */
    this.frames = [];
    /** @type {number[]} */
    this.perSecond = [];
    this.bucketStart = 0;
    this.bucketCount = 0;
    this.fps = 0;
  }

  /** @param {number} now ms */
  tick(now) {
    this.frames.push(now);
    while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift();
    this.fps = this.frames.length;
    if (!this.bucketStart) this.bucketStart = now;
    this.bucketCount++;
    if (now - this.bucketStart >= 1000) {
      this.perSecond.push(this.bucketCount);
      if (this.perSecond.length > 10) this.perSecond.shift();
      this.bucketStart = now;
      this.bucketCount = 0;
    }
  }

  /** Reset after a pause in rendering (e.g. entering VR). */
  reset() {
    this.frames = [];
    this.perSecond = [];
    this.bucketStart = 0;
    this.bucketCount = 0;
  }

  get min10s() {
    return this.perSecond.length ? Math.min(...this.perSecond) : this.fps;
  }
}

export class DebugOverlay {
  /** @param {THREE.Scene} scene @param {HTMLElement} domPanel */
  constructor(scene, domPanel) {
    this.dom = domPanel;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 320;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.1875),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false }),
    );
    this.mesh.renderOrder = 999;
    this.mesh.name = 'debug-overlay';
    // Fixed spot: stage left, chest height, angled towards you.
    this.fixedParent = new THREE.Group();
    this.fixedParent.position.set(-0.75, 1.25, -0.7);
    this.fixedParent.lookAt(0, 1.5, 0);
    scene.add(this.fixedParent);
    this.fixedParent.add(this.mesh);
    this.visible = false;
    this.inVR = false;
    this.mesh.visible = false;
    this.lastDraw = 0;
    /** @type {string[]} */
    this.lines = [];
  }

  /** Hold the panel above a controller, or put it back at the fixed spot. @param {THREE.Object3D | null} parent */
  attachTo(parent) {
    if (parent) {
      parent.add(this.mesh);
      this.mesh.position.set(0, 0.07, -0.12);
      this.mesh.rotation.set(-0.7, 0, 0);
    } else {
      this.fixedParent.add(this.mesh);
      this.mesh.position.set(0, 0, 0);
      this.mesh.rotation.set(0, 0, 0);
    }
  }

  /** @param {boolean} v */
  setVisible(v) {
    this.visible = v;
    this.mesh.visible = v && this.inVR;
    this.dom.hidden = !v;
  }

  /** The 3D panel only shows in the headset; the desktop uses the text box. @param {boolean} inVR */
  setInVR(inVR) {
    this.inVR = inVR;
    this.setVisible(this.visible);
  }

  toggle() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  /** @param {string[]} lines @param {number} now */
  update(lines, now) {
    this.lines = lines;
    if (!this.visible || now - this.lastDraw < 250) return;
    this.lastDraw = now;
    this.dom.textContent = lines.join('\n');
    const g = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));
    g.clearRect(0, 0, 512, 320);
    g.fillStyle = 'rgba(8, 10, 14, 0.82)';
    g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#e8f0e8';
    g.font = '22px ui-monospace, Menlo, monospace';
    lines.slice(0, 11).forEach((line, i) => {
      g.fillStyle = line.startsWith('!') ? '#ff8a80' : '#e8f0e8';
      g.fillText(line, 14, 32 + i * 27, 484);
    });
    this.texture.needsUpdate = true;
  }
}
