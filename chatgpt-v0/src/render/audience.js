// @ts-check

import * as THREE from 'three';
import { CONFIG, clamp } from '../config.js';
import { attentionAt } from '../crowd.js';

/** @typedef {import('../crowd.js').Member} Member */
/** @typedef {import('../events.js').ReactionEvent} ReactionEvent */
/** @typedef {import('../events.js').ReactionKind} ReactionKind */
/** @typedef {{parent:THREE.Object3D, local:THREE.Matrix4, colour:number}} Part */
/** @typedef {{kind:ReactionKind, start:number, end:number, strength:number}} Cue */
const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const delta = new THREE.Vector3();
const scratch = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();

/** Fixed shapes, independently articulated by small local pose trees.
 * Every person, face, arm and item of clothing is rendered in a handful
 * of instanced batches rather than as hundreds of individual draw calls. */
class PartBatch {
  /** @param {THREE.BufferGeometry} geometry @param {THREE.MeshLambertMaterial} material */
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    /** @type {Part[]} */
    this.parts = [];
    /** @type {THREE.InstancedMesh | null} */
    this.mesh = null;
    this.matrix = new THREE.Matrix4();
  }

  /** @param {THREE.Object3D} parent @param {number} x @param {number} y @param {number} z
   * @param {number} sx @param {number} sy @param {number} sz @param {number} colour
   * @param {number} [rx] @param {number} [ry] @param {number} [rz] */
  add(parent, x, y, z, sx, sy, sz, colour, rx = 0, ry = 0, rz = 0) {
    const pose = new THREE.Object3D();
    pose.position.set(x, y, z);
    pose.scale.set(sx, sy, sz);
    pose.rotation.set(rx, ry, rz);
    pose.updateMatrix();
    this.parts.push({ parent, local: pose.matrix.clone(), colour });
  }

  /** @param {THREE.Group} group */
  finish(group) {
    if (this.parts.length === 0) return;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.parts.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The small enclosed room always fits within the batch; avoiding
    // stale instance bounding volumes is cheaper than recomputing them.
    this.mesh.frustumCulled = false;
    const colour = new THREE.Color();
    this.parts.forEach((part, i) => this.mesh?.setColorAt(i, colour.setHex(part.colour)));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    group.add(this.mesh);
  }

  update() {
    const mesh = this.mesh;
    if (!mesh) return;
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      this.matrix.multiplyMatrices(part.parent.matrixWorld, part.local);
      mesh.setMatrixAt(i, this.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh?.dispose();
    this.geometry.dispose();
  }
}

/** @typedef {{head:PartBatch, body:PartBatch, fine:PartBatch, box:PartBatch, cap:PartBatch, cup:PartBatch}} Batches */

/** @param {THREE.Object3D} node @param {THREE.Vector3} start @param {THREE.Vector3} end @param {number} radius */
function poseSegment(node, start, end, radius) {
  delta.subVectors(end, start);
  const length = Math.max(0.001, delta.length());
  node.position.copy(start).addScaledVector(delta, 0.5);
  node.quaternion.setFromUnitVectors(Y_AXIS, delta.multiplyScalar(1 / length));
  node.scale.set(radius, length / 2 + radius * 0.27, radius);
}

/** @param {THREE.Object3D} parent @param {PartBatch} batch @param {number} colour */
function segmentNode(parent, batch, colour) {
  const node = new THREE.Object3D();
  parent.add(node);
  batch.add(node, 0, 0, 0, 1, 1, 1, colour);
  return node;
}

class Actor {
  /** @param {Member} member @param {Batches} parts */
  constructor(member, parts) {
    this.member = member;
    this.root = new THREE.Object3D();
    this.root.position.set(member.seat.x, CONFIG.audienceFloor, member.seat.z);
    this.body = new THREE.Object3D();
    this.body.position.y = 0.53;
    this.body.rotation.order = 'YXZ';
    this.root.add(this.body);
    this.head = new THREE.Object3D();
    this.head.rotation.order = 'YXZ';
    this.head.position.set(0, 0.687 * member.height, 0.025);
    this.body.add(this.head);
    this.yaw = 0;
    this.pitch = -0.2;
    this.bodyYaw = 0;
    /** @type {Cue[]} */
    this.cues = [];
    this.active = false;
    this.attentive = true;
    const m = member, w = m.build, h = m.height;
    const body = this.body, head = this.head, root = this.root;
    const headWidth = 0.128 * Math.pow(w, 0.27), headHeight = 0.163 * Math.pow(h, 0.35);

    // Jacket or jumper, neck and a little collar/neckline.
    parts.body.add(body, 0, 0.245 * h, -0.004, 0.222 * w, 0.302 * h, 0.157 * w, m.shirt);
    parts.body.add(body, 0, 0.445 * h, 0.006, 0.205 * w, 0.109, 0.128 * w, m.shirt);
    parts.body.add(body, 0, 0.548 * h, 0.013, 0.078 * w, 0.113 * h, 0.073, m.skin);
    parts.body.add(body, 0, 0.475 * h, 0.026, 0.094, 0.036, 0.123, 0x292728);
    if (m.style % 3 === 0) {
      parts.box.add(body, 0, 0.25 * h, 0.154 * w, 0.016, 0.35 * h, 0.012, 0x292b2b);
    } else if (m.style % 3 === 1) {
      parts.body.add(body, -0.105 * w, 0.345 * h, 0.132 * w, 0.058, 0.037, 0.017, 0xd0bfa4);
    }

    // Seated legs (chair geometry lives in Room, including empty chairs).
    for (const side of [-1, 1]) {
      const x = side * 0.112 * w;
      const upper = segmentNode(root, parts.body, m.trousers);
      poseSegment(upper, a.set(x, 0.475, 0.015), b.set(x + side * 0.012, 0.45, 0.38), 0.099 * w);
      const lower = segmentNode(root, parts.body, m.trousers);
      poseSegment(lower, a.set(x + side * 0.012, 0.45, 0.38), b.set(x + side * 0.025, 0.105, 0.42), 0.073 * w);
      parts.body.add(root, x + side * 0.025, 0.068, 0.454, 0.082 * w, 0.063, 0.144, 0x292727);
    }

    parts.head.add(head, 0, 0, 0, headWidth, headHeight, 0.122, m.skin);
    parts.fine.add(head, -headWidth * 0.96, -0.01, -0.015, 0.026, 0.045, 0.025, m.skin);
    parts.fine.add(head, headWidth * 0.96, -0.01, -0.015, 0.026, 0.045, 0.025, m.skin);

    // Individual silhouettes, including bald heads, long hair, flat caps,
    // beanies and a tied bun. All are original procedural shapes.
    if (m.style !== 4) {
      const hat = m.style === 5 || m.style === 6;
      parts.cap.add(head, 0, 0.043, -0.008, headWidth * 1.05, headHeight * 0.93,
        hat ? 0.136 : 0.127, hat ? (m.style === 5 ? 0x545144 : 0x75614a) : m.hair);
      if (m.style === 2 || m.style === 3 || m.style === 7) {
        parts.body.add(head, 0, -0.044, -0.082, headWidth * 0.99,
          m.style === 3 ? 0.188 : 0.119, 0.069, m.hair);
      }
      if (m.style === 6) {
        parts.body.add(head, 0, 0.092, 0.106, 0.123, 0.017, 0.079, 0x75614a);
      }
      if (m.style === 7) {
        parts.body.add(head, 0.015, 0.155, -0.078, 0.066, 0.061, 0.066, m.hair);
      }
    }

    // Deliberately readable faces. The eye direction is painted onto the
    // rotating head; we never infer or simulate actual tracked eye gaze.
    for (const side of [-1, 1]) {
      const x = side * 0.048;
      parts.fine.add(head, x, 0.026, 0.110, 0.030, 0.024, 0.022, 0xe6ddd0);
      parts.fine.add(head, x, 0.026, 0.130, 0.013, 0.015, 0.008, 0x332b28);
      parts.box.add(head, x, 0.059, 0.115, 0.052, 0.011, 0.015, m.hair, 0, 0, side * -0.08);
      if (m.glasses) {
        for (const sy of [-1, 1]) {
          parts.box.add(head, x, 0.026 + sy * 0.032, 0.136, 0.071, 0.006, 0.009, 0x24272a);
        }
        for (const sx of [-1, 1]) {
          parts.box.add(head, x + sx * 0.033, 0.026, 0.136, 0.006, 0.064, 0.009, 0x24272a);
        }
      }
    }
    if (m.glasses) parts.box.add(head, 0, 0.035, 0.141, 0.028, 0.008, 0.009, 0x24272a);
    parts.fine.add(head, 0, -0.014, 0.132, 0.024, 0.036, 0.030, m.skin);
    if (m.beard) {
      parts.fine.add(head, 0, -0.087, 0.079, 0.086, 0.068, 0.052, m.hair);
    }
    this.mouth = new THREE.Object3D();
    this.mouth.position.set(0, -0.067, m.beard ? 0.134 : 0.108);
    this.head.add(this.mouth);
    parts.fine.add(this.mouth, 0, 0, 0, 0.042, 0.010, 0.016, 0x643f39);

    // Two cheap articulated arms, moving independently of the head.
    this.leftUpper = segmentNode(body, parts.body, m.shirt);
    this.leftLower = segmentNode(body, parts.body, m.shirt);
    this.rightUpper = segmentNode(body, parts.body, m.shirt);
    this.rightLower = segmentNode(body, parts.body, m.shirt);
    this.leftHand = new THREE.Object3D();
    this.rightHand = new THREE.Object3D();
    body.add(this.leftHand, this.rightHand);
    parts.fine.add(this.leftHand, 0, 0, 0, 0.061, 0.040, 0.072, m.skin);
    parts.fine.add(this.rightHand, 0, 0, 0, 0.061, 0.043, 0.071, m.skin);
    if (m.hasDrink) {
      parts.cup.add(this.rightHand, 0.012, 0.077, 0.055, 0.042, 0.12, 0.042, 0xaf824d);
      parts.cup.add(this.rightHand, 0.012, 0.138, 0.055, 0.047, 0.013, 0.047, 0xe0c7a2);
    } else if (m.style % 2 === 0) {
      parts.box.add(body, -0.145, -0.062, 0.28, 0.076, 0.017, 0.128, 0x242a2d, -0.1, -0.15);
    }
  }

  /** @param {ReactionKind} kind @param {number} start @param {number} end @param {number} strength */
  react(kind, start, end, strength) {
    this.cues.push({ kind, start, end, strength });
    if (this.cues.length > 8) this.cues.shift();
  }

  /** @param {number} now @param {number} elapsed @param {number} dt @param {THREE.Vector3} viewer */
  update(now, elapsed, dt, viewer) {
    const m = this.member, w = m.build, h = m.height;
    let laugh = 0, clap = 0, cough = 0, shuffle = 0, shake = 0;
    this.active = false;
    for (let i = this.cues.length - 1; i >= 0; i--) {
      const cue = this.cues[i];
      if (now >= cue.end) { this.cues.splice(i, 1); continue; }
      if (now < cue.start) continue;
      this.active = true;
      const age = now - cue.start;
      const progress = age / Math.max(1, cue.end - cue.start);
      const envelope = Math.pow(Math.sin(Math.PI * clamp(progress, 0, 1)), 0.6) * cue.strength;
      switch (cue.kind) {
        case 'laugh': case 'ripple': case 'titter':
          laugh = Math.max(laugh, envelope);
          shake += envelope * Math.sin(age * 0.021 + m.phase);
          break;
        case 'applause': clap = Math.max(clap, envelope); break;
        case 'cough': cough = Math.max(cough, envelope); break;
        case 'shuffle': shuffle = Math.max(shuffle, envelope); break;
      }
    }

    const breath = Math.sin(elapsed / m.breathMs * TAU + m.phase);
    const shift = Math.sin(elapsed / m.shiftMs * TAU + m.phase * 1.7);
    const idle = attentionAt(m, elapsed);
    this.attentive = idle.target === 'stage';
    const dx = viewer.x - m.seat.x, dz = viewer.z - m.seat.z;
    const dy = viewer.y - (CONFIG.audienceFloor + 0.53 + 0.687 * h);
    let targetYaw = clamp(Math.atan2(dx, dz), -1.08, 1.08) + m.gazeYaw;
    let targetPitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.61, 0.52) + m.gazePitch;
    if (idle.target !== 'stage') {
      const mix = Math.pow(Math.sin(Math.PI * idle.progress), 0.63);
      const side = m.seat.column < 3 ? 1 : -1;
      const lookYaw = idle.target === 'neighbour' ? side * 0.84 : (idle.target === 'phone' ? -0.29 : 0.23);
      const lookPitch = idle.target === 'neighbour' ? 0.04 : 0.46;
      targetYaw += (lookYaw - targetYaw) * mix;
      targetPitch += (lookPitch - targetPitch) * mix;
    }
    const bodyTarget = m.seat.row < 2 ? targetYaw * 0.18 : targetYaw * 0.08;
    const lag = 1 - Math.exp(-Math.min(dt, 0.12) * 3.1);
    this.bodyYaw += (bodyTarget - this.bodyYaw) * lag * 0.55;
    this.yaw += (targetYaw - this.bodyYaw - this.yaw) * lag;
    this.pitch += (targetPitch - this.pitch) * lag;
    this.body.position.y = 0.53 + breath * 0.005 + shake * 0.010;
    this.body.rotation.set(m.lean + shift * 0.018 - laugh * 0.11 + cough * 0.14,
      this.bodyYaw + shuffle * 0.12, shift * 0.021 + shake * 0.036 + shuffle * 0.06);
    this.head.rotation.set(this.pitch + breath * 0.013 - laugh * 0.11 + cough * 0.14,
      this.yaw + shift * 0.016, shift * 0.022 + shake * 0.034);
    this.mouth.scale.y = 1 + laugh * 3.0 + cough * 0.8;

    // A few people raise their drink at different times, not on the same beat.
    const sipPhase = ((elapsed + m.glanceOffset * 1.23) % m.sipMs) / m.sipMs;
    const sip = m.hasDrink && sipPhase < 0.12 && clap < 0.05
      ? Math.pow(Math.sin(Math.PI * sipPhase / 0.12), 1.8) : 0;
    const clapBeat = 0.5 + 0.5 * Math.sin(now * 0.021 + m.phase);
    const reach = clap * (0.21 + 0.045 * clapBeat);
    this.poseArm(-1, this.leftUpper, this.leftLower, this.leftHand, w, h,
      clap, reach, 0, laugh, breath);
    this.poseArm(1, this.rightUpper, this.rightLower, this.rightHand, w, h,
      clap, reach, sip, laugh, breath);
    this.root.updateMatrixWorld(true);
  }

  /** @param {number} side @param {THREE.Object3D} upper @param {THREE.Object3D} lower
   * @param {THREE.Object3D} hand @param {number} w @param {number} h
   * @param {number} clap @param {number} reach @param {number} sip
   * @param {number} laugh @param {number} breath */
  poseArm(side, upper, lower, hand, w, h, clap, reach, sip, laugh, breath) {
    a.set(side * 0.197 * w, 0.407 * h, -0.005);
    b.set(side * (0.245 * w - clap * 0.035), 0.122 * h + clap * 0.095 + sip * 0.10, 0.043 + clap * 0.10 + sip * 0.03);
    const restX = side * 0.126 * w;
    const clapX = side * Math.max(0.035, 0.17 - reach * 0.53);
    c.set(restX + (clapX - restX) * clap - side * sip * 0.095,
      -0.037 + clap * 0.29 + sip * 0.53 + laugh * 0.032 + breath * 0.006,
      0.285 - sip * 0.115 - clap * 0.065);
    poseSegment(upper, a, b, 0.079 * w);
    poseSegment(lower, b, c, 0.066 * w);
    hand.position.copy(c);
    hand.rotation.set(-sip * 0.45, 0, side * clap * 0.36);
  }
}

export class Audience {
  /** @param {Member[]} members */
  constructor(members) {
    this.group = new THREE.Group();
    this.group.name = 'Instanced audience';
    this.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    /** @type {Batches} */
    this.batches = {
      head: new PartBatch(new THREE.SphereGeometry(1, 14, 10), this.material),
      body: new PartBatch(new THREE.SphereGeometry(1, 8, 6), this.material),
      fine: new PartBatch(new THREE.SphereGeometry(1, 6, 4), this.material),
      box: new PartBatch(new THREE.BoxGeometry(1, 1, 1), this.material),
      cap: new PartBatch(new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI * 0.49), this.material),
      cup: new PartBatch(new THREE.CylinderGeometry(1, 0.88, 1, 9, 1), this.material),
    };
    this.actors = members.map(member => new Actor(member, this.batches));
    this.bySeat = new Map(this.actors.map(actor => [actor.member.seat.id, actor]));
    for (const batch of Object.values(this.batches)) batch.finish(this.group);
    this.activeCount = 0;
    this.attentiveCount = members.length;
    this.update(0, 0, 0.016, scratch.set(0, CONFIG.desktopHeight, 0));
  }

  /** @param {ReactionEvent} event */
  react(event) {
    for (const p of event.participants) {
      const actor = this.bySeat.get(p.seatId);
      actor?.react(event.kind, event.at + p.delayMs, event.at + p.delayMs + p.durationMs, p.intensity);
    }
  }

  clearReactions() {
    for (const actor of this.actors) actor.cues.length = 0;
    this.activeCount = 0;
  }

  /** @param {number} now @param {number} elapsed @param {number} dt @param {THREE.Vector3} viewerLocal */
  update(now, elapsed, dt, viewerLocal) {
    this.activeCount = this.attentiveCount = 0;
    for (const actor of this.actors) {
      actor.update(now, elapsed, dt, viewerLocal);
      if (actor.active) this.activeCount++;
      if (actor.attentive) this.attentiveCount++;
    }
    for (const batch of Object.values(this.batches)) batch.update();
  }

  /** Head position in the stage's coordinates, not an eye-tracking measurement.
   * @param {number} id @param {THREE.Vector3} target */
  headPosition(id, target) {
    const actor = this.bySeat.get(id);
    if (actor) target.setFromMatrixPosition(actor.head.matrixWorld);
    return target;
  }

  dispose() {
    for (const batch of Object.values(this.batches)) batch.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
