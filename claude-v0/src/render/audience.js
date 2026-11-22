// @ts-check
/**
 * Draws the audience with instanced low-poly parts (one draw call per part type).
 * Faces have eyes, brows and a nose so you can tell which way someone is looking.
 * Gaze = head orientation only. These figures have painted eyes; there is no eye tracking.
 */

import * as THREE from 'three';
import { CONFIG } from '../config.js';

/** @typedef {import('../crowd.js').Member} Member */
/** @typedef {import('../crowd.js').ReactionPlan} ReactionPlan */

const B = CONFIG.body;
const V = CONFIG.venue;
const TAU = Math.PI * 2;

/** Arm pose: upper-arm forward swing, outward splay, elbow bend (radians). */
/** @typedef {{ up: number, out: number, fore: number }} ArmPose */
/** @type {Record<string, ArmPose>} */
const POSES = {
  lap: { up: -0.22, out: 0.12, fore: -1.15 },
  hold: { up: -0.3, out: 0.16, fore: -1.55 },
  sip: { up: -1.25, out: -0.25, fore: -3.3 },
  phone: { up: -0.15, out: -0.3, fore: -1.75 },
  clap: { up: -0.8, out: -0.32, fore: -1.6 },
  cover: { up: -1.2, out: -0.3, fore: -3.3 },
};

/** @param {number} a @param {number} b @param {number} k */
const lerp = (a, b, k) => a + (b - a) * k;
/** Frame-rate independent smoothing factor. @param {number} dt seconds @param {number} tau seconds */
const smooth = (dt, tau) => 1 - Math.exp(-dt / Math.max(tau, 1e-3));
/** @param {number} a */
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** Rise over `a` s, hold, fall over the last `r` fraction. @param {number} t @param {number} dur @param {number} [a] */
function envelope(t, dur, a = 0.15) {
  if (t < 0 || t > dur) return 0;
  const rise = Math.min(1, t / a);
  const fall = Math.min(1, (dur - t) / Math.max(0.2, dur * 0.35));
  return Math.min(rise, fall);
}

/**
 * @typedef {{
 *   m: Member,
 *   headYaw: number, headPitch: number, headRoll: number, bodyTurn: number, lean: number,
 *   arms: { left: ArmPose, right: ArmPose },
 *   react: null | { kind: string, start: number, end: number, gain: number },
 *   clapRate: number, laughStyle: number,
 * }} Figure
 */

export class AudienceView {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'audience';
    scene.add(this.group);
    /** @type {Figure[]} */
    this.figures = [];
    /** @type {Record<string, THREE.InstancedMesh>} */
    this.parts = {};
    // Reused maths objects (no allocation per frame).
    this._m = new THREE.Matrix4();
    this._body = new THREE.Matrix4();
    this._head = new THREE.Matrix4();
    this._arm = new THREE.Matrix4();
    this._tmp = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._hand = new THREE.Vector3();
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  /** Build meshes for a crowd. @param {Member[]} members */
  build(members) {
    this.dispose();
    const n = members.length;
    const P = CONFIG.palettes;
    const lam = () => new THREE.MeshLambertMaterial({ color: 0xffffff });

    /** @param {string} name @param {THREE.BufferGeometry} geo @param {THREE.Material} mat @param {number} count */
    const part = (name, geo, mat, count) => {
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.name = name;
      this.group.add(mesh);
      this.parts[name] = mesh;
      return mesh;
    };

    const torsoGeo = new THREE.CylinderGeometry(0.17, 0.14, B.hipToShoulder, 8).translate(0, B.hipToShoulder / 2, 0);
    torsoGeo.scale(1, 1, 0.62);
    const headGeo = new THREE.IcosahedronGeometry(B.headRadius, 1).scale(0.95, 1.12, 1.0);
    const capGeo = new THREE.SphereGeometry(B.headRadius * 1.07, 10, 6, 0, TAU, 0, Math.PI * 0.52);
    const brimGeo = new THREE.BoxGeometry(0.16, 0.012, 0.08);
    const eyeGeo = new THREE.SphereGeometry(0.019, 8, 6);
    const pupilGeo = new THREE.SphereGeometry(0.011, 6, 4);
    const browGeo = new THREE.BoxGeometry(0.042, 0.009, 0.01);
    const noseGeo = new THREE.BoxGeometry(0.022, 0.036, 0.03);
    const glassesGeo = new THREE.TorusGeometry(0.023, 0.0045, 4, 12);
    const upperGeo = new THREE.BoxGeometry(0.085, 0.27, 0.085).translate(0, -0.135, 0);
    const foreGeo = new THREE.BoxGeometry(0.075, 0.25, 0.075).translate(0, -0.125, 0);
    const handGeo = new THREE.IcosahedronGeometry(0.042, 0);
    const thighGeo = new THREE.BoxGeometry(0.14, 0.12, 0.42).translate(0, 0, 0.21);
    const shinGeo = new THREE.BoxGeometry(0.115, 0.42, 0.115).translate(0, -0.21, 0);
    const drinkGeo = new THREE.CylinderGeometry(0.036, 0.03, 0.14, 8);
    const phoneGeo = new THREE.BoxGeometry(0.075, 0.14, 0.01);

    const torso = part('torso', torsoGeo, lam(), n);
    const head = part('head', headGeo, lam(), n);
    const hair = part('hair', capGeo, lam(), n);
    const hat = part('hat', capGeo, lam(), n);
    const brim = part('brim', brimGeo, lam(), n);
    part('eye', eyeGeo, new THREE.MeshLambertMaterial({ color: 0xeeeae2 }), n * 2);
    part('pupil', pupilGeo, new THREE.MeshBasicMaterial({ color: 0x0b0b0b }), n * 2);
    const brow = part('brow', browGeo, lam(), n * 2);
    const nose = part('nose', noseGeo, lam(), n);
    part('glasses', glassesGeo, new THREE.MeshLambertMaterial({ color: 0x141414 }), n * 2);
    const upper = part('upper', upperGeo, lam(), n * 2);
    const fore = part('fore', foreGeo, lam(), n * 2);
    const hand = part('hand', handGeo, lam(), n * 2);
    const thigh = part('thigh', thighGeo, lam(), n * 2);
    const shin = part('shin', shinGeo, lam(), n * 2);
    part('drink', drinkGeo, new THREE.MeshLambertMaterial({ color: 0xc78a2c, emissive: 0x2a1404 }), n);
    part('phone', phoneGeo, new THREE.MeshBasicMaterial({ color: 0x9fc4ff }), n);

    const c = new THREE.Color();
    members.forEach((m, i) => {
      const L = m.look;
      const skin = c.setHex(P.skin[L.skin]).clone();
      const shirt = new THREE.Color(P.shirt[L.shirt]);
      const hairC = new THREE.Color(P.hair[L.hair]);
      torso.setColorAt(i, shirt);
      head.setColorAt(i, skin);
      nose.setColorAt(i, skin.clone().multiplyScalar(0.92));
      hair.setColorAt(i, hairC);
      hat.setColorAt(i, new THREE.Color(P.hat[L.hatColour]));
      brim.setColorAt(i, new THREE.Color(P.hat[L.hatColour]));
      for (const k of [0, 1]) {
        brow.setColorAt(i * 2 + k, L.hairStyle === 'bald' ? skin.clone().multiplyScalar(0.6) : hairC);
        upper.setColorAt(i * 2 + k, shirt);
        fore.setColorAt(i * 2 + k, shirt);
        hand.setColorAt(i * 2 + k, skin);
        thigh.setColorAt(i * 2 + k, new THREE.Color(P.trousers[L.trousers]));
        shin.setColorAt(i * 2 + k, new THREE.Color(P.trousers[L.trousers]));
      }
    });
    for (const mesh of Object.values(this.parts)) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.figures = members.map((m) => {
      const rest = m.look.drink ? POSES.hold : POSES.lap;
      return {
        m,
        headYaw: 0,
        headPitch: -0.1,
        headRoll: 0,
        bodyTurn: 0,
        lean: m.idle.lean,
        arms: {
          left: { ...(m.look.drink && m.look.drinkHand === 'left' ? rest : POSES.lap) },
          right: { ...(m.look.drink && m.look.drinkHand === 'right' ? rest : POSES.lap) },
        },
        react: null,
        clapRate: 3.6 + ((m.id * 0.37) % 1) * 1.6,
        laughStyle: m.id % 3,
      };
    });
    this.writeLegs();
  }

  /** Legs don't move, so their matrices are written once. */
  writeLegs() {
    const thigh = this.parts.thigh;
    const shin = this.parts.shin;
    const hipY = V.audienceFloorY + V.seatHeight;
    this.figures.forEach((f, i) => {
      const s = f.m.seat;
      this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      this._body.compose(this._v.set(s.x, hipY, s.z), this._q, this._s.set(1, 1, 1));
      [-1, 1].forEach((side, k) => {
        const x = side * 0.1 * f.m.look.widthScale;
        thigh.setMatrixAt(i * 2 + k, this._m.copy(this._body).multiply(this._tmp.makeTranslation(x, 0.02, -0.05)));
        shin.setMatrixAt(i * 2 + k, this._m.copy(this._body).multiply(this._tmp.makeTranslation(x, 0.02, 0.37)));
      });
    });
    thigh.instanceMatrix.needsUpdate = true;
    shin.instanceMatrix.needsUpdate = true;
  }

  /** @param {ReactionPlan} plan @param {number} now ms */
  onReaction(plan, now) {
    for (const p of plan.participants) {
      const f = this.figures[p.memberId];
      if (!f) continue;
      const start = now + p.delayMs;
      f.react = { kind: plan.kind, start, end: start + p.durationMs, gain: p.gain };
    }
  }

  /** @param {{ kind: string, memberId?: number, durationMs?: number }} e @param {number} now */
  onAmbient(e, now) {
    if (e.kind !== 'cough' || e.memberId === undefined) return;
    const f = this.figures[e.memberId];
    if (f) f.react = { kind: 'cough', start: now, end: now + (e.durationMs ?? 700), gain: 1 };
  }

  /** @param {number} now */
  cancel(now) {
    for (const f of this.figures) {
      if (f.react && f.react.end > now) f.react.end = Math.min(f.react.end, now + 300);
      if (f.react && f.react.start > now) f.react = null;
    }
  }

  /**
   * @param {number} now ms
   * @param {number} dt seconds since last frame
   * @param {THREE.Vector3} performer world position of the performer's head
   */
  update(now, dt, performer) {
    if (!this.figures.length) return;
    const P = this.parts;
    const t = now / 1000;
    const hipY = V.audienceFloorY + V.seatHeight;
    const up = this._v;

    this.figures.forEach((f, i) => {
      const m = f.m;
      const L = m.look;
      const I = m.idle;
      const s = m.seat;

      // --- Reaction envelope ---
      let laugh = 0;
      let clap = 0;
      let cough = 0;
      let rt = 0;
      const r = f.react;
      if (r) {
        if (now >= r.end) f.react = null;
        else if (now >= r.start) {
          rt = (now - r.start) / 1000;
          const e = envelope(rt, (r.end - r.start) / 1000) * Math.min(1.2, r.gain + 0.2);
          if (r.kind === 'applause') clap = e;
          else if (r.kind === 'cough') cough = e;
          else laugh = e * (r.kind === 'titter' ? 0.45 : r.kind === 'ripple' ? 0.75 : 1);
        }
      }

      // --- Where to look ---
      const neckY = hipY + B.hipToShoulder * L.torsoScale + 0.04;
      const dx = performer.x - s.x;
      const dy = performer.y - neckY;
      const dz = performer.z - s.z;
      const towardYaw = wrapAngle(Math.atan2(dx, dz) - s.yaw);
      const towardPitch = Math.atan2(dy, Math.hypot(dx, dz));
      let yaw = towardYaw + I.gazeOffsetYaw;
      let pitch = towardPitch + I.gazeOffsetPitch;
      let lag = I.gazeLagMs / 1000;
      const reacting = laugh > 0 || clap > 0;
      if (!reacting) {
        switch (m.attention) {
          case 'drink':
            yaw = (L.drinkHand === 'right' ? -0.25 : 0.25) * 0.6;
            pitch = -0.45;
            lag *= 1.5;
            break;
          case 'down':
            yaw = 0.1 * I.neighbourSide;
            pitch = -0.6;
            lag *= 1.5;
            break;
          case 'phone':
            yaw = 0;
            pitch = -0.75;
            lag *= 1.5;
            break;
          case 'neighbour':
            yaw = I.neighbourSide * 1.05;
            pitch = -0.08 + 0.04 * Math.sin(t * 5.1 + I.breathPhase);
            lag *= 1.3;
            break;
          default:
            break;
        }
      }
      // Small, living head movements.
      yaw += 0.03 * Math.sin(t * 0.7 + I.swayPhase) + 0.015 * Math.sin(t * 2.3 + I.breathPhase);
      pitch += 0.02 * Math.sin(t * 0.9 + I.breathPhase * 1.3);
      // Laughing: head back (or doubled forward) with a shake.
      const style = f.laughStyle;
      pitch += laugh * (style === 0 ? -0.25 : 0.28) + laugh * 0.05 * Math.sin(rt * TAU * 5.5);
      pitch -= cough * (0.25 + 0.1 * Math.sin(rt * TAU * 3));
      yaw = Math.max(-1.25, Math.min(1.25, yaw));
      pitch = Math.max(-0.85, Math.min(0.6, pitch));
      const k = smooth(dt, lag);
      f.headYaw = lerp(f.headYaw, yaw, k);
      f.headPitch = lerp(f.headPitch, pitch, k);
      f.headRoll = lerp(f.headRoll, laugh * 0.12 * (style === 2 ? -1 : 1) + 0.03 * Math.sin(t * 0.5 + I.swayPhase), smooth(dt, 0.25));

      // Front rows turn their bodies a little towards you.
      const turnShare = s.row === 0 ? 0.3 : s.row === 1 ? 0.2 : 0.1;
      f.bodyTurn = lerp(f.bodyTurn, f.headYaw * turnShare, smooth(dt, 1.5));
      const leanTarget = I.lean + laugh * (style === 0 ? 0.18 : -0.12) + (m.attention === 'phone' ? 0.1 : 0) + clap * 0.05;
      f.lean = lerp(f.lean, leanTarget, smooth(dt, 0.4));

      // --- Body ---
      const breath = 1 + 0.012 * Math.sin(t * TAU * I.breathRate + I.breathPhase);
      const shake = laugh * 0.011 * Math.sin(rt * TAU * 6.2) + cough * 0.012 * Math.sin(rt * TAU * 4);
      const sway = 0.02 * Math.sin(t * TAU * I.swayRate + I.swayPhase);
      // Positive lean tips the torso forward, towards the stage.
      this._e.set(f.lean, s.yaw + f.bodyTurn, sway, 'YXZ');
      this._q.setFromEuler(this._e);
      this._body.compose(up.set(s.x, hipY + shake, s.z), this._q, this._s.set(1, 1, 1));
      this._m.copy(this._body).multiply(this._tmp.makeScale(L.widthScale, L.torsoScale * breath, Math.min(1.15, L.widthScale)));
      P.torso.setMatrixAt(i, this._m);

      // --- Head and face ---
      const shoulderY = B.hipToShoulder * L.torsoScale * breath;
      // Head angles are relative to the body, so undo the body's turn and lean.
      this._e.set(-f.headPitch - f.lean, f.headYaw - f.bodyTurn, f.headRoll, 'YXZ');
      this._q.setFromEuler(this._e);
      this._head
        .copy(this._body)
        .multiply(this._tmp.makeTranslation(0, shoulderY + 0.04, 0))
        .multiply(this._m.makeRotationFromQuaternion(this._q))
        .multiply(this._tmp.makeTranslation(0, 0.15 * L.headScale, 0))
        .multiply(this._m.makeScale(L.headScale, L.headScale, L.headScale));
      P.head.setMatrixAt(i, this._head);

      // Hair: a cap tipped back so the forehead and brows show. Long hair hangs lower at the back.
      const long = L.hairStyle === 'long';
      const showHair = L.hairStyle !== 'bald' && (!L.hat || long);
      if (showHair) {
        this._m
          .copy(this._head)
          .multiply(this._tmp.makeTranslation(0, long ? -0.012 : 0.008, -0.006))
          .multiply(this._tmp.makeRotationX(long ? -0.35 : -0.55));
        if (long) this._m.multiply(this._tmp.makeScale(1.05, 1.3, 1.08));
        P.hair.setMatrixAt(i, this._m);
      } else {
        P.hair.setMatrixAt(i, this.hidden);
      }
      if (L.hat) {
        P.hat.setMatrixAt(i, this._m.copy(this._head).multiply(this._tmp.makeTranslation(0, 0.022, -0.004)).multiply(this._tmp.makeRotationX(-0.4)).multiply(this._tmp.makeScale(1.05, 1.0, 1.05)));
        if (L.hat === 'cap') P.brim.setMatrixAt(i, this._m.copy(this._head).multiply(this._tmp.makeTranslation(0, 0.055, 0.1)));
        else P.brim.setMatrixAt(i, this.hidden);
      } else {
        P.hat.setMatrixAt(i, this.hidden);
        P.brim.setMatrixAt(i, this.hidden);
      }
      [-1, 1].forEach((side, kk) => {
        const j = i * 2 + kk;
        P.eye.setMatrixAt(j, this._m.copy(this._head).multiply(this._tmp.makeTranslation(side * 0.036, 0.016, 0.083)));
        P.pupil.setMatrixAt(j, this._m.copy(this._head).multiply(this._tmp.makeTranslation(side * 0.036, 0.016, 0.1)));
        this._m.copy(this._head).multiply(this._tmp.makeTranslation(side * 0.036, 0.047 + laugh * 0.008, 0.094));
        P.brow.setMatrixAt(j, this._m.multiply(this._tmp.makeRotationZ(side * -0.12)));
        if (L.glasses) P.glasses.setMatrixAt(j, this._m.copy(this._head).multiply(this._tmp.makeTranslation(side * 0.036, 0.016, 0.104)));
        else P.glasses.setMatrixAt(j, this.hidden);
      });
      P.nose.setMatrixAt(i, this._m.copy(this._head).multiply(this._tmp.makeTranslation(0, -0.012, 0.102)));

      // --- Arms ---
      const sip = m.attention === 'drink' && L.drink ? Math.max(0, Math.sin(Math.min(1, (now - m.attentionSince) / 2500) * Math.PI)) : 0;
      const phone = m.attention === 'phone' ? 1 : 0;
      let handWorld = null;
      for (const side of /** @type {const} */ (['left', 'right'])) {
        const sign = side === 'left' ? -1 : 1;
        const holdsDrink = L.drink && L.drinkHand === side;
        /** @type {ArmPose} */
        let target = holdsDrink ? POSES.hold : POSES.lap;
        if (holdsDrink && sip > 0.3) target = POSES.sip;
        if (phone) target = POSES.phone;
        if (clap > 0.05) target = POSES.clap;
        if (cough > 0.05 && !holdsDrink && side === 'left') target = POSES.cover;
        const a = f.arms[side];
        const kk = smooth(dt, 0.28);
        a.up = lerp(a.up, target.up, kk);
        a.out = lerp(a.out, target.out, kk);
        a.fore = lerp(a.fore, target.fore, kk);
        const clapSwing = clap > 0.05 ? clap * 0.12 * Math.sin(rt * TAU * f.clapRate + (side === 'left' ? 0 : Math.PI)) : 0;
        const j = i * 2 + (side === 'left' ? 0 : 1);
        this._arm
          .copy(this._body)
          .multiply(this._tmp.makeTranslation(sign * 0.19 * L.widthScale, shoulderY - 0.03, 0))
          .multiply(this._m.makeRotationZ(sign * (a.out + clapSwing)))
          .multiply(this._tmp.makeRotationX(a.up));
        P.upper.setMatrixAt(j, this._arm);
        this._arm.multiply(this._tmp.makeTranslation(0, -0.27, 0)).multiply(this._m.makeRotationX(a.fore - a.up));
        P.fore.setMatrixAt(j, this._arm);
        this._arm.multiply(this._tmp.makeTranslation(0, -0.26, 0));
        P.hand.setMatrixAt(j, this._arm);
        if (holdsDrink) handWorld = this._hand.setFromMatrixPosition(this._arm);
      }

      // Drink stays upright in the hand.
      if (handWorld) {
        this._q.setFromAxisAngle(this._s.set(0, 1, 0), s.yaw);
        const tilt = sip > 0.3 ? 0.5 * sip : 0;
        this._m.compose(handWorld, this._q, this._s.set(1, 1, 1)).multiply(this._tmp.makeRotationX(tilt)).multiply(this._tmp.makeTranslation(0, 0.05, 0));
        P.drink.setMatrixAt(i, this._m);
      } else {
        P.drink.setMatrixAt(i, this.hidden);
      }
      if (phone) {
        this._m.copy(this._body).multiply(this._tmp.makeTranslation(0, shoulderY - 0.2, 0.32)).multiply(this._tmp.makeRotationX(-0.9));
        P.phone.setMatrixAt(i, this._m);
      } else {
        P.phone.setMatrixAt(i, this.hidden);
      }
    });

    for (const name of ['torso', 'head', 'hair', 'hat', 'brim', 'eye', 'pupil', 'brow', 'nose', 'glasses', 'upper', 'fore', 'hand', 'drink', 'phone']) {
      P[name].instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const mesh of Object.values(this.parts)) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat.dispose();
      mesh.dispose();
    }
    this.parts = {};
    this.figures = [];
  }
}
