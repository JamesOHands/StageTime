// @ts-check

import * as THREE from 'three';
import { CONFIG, formatTime } from '../config.js';
import { stream } from '../rng.js';

/** @typedef {import('../crowd.js').Seat} Seat */
/** @typedef {import('../events.js').SessionState} SessionState */
/** @typedef {{x:number,y:number,z:number,sx:number,sy:number,sz:number,colour:number,rx:number,ry:number,rz:number}} Instance */

/** @param {number} width @param {number} height */
export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  return { canvas, ctx };
}

/** @param {HTMLCanvasElement} canvas */
export function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** Static instancing also keeps the pub furniture within the XR draw budget.
 * @param {THREE.Group} parent @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material @param {Instance[]} entries */
function batch(parent, geometry, material, entries) {
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  const pose = new THREE.Object3D();
  const colour = new THREE.Color();
  for (let i = 0; i < entries.length; i++) {
    const p = entries[i];
    pose.position.set(p.x, p.y, p.z);
    pose.rotation.set(p.rx, p.ry, p.rz);
    pose.scale.set(p.sx, p.sy, p.sz);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.setColorAt(i, colour.setHex(p.colour));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

/** Original procedural wood texture, with no external image assets.
 * @param {boolean} stage */
function woodTexture(stage) {
  const { canvas, ctx } = makeCanvas(256, 256);
  const rand = stream('stage-time-original-wood', String(stage));
  const colours = stage
    ? ['#4e3024', '#58372a', '#644032', '#513428', '#6a4534']
    : ['#40322b', '#49382d', '#4c3a30', '#392e27', '#524238'];
  ctx.fillStyle = colours[0];
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const x = i * 32;
    ctx.fillStyle = colours[Math.floor(rand() * colours.length)];
    ctx.fillRect(x + 1, 0, 31, 256);
    ctx.fillStyle = 'rgba(15,10,8,.36)';
    ctx.fillRect(x, 0, 1, 256);
    for (let j = 0; j < 82; j++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,221,174,.035)';
      ctx.fillRect(x + 2 + rand() * 28, rand() * 256, 0.5 + rand(), 6 + rand() * 60);
    }
    const join = Math.floor(rand() * 220);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(x + 1, join, 31, 1);
  }
  const tex = canvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(stage ? 2 : 3, stage ? 1 : 4);
  return tex;
}

/** @param {THREE.Group} parent @param {number} width @param {number} height
 * @param {number} x @param {number} y @param {number} z
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @param {number} [yaw] */
function sign(parent, width, height, x, y, z, draw, yaw = 0) {
  const { canvas, ctx } = makeCanvas(512, 256);
  draw(ctx, canvas.width, canvas.height);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), toneMapped: false })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  parent.add(mesh);
  return mesh;
}

export class Room {
  /** @param {Seat[]} seats */
  constructor(seats) {
    this.group = new THREE.Group();
    this.group.name = 'The Back Room';
    const floor = CONFIG.audienceFloor, ceiling = 2.48;
    const back = -6.42, front = 1.7, width = 6.04;
    const depth = front - back, midZ = (front + back) / 2;
    /** @type {Instance[]} */
    const boxes = [];
    /** @type {Instance[]} */
    const cylinders = [];
    /** @type {Instance[]} */
    const spheres = [];
    /** @type {Instance[]} */
    const glow = [];
    /** @param {Instance[]} target @param {number} x @param {number} y @param {number} z
     * @param {number} sx @param {number} sy @param {number} sz @param {number} colour
     * @param {number} [rx] @param {number} [ry] @param {number} [rz] */
    function part(target, x, y, z, sx, sy, sz, colour, rx = 0, ry = 0, rz = 0) {
      target.push({ x, y, z, sx, sy, sz, colour, rx, ry, rz });
    }
    /** @param {number} x @param {number} y @param {number} z @param {number} w
     * @param {number} h @param {number} d @param {number} color @param {number} [rx]
     * @param {number} [ry] @param {number} [rz] */
    const box = (x, y, z, w, h, d, color, rx = 0, ry = 0, rz = 0) =>
      part(boxes, x, y, z, w, h, d, color, rx, ry, rz);
    /** @param {number} x @param {number} y @param {number} z @param {number} radius
     * @param {number} height @param {number} color @param {number} [rx] @param {number} [rz] */
    const cyl = (x, y, z, radius, height, color, rx = 0, rz = 0) =>
      part(cylinders, x, y, z, radius, height, radius, color, rx, 0, rz);
    const darkWood = 0x412c25, trim = 0x674536, wall = 0x533a38;

    // Floor tops are exact: the user's real standing floor is the stage.
    const audienceFloor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth),
      new THREE.MeshLambertMaterial({ map: woodTexture(false), color: 0xd8c7b5 }));
    audienceFloor.rotation.x = -Math.PI / 2;
    audienceFloor.position.set(0, floor, midZ);
    this.group.add(audienceFloor);
    box(0, floor / 2, 0.465, 4.98, -floor, 2.47, 0x34241f);
    const stageTop = new THREE.Mesh(new THREE.PlaneGeometry(4.98, 2.47),
      new THREE.MeshLambertMaterial({ map: woodTexture(true), color: 0xe0c8af }));
    stageTop.rotation.x = -Math.PI / 2;
    stageTop.position.set(0, 0.002, 0.465);
    this.group.add(stageTop);
    box(0, -0.07, -0.778, 5.00, 0.11, 0.045, 0x956342);
    box(2.7, floor + 0.1125, -0.61, 0.57, 0.225, 0.60, darkWood);
    box(2.7, floor + 0.225, -0.61, 0.57, 0.025, 0.60, trim);

    // An enclosed timber-and-plaster pub rather than a floating crowd.
    for (const side of [-1, 1]) {
      box(side * 3.07, (ceiling + floor) / 2, midZ, 0.13, ceiling - floor, depth, wall);
      box(side * 2.99, floor + 0.35, midZ, 0.045, 0.70, depth, darkWood);
      box(side * 2.97, floor + 0.73, midZ, 0.07, 0.07, depth, trim);
      box(side * 2.96, floor + 0.05, midZ, 0.07, 0.1, depth, 0x2c211b);
      for (let z = back + 0.44; z < front; z += 0.71) {
        box(side * 2.963, floor + 0.36, z, 0.07, 0.62, 0.045, trim);
      }
    }
    box(0, (ceiling + floor) / 2, back - 0.06, width, ceiling - floor, 0.12, 0x41332d);
    box(0, (ceiling + floor) / 2, front + 0.06, width, ceiling - floor, 0.12, 0x282120);
    box(0, ceiling + 0.055, midZ, width, 0.11, depth, 0x302925);
    for (let z = back + 0.35; z < front; z += 1.27) {
      box(0, ceiling - 0.08, z, width, 0.16, 0.17, 0x291f1b);
    }
    // Curtain folds behind the performer.
    for (let x = -2.43; x <= 2.45; x += 0.16) {
      cyl(x, 1.13, 1.54, 0.10, 2.25, Math.round(x * 100) % 2 === 0 ? 0x45282d : 0x392129);
    }
    box(0, 2.30, 1.43, 5.10, 0.17, 0.16, 0x251e1b);

    // Tables and the full set of chairs exist whether occupied or not.
    for (const seat of seats) {
      const { x, z } = seat;
      box(x, floor + 0.423, z + 0.025, 0.44, 0.065, 0.43, 0x5d3b39);
      box(x, floor + 0.382, z, 0.45, 0.045, 0.45, darkWood);
      box(x, floor + 0.73, z - 0.203, 0.43, 0.34, 0.048, 0x644541);
      for (const s of [-1, 1]) {
        box(x + s * 0.178, floor + 0.21, z + 0.166, 0.041, 0.42, 0.041, trim);
        box(x + s * 0.178, floor + 0.42, z - 0.18, 0.041, 0.84, 0.041, trim);
      }
    }
    for (const side of [-1, 1]) {
      for (const z of [-2.18, -3.91]) {
        const x = side * 2.69;
        cyl(x, floor + 0.035, z, 0.17, 0.07, 0x362824);
        cyl(x, floor + 0.32, z, 0.037, 0.60, darkWood);
        cyl(x, floor + 0.66, z, 0.25, 0.065, 0x76513b);
        cyl(x - side * 0.07, floor + 0.77, z, 0.041, 0.155, 0xb98c52);
        cyl(x - side * 0.07, floor + 0.848, z, 0.044, 0.014, 0xdec7a3);
      }
    }

    // Warm, subdued bar beyond the last row. Glassware and shelves are simple
    // geometry, so their silhouettes still work on the oldest headset.
    box(0, 0.054, -5.88, 5.45, 1.01, 0.48, 0x52372b);
    box(0, 0.59, -5.83, 5.60, 0.09, 0.68, 0x8b5e40);
    box(0, -0.32, -5.58, 5.34, 0.13, 0.06, 0x342820);
    for (let x = -2.43; x <= 2.5; x += 0.64) {
      box(x, 0.08, -5.619, 0.042, 0.77, 0.045, 0x936848);
    }
    for (const y of [0.83, 1.28, 1.63]) {
      box(-0.33, y, -6.30, 3.48, 0.075, 0.22, trim);
      part(glow, -0.33, y - 0.05, -6.171, 3.40, 0.025, 0.015, 0xb47239);
      const rng = stream('original-bar', String(y));
      for (let x = -1.96; x < 1.20; x += 0.18 + rng() * 0.10) {
        const h = 0.14 + rng() * 0.15;
        const radius = 0.037 + rng() * 0.016;
        const c = [0x7c633a, 0x476044, 0x9a6d48, 0x6b5145][Math.floor(rng() * 4)];
        cyl(x, y + 0.04 + h / 2, -6.265, radius, h, c);
        cyl(x, y + 0.04 + h + 0.025, -6.265, radius * 0.46, 0.05, c);
      }
    }
    // One bartender behind the bar; not part of the 30-seat audience.
    part(spheres, -1.43, 0.77, -6.025, 0.19, 0.33, 0.115, 0x343e42);
    part(spheres, -1.43, 1.18, -6.02, 0.115, 0.15, 0.11, 0xb47e5e);
    part(spheres, -1.43, 1.28, -6.045, 0.118, 0.065, 0.11, 0x382c27);
    part(spheres, -1.55, 0.67, -5.95, 0.07, 0.165, 0.065, 0x343e42, 0.4, 0, 0.12);
    part(spheres, -1.30, 0.67, -5.95, 0.07, 0.165, 0.065, 0x343e42, 0.4, 0, -0.12);
    box(1.81, 0.72, -5.80, 0.27, 0.22, 0.20, 0x27292a);
    box(1.81, 0.73, -5.687, 0.20, 0.10, 0.015, 0x535e50);
    for (const x of [-0.63, 0.19, 0.38, 2.21]) {
      cyl(x, 0.732, -5.73, 0.043, 0.19, 0xb9986d);
      cyl(x, 0.833, -5.73, 0.05, 0.012, 0xd9bd91);
    }

    // A side-on microphone stand, present at the correct scale.
    cyl(0.41, 0.024, -0.39, 0.22, 0.038, 0x202222);
    cyl(0.41, 0.73, -0.39, 0.015, 1.43, 0x292a29);
    cyl(0.41, 1.435, -0.39, 0.024, 0.085, 0x343736);
    cyl(0.41, 1.515, -0.36, 0.028, 0.175, 0x242525, -1.03);
    part(spheres, 0.41, 1.552, -0.293, 0.047, 0.05, 0.047, 0x929393);
    cyl(0, ceiling - 0.19, -0.10, 0.13, 0.23, 0x242322);
    part(glow, 0, ceiling - 0.31, -0.10, 0.15, 0.026, 0.15, 0xe5b478);
    for (const side of [-1, 1]) {
      for (const z of [-1.42, -3.55, -5.75]) {
        box(side * 2.91, 1.65, z, 0.12, 0.23, 0.24, 0x594235);
        part(glow, side * 2.84, 1.66, z, 0.035, 0.16, 0.17, 0xc79763);
      }
    }

    const solid = new THREE.MeshLambertMaterial({ color: 0xffffff });
    batch(this.group, new THREE.BoxGeometry(1, 1, 1), solid, boxes);
    batch(this.group, new THREE.CylinderGeometry(1, 1, 1, 10, 1), solid, cylinders);
    batch(this.group, new THREE.SphereGeometry(1, 10, 8), solid, spheres);
    batch(this.group, new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), glow);

    sign(this.group, 1.83, 0.45, -0.35, 2.03, -6.345, (ctx, w, h) => {
      ctx.fillStyle = '#312420'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#97734b'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#e4c492'; ctx.font = 'bold 62px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText('THE BACK ROOM', w / 2, h * 0.54);
      ctx.fillStyle = '#a99477'; ctx.font = '22px Georgia, serif';
      ctx.fillText('COMEDY  •  GOOD COMPANY', w / 2, h * 0.78);
    });
    sign(this.group, 0.62, 0.43, -2.985, 1.16, -2.8, (ctx, w, h) => {
      ctx.fillStyle = '#242f29'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#b69a6e'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e4ddc7'; ctx.font = 'bold 65px Georgia';
      ctx.fillText('OPEN MIC', w / 2, 113);
      ctx.font = '30px Georgia'; ctx.fillText('TONIGHT', w / 2, 173);
    }, Math.PI / 2);

    // Cheap, shadow-free theatre lighting; the pool is a soft floor texture.
    this.houseAmbient = new THREE.HemisphereLight(0xffdfbc, 0x7e6662, 0.82);
    this.frontLight = new THREE.PointLight(0xffcf9b, 14, 6.0, 2);
    this.frontLight.position.set(0, 2.06, -0.63);
    this.backLight = new THREE.PointLight(0xe6a96c, 4.3, 4.5, 2);
    this.backLight.position.set(-0.6, 1.85, -5.26);
    this.fillLight = new THREE.DirectionalLight(0xbcc2ce, 0.30);
    this.fillLight.position.set(2.4, 1.8, 0.55);
    this.fillLight.target.position.set(0, 0.7, -3.1);
    this.group.add(this.houseAmbient, this.frontLight, this.backLight, this.fillLight, this.fillLight.target);
    const radial = makeCanvas(128, 128);
    const gradient = radial.ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(255,216,153,.82)');
    gradient.addColorStop(0.62, 'rgba(255,193,119,.44)');
    gradient.addColorStop(1, 'rgba(255,160,100,0)');
    radial.ctx.fillStyle = gradient;
    radial.ctx.fillRect(0, 0, 128, 128);
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: canvasTexture(radial.canvas), transparent: true, depthWrite: false, toneMapped: false,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), this.poolMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.006, -0.08);
    this.group.add(pool);
    this.coneMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcc91, transparent: true, opacity: 0.022, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.16, 24, 1, true), this.coneMaterial);
    cone.position.set(0, 1.085, -0.10);
    cone.renderOrder = 4;
    this.group.add(cone);

    const timer = makeCanvas(512, 192);
    this.timerCtx = timer.ctx;
    this.timerTexture = canvasTexture(timer.canvas);
    this.timer = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.29),
      new THREE.MeshBasicMaterial({ map: this.timerTexture, toneMapped: false }));
    this.timer.position.set(2.20, 1.96, -6.34);
    this.group.add(this.timer);
    this.lastTimer = '';
    this.setLighting(CONFIG.defaultHouse, CONFIG.defaultSpotlight);
    this.updateTimer(300000, 'ready');
  }

  /** @param {number} house @param {number} spot */
  setLighting(house, spot) {
    this.houseAmbient.intensity = 0.16 + 0.90 * house;
    this.frontLight.intensity = 2 + 17 * house;
    this.backLight.intensity = 1 + 4.2 * house;
    this.fillLight.intensity = 0.08 + 0.37 * house;
    this.poolMaterial.opacity = 0.64 * spot;
    this.coneMaterial.opacity = 0.027 * spot;
  }

  /** @param {boolean} visible */
  setCountdown(visible) { this.timer.visible = visible; }

  /** @param {number} remainingMs @param {SessionState} state */
  updateTimer(remainingMs, state) {
    const label = formatTime(remainingMs);
    const key = state + '/' + label;
    if (key === this.lastTimer) return;
    this.lastTimer = key;
    const ctx = this.timerCtx, w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = '#171613'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#67513c'; ctx.lineWidth = 5; ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = state === 'finished' ? '#9f927d' : '#edd3a2';
    ctx.font = 'bold 114px monospace';
    ctx.fillText(label, w / 2, h * 0.46);
    ctx.fillStyle = '#a4937a'; ctx.font = '22px sans-serif';
    ctx.fillText(state === 'running' ? 'SET TIME' : state.toUpperCase(), w / 2, h * 0.86);
    this.timerTexture.needsUpdate = true;
  }
}
