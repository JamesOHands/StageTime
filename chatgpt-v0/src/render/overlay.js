// @ts-check

import * as THREE from 'three';
import { formatTime } from '../config.js';
import { makeCanvas, canvasTexture } from './room.js';
/** @typedef {import('../config.js').Mode} Mode */
/** @typedef {import('../events.js').SessionState} SessionState */
/** @typedef {'entry'|'desktop'|'xr'|'entering'} View */
/**
 * @typedef {Object} DebugSnapshot
 * @property {number} fps
 * @property {number} lowestFps
 * @property {string} target
 * @property {number} micLevel
 * @property {string} speechState
 * @property {boolean} armed
 * @property {boolean} micActive
 * @property {Mode} mode
 * @property {SessionState} state
 * @property {number} remainingMs
 * @property {number} attentive
 * @property {number} total
 * @property {number} reacting
 * @property {string} lastEvent
 * @property {string} seed
 * @property {number} calls
 * @property {number} triangles
 * @property {number} voices
 * @property {number} volume
 * @property {string} sound
 * @property {string} notice
 */

export class FrameStats {
  constructor() {
    /** @type {number[]} */
    this.frames = [];
    /** @type {{at:number,fps:number}[]} */
    this.history = [];
    this.fps = 0;
    this.lowest = 0;
    this.nextReading = 0;
  }
  reset() {
    this.frames.length = 0;
    this.history.length = 0;
    this.fps = this.lowest = this.nextReading = 0;
  }
  /** @param {number} now */
  record(now) {
    this.frames.push(now);
    while (this.frames.length > 2 && this.frames[0] < now - 1020) this.frames.shift();
    if (this.frames.length < 2 || now < this.nextReading) return;
    const span = now - this.frames[0];
    if (span < 500) return;
    this.nextReading = now + 200;
    this.fps = (this.frames.length - 1) * 1000 / Math.max(1, span);
    this.history.push({ at: now, fps: this.fps });
    while (this.history.length && this.history[0].at < now - 10000) this.history.shift();
    this.lowest = this.history.reduce((min, f) => Math.min(min, f.fps), this.fps);
  }
}

/** @param {THREE.Group} group @param {number} width @param {number} height
 * @param {number} px @param {number} py @param {number} pz
 * @param {number} canvasWidth @param {number} canvasHeight */
function floatingPanel(group, width, height, px, py, pz, canvasWidth, canvasHeight) {
  const { canvas, ctx } = makeCanvas(canvasWidth, canvasHeight);
  const texture = canvasTexture(canvas);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, depthWrite: true }));
  mesh.position.set(px, py, pz);
  mesh.rotation.y = Math.atan2(-px, -pz);
  mesh.visible = false;
  group.add(mesh);
  return { ctx, texture, mesh };
}

/** @param {number} value */
function metric(value) { return value ? value.toFixed(1) : '—'; }

export class Overlay {
  /** @param {THREE.Group} stage @param {HTMLElement} domPanel @param {HTMLElement} domText */
  constructor(stage, domPanel, domText) {
    this.domPanel = domPanel;
    this.domText = domText;
    this.debug = floatingPanel(stage, 0.93, 0.64, -1.05, 1.31, -1.14, 930, 640);
    this.ready = floatingPanel(stage, 0.70, 0.32, 0.94, 0.94, -1.03, 700, 320);
    /** @type {View} */
    this.view = 'entry';
    this.enabled = false;
    this.nextUpdate = 0;
    this.lastReady = '';
    this.syncVisibility();
  }

  syncVisibility() {
    this.debug.mesh.visible = this.enabled && this.view === 'xr';
    this.domPanel.hidden = !(this.enabled && this.view === 'desktop');
    if (this.view !== 'xr') this.ready.mesh.visible = false;
  }

  /** @param {View} view */
  setView(view) {
    this.view = view;
    this.lastReady = '';
    this.nextUpdate = 0;
    this.syncVisibility();
  }

  toggle() {
    this.enabled = !this.enabled;
    this.nextUpdate = 0;
    this.syncVisibility();
    return this.enabled;
  }

  /** @param {number} now @param {DebugSnapshot} s */
  update(now, s) {
    this.ready.mesh.visible = this.view === 'xr' && s.state !== 'running';
    if (this.ready.mesh.visible) {
      const key = s.state + '/' + s.mode + '/' + Math.round(s.volume * 100);
      if (this.lastReady !== key) {
        this.lastReady = key;
        const ctx = this.ready.ctx;
        ctx.fillStyle = '#191b1b'; ctx.fillRect(0, 0, 700, 320);
        ctx.strokeStyle = '#c49a62'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, 690, 310);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ddba84'; ctx.font = '24px sans-serif';
        ctx.fillText('STAGE TIME  /  THE BACK ROOM', 30, 48);
        ctx.fillStyle = '#f5ead7'; ctx.font = 'bold 46px sans-serif';
        ctx.fillText(s.state === 'finished' ? 'SET COMPLETE' : 'YOUR STAGE', 30, 113);
        ctx.fillStyle = '#d6d1c6'; ctx.font = '31px sans-serif';
        ctx.fillText('Hold right thumbstick · 1s to start', 30, 172);
        ctx.fillText('Hold both grips · 1s to exit', 30, 217);
        ctx.font = '25px sans-serif'; ctx.fillStyle = '#bda88b';
        ctx.fillText(s.mode.toUpperCase() + '  •  ' + Math.round(s.volume * 100) + '% volume', 30, 277);
        this.ready.texture.needsUpdate = true;
      }
    }
    if (!this.enabled || now < this.nextUpdate) return;
    this.nextUpdate = now + 200;
    const rows = [
      ['FPS / target', metric(s.fps) + ' / ' + s.target],
      ['Lowest / 10s', metric(s.lowestFps) + ' fps'],
      ['Mic', (s.micActive ? 'live • ' : 'off • ') + s.micLevel.toFixed(3)],
      ['Voice activity', s.speechState + ' / ' + (s.armed ? 'armed' : 'unarmed')],
      ['Mode / session', s.mode + ' / ' + s.state + ' / ' + formatTime(s.remainingMs)],
      ['Crowd', s.attentive + '/' + s.total + ' attentive • ' + s.reacting + ' reacting'],
      ['Last event', s.lastEvent],
      ['Seed', s.seed],
      ['Renderer', s.calls + ' calls / ' + s.triangles.toLocaleString('en-GB') + ' tris'],
      ['Sound', s.voices + ' voices • ' + Math.round(s.volume * 100) + '%'],
      ['Assets', s.sound],
      ['Notice', s.notice || '—'],
    ];
    this.domText.textContent = rows.map(row => row[0].padEnd(17) + row[1]).join('\n');
    if (this.view !== 'xr') return;
    const ctx = this.debug.ctx;
    ctx.fillStyle = '#151a1c'; ctx.fillRect(0, 0, 930, 640);
    ctx.strokeStyle = '#c49a62'; ctx.lineWidth = 4; ctx.strokeRect(5, 5, 920, 630);
    ctx.font = 'bold 27px sans-serif'; ctx.fillStyle = '#e9bf85';
    ctx.fillText('STAGE TIME   /   TECHNICAL OVERLAY', 28, 45);
    rows.forEach(([label, value], index) => {
      const y = 90 + index * 42;
      ctx.fillStyle = '#a5a9a4'; ctx.font = '25px sans-serif'; ctx.fillText(label, 30, y);
      ctx.fillStyle = '#f5ecdd'; ctx.font = '27px monospace';
      ctx.fillText(value.length > 38 ? value.slice(0, 37) + '…' : value, 305, y);
    });
    this.debug.texture.needsUpdate = true;
  }
}
