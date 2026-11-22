// @ts-check
/**
 * The venue: an intimate pub back room. Stage surface at y = 0 (your real floor in VR),
 * audience floor 0.45 m below, brick wall behind you, chairs, a bar at the back,
 * a fake spotlight and an adjustable house-light level.
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildSeats } from '../crowd.js';

const V = CONFIG.venue;

/** Cheap deterministic hash for visual-only variation (not the crowd seed). @param {number} n */
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function brickTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.fillStyle = '#2b1d18';
  g.fillRect(0, 0, 256, 256);
  const bw = 64;
  const bh = 24;
  let n = 0;
  for (let row = 0; row * bh < 256; row++) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 256 + bw; x += bw) {
      const v = hash01(n++);
      const r = Math.round(110 + v * 50);
      const gr = Math.round(48 + v * 22);
      const b = Math.round(36 + v * 16);
      g.fillStyle = `rgb(${r},${gr},${b})`;
      g.fillRect(x + offset + 2, row * bh + 2, bw - 4, bh - 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,240,215,1)');
  grad.addColorStop(0.55, 'rgba(255,235,205,0.55)');
  grad.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** @param {string} text @param {string} colour @param {string} bg */
function labelTexture(text, colour, bg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = colour;
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** @param {number} color */
const lambert = (color) => new THREE.MeshLambertMaterial({ color });

/**
 * @param {THREE.Scene} scene
 * @param {{ house: number, spot: number }} lighting
 */
export function buildRoom(scene, lighting) {
  const group = new THREE.Group();
  group.name = 'room';
  scene.add(group);

  const floorY = V.audienceFloorY;
  const wallH = V.ceilingY - floorY;
  const roomDepth = V.stageBackZ - V.roomBackZ;
  const midZ = (V.stageBackZ + V.roomBackZ) / 2;

  // --- Floors and stage -------------------------------------------------------
  const audienceFloor = new THREE.Mesh(new THREE.PlaneGeometry(V.roomWidth, V.stageFrontZ - V.roomBackZ), lambert(0x3a291e));
  audienceFloor.rotation.x = -Math.PI / 2;
  audienceFloor.position.set(0, floorY, (V.stageFrontZ + V.roomBackZ) / 2);
  group.add(audienceFloor);

  const stageDepth = V.stageBackZ - V.stageFrontZ;
  const stage = new THREE.Mesh(new THREE.BoxGeometry(V.stageWidth, -floorY, stageDepth), lambert(0x18181a));
  stage.position.set(0, floorY / 2, (V.stageBackZ + V.stageFrontZ) / 2);
  group.add(stage);

  // Floor either side of the stage, at audience level.
  const sideW = (V.roomWidth - V.stageWidth) / 2;
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(sideW, stageDepth), lambert(0x3a291e));
    f.rotation.x = -Math.PI / 2;
    f.position.set(side * (V.stageWidth / 2 + sideW / 2), floorY, stage.position.z);
    group.add(f);
  }

  // White tape along the stage edge, so you can see where the stage ends.
  const tape = new THREE.Mesh(new THREE.BoxGeometry(V.stageWidth, 0.004, 0.04), new THREE.MeshBasicMaterial({ color: 0x9a978c }));
  tape.position.set(0, 0.002, V.stageFrontZ + 0.03);
  group.add(tape);

  // --- Walls and ceiling ------------------------------------------------------
  const wallMat = lambert(0x4a2226);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(roomDepth, wallH), wallMat);
    wall.rotation.y = -side * Math.PI / 2;
    wall.position.set(side * V.roomWidth / 2, floorY + wallH / 2, midZ);
    group.add(wall);
  }
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(V.roomWidth, wallH), wallMat);
  backWall.position.set(0, floorY + wallH / 2, V.roomBackZ);
  group.add(backWall);

  const bricks = brickTexture();
  bricks.repeat.set(V.roomWidth / 1.6, wallH / 1.6);
  const brickWall = new THREE.Mesh(new THREE.PlaneGeometry(V.roomWidth, wallH), new THREE.MeshLambertMaterial({ map: bricks }));
  brickWall.rotation.y = Math.PI;
  brickWall.position.set(0, floorY + wallH / 2, V.stageBackZ);
  group.add(brickWall);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(V.roomWidth, roomDepth), lambert(0x161618));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, V.ceilingY, midZ);
  group.add(ceiling);

  // --- Chairs (all 30, so empty seats show) ------------------------------------
  const seats = buildSeats();
  const chairMat = lambert(0x2a1c14);
  const seatGeo = new THREE.BoxGeometry(0.42, 0.04, 0.4);
  const backGeo = new THREE.BoxGeometry(0.42, 0.42, 0.035);
  const legGeo = new THREE.BoxGeometry(0.03, V.seatHeight, 0.03);
  const seatMesh = new THREE.InstancedMesh(seatGeo, chairMat, seats.length);
  const backMesh = new THREE.InstancedMesh(backGeo, chairMat, seats.length);
  const legMesh = new THREE.InstancedMesh(legGeo, chairMat, seats.length * 4);
  const m = new THREE.Matrix4();
  const chair = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  seats.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw);
    chair.compose(new THREE.Vector3(s.x, floorY, s.z), q, new THREE.Vector3(1, 1, 1));
    seatMesh.setMatrixAt(i, m.copy(chair).multiply(new THREE.Matrix4().makeTranslation(0, V.seatHeight - 0.02, -0.03)));
    backMesh.setMatrixAt(i, m.copy(chair).multiply(new THREE.Matrix4().makeTranslation(0, V.seatHeight + 0.21, -0.23)));
    let k = 0;
    for (const lx of [-0.18, 0.18]) {
      for (const lz of [-0.2, 0.15]) {
        legMesh.setMatrixAt(i * 4 + k++, m.copy(chair).multiply(new THREE.Matrix4().makeTranslation(lx, V.seatHeight / 2, lz)));
      }
    }
  });
  group.add(seatMesh, backMesh, legMesh);

  // --- Bar at the back ------------------------------------------------------------
  const barZ = V.roomBackZ + 1.0;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.05, 0.55), lambert(0x2e1d12));
  bar.position.set(0, floorY + 0.525, barZ);
  group.add(bar);
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.04, 0.65), lambert(0x4a3020));
  barTop.position.set(0, floorY + 1.07, barZ);
  group.add(barTop);

  const shelfGlow = new THREE.MeshBasicMaterial({ color: 0x6b4a22 });
  for (const h of [1.35, 1.75]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 0.2), shelfGlow);
    shelf.position.set(0, floorY + h, V.roomBackZ + 0.12);
    group.add(shelf);
  }
  const bottleGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.26, 6);
  const bottleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bottles = new THREE.InstancedMesh(bottleGeo, bottleMat, 32);
  const bottleColours = [0x7a4a14, 0x2f5a2a, 0x8a7a50, 0x5a1f1f, 0x40506a];
  for (let i = 0; i < 32; i++) {
    const shelfH = i < 16 ? 1.35 : 1.75;
    const x = -1.5 + (i % 16) * 0.2 + hash01(i) * 0.06;
    bottles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, floorY + shelfH + 0.145, V.roomBackZ + 0.12));
    bottles.setColorAt(i, new THREE.Color(bottleColours[Math.floor(hash01(i + 50) * bottleColours.length)]));
  }
  group.add(bottles);

  // A bartender, mostly in silhouette.
  const tender = new THREE.Group();
  const tenderMat = lambert(0x1b1d22);
  const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.6, 8), tenderMat);
  tBody.position.y = floorY + 1.1;
  const tHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), lambert(0x8d6a52));
  tHead.position.y = floorY + 1.55;
  tender.add(tBody, tHead);
  tender.position.set(-0.9, 0, V.roomBackZ + 0.5);
  group.add(tender);

  // Exit sign and door, for that unmistakable venue feel.
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), new THREE.MeshBasicMaterial({ map: labelTexture('EXIT', '#e8ffe8', '#0b7a3a') }));
  exitSign.rotation.y = -Math.PI / 2;
  exitSign.position.set(V.roomWidth / 2 - 0.01, floorY + 2.35, V.roomBackZ + 2.6);
  group.add(exitSign);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.05), lambert(0x15100c));
  door.rotation.y = -Math.PI / 2;
  door.position.set(V.roomWidth / 2 - 0.012, floorY + 1.025, V.roomBackZ + 2.6);
  group.add(door);

  // Wall lights along the sides (brightness follows the house lights).
  const sconceMat = new THREE.MeshBasicMaterial({ color: 0xffc27a });
  const sconceGeo = new THREE.BoxGeometry(0.06, 0.14, 0.1);
  for (const side of [-1, 1]) {
    for (const z of [-2.6, -4.6, -6.6]) {
      const s = new THREE.Mesh(sconceGeo, sconceMat);
      s.position.set(side * (V.roomWidth / 2 - 0.04), floorY + 2.0, z);
      group.add(s);
    }
  }

  // --- Mic stand -------------------------------------------------------------------
  const metal = lambert(0x1c1c1e);
  const stand = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.02, 12), metal);
  base.position.y = 0.01;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.42, 6), metal);
  pole.position.y = 0.72;
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), metal);
  clip.position.y = 1.45;
  const standMic = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.013, 0.17, 8), metal);
  const grille = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), lambert(0x6b6b70));
  grille.position.y = 0.1;
  standMic.add(handle, grille);
  standMic.position.y = 1.52;
  standMic.rotation.x = -0.5;
  stand.add(base, pole, clip, standMic);
  stand.position.set(V.micStand.x, 0, V.micStand.z);
  group.add(stand);

  // --- Lighting -------------------------------------------------------------------
  const ambient = new THREE.AmbientLight(0xffe2c4, 0.4);
  scene.add(ambient);

  // Stage wash: lights the stage, spills onto the front rows, fades towards the back.
  const wash = new THREE.PointLight(0xfff0dc, 30, 11, 2);
  wash.position.set(0, 2.6, -1.4);
  scene.add(wash);

  // Warm light behind the bar.
  const barLight = new THREE.PointLight(0xffa860, 4, 4, 2);
  barLight.position.set(0, floorY + 2.2, V.roomBackZ + 0.6);
  scene.add(barLight);

  // Fake spotlight: a soft pool on the stage, a faint beam, and a bright lamp you can see.
  const poolTex = radialTexture();
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 32),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.003, -0.1);
  group.add(pool);

  const lampPos = new THREE.Vector3(0, V.ceilingY - 0.18, V.spotLampZ);
  const beamLen = lampPos.distanceTo(new THREE.Vector3(0, 0, -0.1));
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.85, beamLen, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2dc, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.copy(lampPos).add(new THREE.Vector3(0, 0, -0.1)).multiplyScalar(0.5);
  beam.lookAt(lampPos);
  beam.rotateX(Math.PI / 2);
  group.add(beam);

  const lampCan = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 10), metal);
  lampCan.position.copy(lampPos);
  lampCan.lookAt(0, 0, -0.1);
  lampCan.rotateX(Math.PI / 2);
  group.add(lampCan);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.095, 20), new THREE.MeshBasicMaterial({ color: 0xfff6e8 }));
  lens.position.copy(lampPos).add(new THREE.Vector3(0, -0.13, 0.12));
  lens.lookAt(0, 1.6, 0);
  group.add(lens);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }),
  );
  glow.position.copy(lens.position);
  glow.lookAt(0, 1.6, 0);
  group.add(glow);

  // --- Countdown on the back wall --------------------------------------------------------
  const cdCanvas = document.createElement('canvas');
  cdCanvas.width = 256;
  cdCanvas.height = 96;
  const cdTex = new THREE.CanvasTexture(cdCanvas);
  cdTex.colorSpace = THREE.SRGBColorSpace;
  const countdown = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), new THREE.MeshBasicMaterial({ map: cdTex }));
  countdown.position.set(1.2, floorY + 2.3, V.roomBackZ + 0.02);
  group.add(countdown);
  let lastCountdown = '';

  /** @param {number} house 0–1 @param {number} spot 0–1.5 */
  function setLighting(house, spot) {
    ambient.intensity = 0.05 + house * 0.7;
    barLight.intensity = 1.5 + house * 6;
    wash.intensity = 6 + spot * 26;
    sconceMat.color.setRGB(0.25 + house * 0.75, 0.17 + house * 0.55, 0.08 + house * 0.38);
    shelfGlow.color.setRGB(0.25 + house * 0.3, 0.17 + house * 0.2, 0.07 + house * 0.08);
    /** @type {THREE.MeshBasicMaterial} */ (pool.material).opacity = 0.12 + spot * 0.28;
    /** @type {THREE.MeshBasicMaterial} */ (beam.material).opacity = 0.01 + spot * 0.03;
    /** @type {THREE.MeshBasicMaterial} */ (glow.material).opacity = 0.2 + spot * 0.5;
  }
  setLighting(lighting.house, lighting.spot);

  /** @param {string | null} text null hides the display @param {boolean} [urgent] */
  function setCountdown(text, urgent = false) {
    countdown.visible = text !== null;
    const key = `${text}|${urgent}`;
    if (text === null || key === lastCountdown) return;
    lastCountdown = key;
    const g = /** @type {CanvasRenderingContext2D} */ (cdCanvas.getContext('2d'));
    g.fillStyle = '#080404';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = urgent ? '#ff3b2f' : '#c23a28';
    g.font = 'bold 72px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 52);
    cdTex.needsUpdate = true;
  }

  /** Show the mic in the stand, or leave the clip empty when you hold it. @param {boolean} has */
  function setStandHasMic(has) {
    standMic.visible = has;
  }

  return { group, setLighting, setCountdown, setStandHasMic, seats };
}
