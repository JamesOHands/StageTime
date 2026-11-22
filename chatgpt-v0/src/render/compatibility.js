// @ts-check

import * as THREE from 'three';
import { clamp } from '../config.js';

/** @typedef {{x:number,y:number,z:number}} Point */
/** @typedef {{x:number,y:number}} Screen */
/** @typedef {{depth:number,layer:number,colour:string,vertices:Screen[]}} Polygon */
/** @typedef {{depth:number,layer:number,colour:string,x:number,y:number,rx:number,ry:number,angle:number}} Ellipse */
/** @typedef {Polygon | Ellipse} Shape */

/**
 * A deliberately labelled, low-frequency Canvas2D compatibility view for
 * desktop browsers which cannot create WebGL2. It projects the SAME Three
 * scene, instance transforms and head/arm poses into simple shaded shapes.
 * It is not the headset renderer and its FPS is not headset evidence.
 * No attempt is made to enable or bypass unavailable graphics hardware.
 */
export class CompatibilityPreview {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('This browser cannot create a drawing context.');
    this.canvas = canvas;
    this.ctx = ctx;
    this.info = { render: { calls: 0, triangles: 0 } };
    this.frame = 0;
    this.last = -Infinity;
    this.house = 0.72;
    this.instance = new THREE.Matrix4();
    this.world = new THREE.Matrix4();
    this.modelView = new THREE.Matrix4();
    this.colour = new THREE.Color();
    this.baseColour = new THREE.Color();
    /** @type {Shape[]} */
    this.shapes = [];
  }

  /** @param {number} _ratio */
  setPixelRatio(_ratio) { /* CPU preview is intentionally resolution limited. */ }

  /** @param {number} width @param {number} height @param {boolean} [_updateStyle] */
  setSize(width, height, _updateStyle = false) {
    const scale = Math.min(1, 1080 / Math.max(1, width), 820 / Math.max(1, height));
    this.canvas.width = Math.max(1, Math.round(width * scale));
    this.canvas.height = Math.max(1, Math.round(height * scale));
  }

  /** @param {((time:number, frame?:XRFrame) => void) | null} callback */
  setAnimationLoop(callback) {
    cancelAnimationFrame(this.frame);
    if (!callback) return;
    /** @param {number} time */
    const next = time => {
      this.frame = requestAnimationFrame(next);
      if (time - this.last < 65) return;
      this.last = time;
      callback(time);
    };
    this.frame = requestAnimationFrame(next);
  }

  /** @param {THREE.Scene} scene @param {THREE.PerspectiveCamera} camera */
  render(scene, camera) {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    this.shapes.length = 0;
    let calls = 0, triangles = 0;
    scene.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object;
      const material = /** @type {THREE.Material & {color?:THREE.Color,map?:THREE.Texture|null}} */ (
        Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      );
      if (!material?.visible || material.opacity < 0.055) return;
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds) return;
      const count = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
      calls++;
      triangles += ((geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3) * count;
      if (material.color) this.baseColour.copy(material.color);
      else this.baseColour.setHex(0x8b7967);
      if (material.map && geometry.type === 'PlaneGeometry') {
        this.baseColour.setHex(Math.abs(mesh.rotation.x) > 1 ? 0x594234 : 0x55412f);
      }
      for (let i = 0; i < count; i++) {
        this.colour.copy(this.baseColour);
        if (mesh instanceof THREE.InstancedMesh) {
          mesh.getMatrixAt(i, this.instance);
          this.world.multiplyMatrices(mesh.matrixWorld, this.instance);
          if (mesh.instanceColor) {
            mesh.getColorAt(i, this.colour);
            this.colour.multiply(this.baseColour);
          }
        } else this.world.copy(mesh.matrixWorld);
        this.modelView.multiplyMatrices(camera.matrixWorldInverse, this.world);
        const hex = this.colour.getHex(THREE.SRGBColorSpace);
        if (geometry.type === 'SphereGeometry') this.ellipsoid(bounds, this.modelView, hex, camera);
        else this.solid(bounds, this.modelView, hex, camera, geometry.type === 'PlaneGeometry');
      }
    });
    this.info.render.calls = calls;
    this.info.render.triangles = Math.round(triangles);
    const ctx = this.ctx, width = this.canvas.width, height = this.canvas.height;
    ctx.fillStyle = '#211916';
    ctx.fillRect(0, 0, width, height);
    // Render large room surfaces first, then sort the furniture and moving
    // parts together. This retains the layout and silhouette without a GPU.
    this.shapes.sort((a, b) => a.layer - b.layer || b.depth - a.depth);
    for (const shape of this.shapes) {
      ctx.fillStyle = shape.colour;
      ctx.beginPath();
      if ('vertices' in shape) {
        ctx.moveTo(shape.vertices[0].x, shape.vertices[0].y);
        for (let i = 1; i < shape.vertices.length; i++) ctx.lineTo(shape.vertices[i].x, shape.vertices[i].y);
        ctx.closePath();
      } else ctx.ellipse(shape.x, shape.y, shape.rx, shape.ry, shape.angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** @param {Point} point @param {THREE.PerspectiveCamera} camera @returns {Screen} */
  project(point, camera) {
    const e = camera.projectionMatrix.elements, depth = Math.max(0.035, -point.z);
    return {
      x: clamp(((e[0] * point.x + e[8] * point.z) / depth * 0.5 + 0.5) * this.canvas.width, -22000, 22000),
      y: clamp((0.5 - (e[5] * point.y + e[9] * point.z) / depth * 0.5) * this.canvas.height, -22000, 22000),
    };
  }

  /** @param {number} hex @param {number} depth @param {number} light */
  shade(hex, depth, light) {
    const factor = clamp(0.49 + this.house * 0.45 + 0.21 * (1 - clamp(depth / 8, 0, 1)) + light * 0.25, 0.32, 1.18);
    const red = Math.round(Math.min(255, ((hex >> 16) & 255) * factor * 1.025));
    const green = Math.round(Math.min(255, ((hex >> 8) & 255) * factor));
    const blue = Math.round(Math.min(255, (hex & 255) * factor * 0.94));
    return 'rgb(' + red + ',' + green + ',' + blue + ')';
  }

  /** @param {THREE.Box3} box @param {THREE.Matrix4} matrix @param {number} hex @param {THREE.PerspectiveCamera} camera */
  ellipsoid(box, matrix, hex, camera) {
    const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
    const centre = transform(matrix, cx, cy, cz);
    if (centre.z >= -0.04) return;
    const screen = this.project(centre, camera);
    const axes = [
      transform(matrix, box.max.x, cy, cz),
      transform(matrix, cx, box.max.y, cz),
      transform(matrix, cx, cy, box.max.z),
    ];
    let xx = 0, xy = 0, yy = 0;
    for (const p of axes) {
      const projected = this.project(p, camera);
      const dx = projected.x - screen.x, dy = projected.y - screen.y;
      xx += dx * dx; xy += dx * dy; yy += dy * dy;
    }
    const root = Math.sqrt(Math.max(0, (xx - yy) * (xx - yy) + 4 * xy * xy));
    const rx = Math.sqrt(Math.max(0.16, (xx + yy + root) / 2));
    const ry = Math.sqrt(Math.max(0.16, (xx + yy - root) / 2));
    if (rx > this.canvas.width * 2 || screen.x + rx < 0 || screen.x - rx > this.canvas.width ||
        screen.y + rx < 0 || screen.y - rx > this.canvas.height) return;
    this.shapes.push({ depth: -centre.z, layer: 1, colour: this.shade(hex, -centre.z, 0.52),
      x: screen.x, y: screen.y, rx, ry, angle: Math.atan2(2 * xy, xx - yy) / 2 });
  }

  /** @param {THREE.Box3} box @param {THREE.Matrix4} matrix @param {number} hex
   * @param {THREE.PerspectiveCamera} camera @param {boolean} plane */
  solid(box, matrix, hex, camera, plane) {
    const { min, max } = box, z = min.z;
    const points = [
      transform(matrix, min.x, min.y, z), transform(matrix, max.x, min.y, z),
      transform(matrix, max.x, max.y, z), transform(matrix, min.x, max.y, z),
      transform(matrix, min.x, min.y, max.z), transform(matrix, max.x, min.y, max.z),
      transform(matrix, max.x, max.y, max.z), transform(matrix, min.x, max.y, max.z),
    ];
    const e = matrix.elements;
    const longest = Math.max(
      (max.x - min.x) * Math.hypot(e[0], e[1], e[2]),
      (max.y - min.y) * Math.hypot(e[4], e[5], e[6]),
      (max.z - min.z) * Math.hypot(e[8], e[9], e[10]),
    );
    const layer = longest > 2.9 ? 0 : 1;
    const faces = plane ? [[0, 1, 2, 3]] :
      [[4, 5, 6, 7], [1, 0, 3, 2], [0, 4, 7, 3], [5, 1, 2, 6], [3, 7, 6, 2], [0, 1, 5, 4]];
    for (const face of faces) {
      const corners = face.map(i => points[i]);
      const first = corners[0], second = corners[1], third = corners[2];
      const ux = second.x - first.x, uy = second.y - first.y, uz = second.z - first.z;
      const vx = third.x - first.x, vy = third.y - first.y, vz = third.z - first.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * -first.x + ny * -first.y + nz * -first.z <= 0) continue;
      const clipped = nearClip(corners);
      if (clipped.length < 3) continue;
      const vertices = clipped.map(p => this.project(p, camera));
      if (vertices.every(p => p.x < 0) || vertices.every(p => p.x > this.canvas.width) ||
          vertices.every(p => p.y < 0) || vertices.every(p => p.y > this.canvas.height)) continue;
      const depth = -clipped.reduce((sum, p) => sum + p.z, 0) / clipped.length;
      const light = Math.max(0, (ny * 0.7 + nz * 0.65) / Math.max(0.0001, Math.hypot(nx, ny, nz)));
      this.shapes.push({ depth, layer, vertices, colour: this.shade(hex, depth, light) });
    }
  }
}

/** @param {THREE.Matrix4} matrix @param {number} x @param {number} y @param {number} z @returns {Point} */
function transform(matrix, x, y, z) {
  const e = matrix.elements;
  return {
    x: e[0] * x + e[4] * y + e[8] * z + e[12],
    y: e[1] * x + e[5] * y + e[9] * z + e[13],
    z: e[2] * x + e[6] * y + e[10] * z + e[14],
  };
}

/** @param {Point[]} points @returns {Point[]} */
function nearClip(points) {
  const near = -0.045;
  /** @type {Point[]} */
  const out = [];
  let previous = points[points.length - 1];
  for (const current of points) {
    const before = previous.z < near, inside = current.z < near;
    if (before !== inside) {
      const t = (near - previous.z) / (current.z - previous.z);
      out.push({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t, z: near });
    }
    if (inside) out.push(current);
    previous = current;
  }
  return out;
}
