// @ts-check
/**
 * Seeded randomness. One master seed is turned into independent named streams
 * (appearance, idle, reactions, schedule, ambience…), so drawing more numbers
 * from one stream never shifts another.
 */

/** FNV-1a 32-bit hash of a string. @param {string} str */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mix two 32-bit numbers into a well-spread seed. @param {number} a @param {number} b */
export function mixSeeds(a, b) {
  let h = (a ^ Math.imul(b >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  /** @param {number} seed */
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /** Mulberry32: a float in [0, 1). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @param {number} min @param {number} max */
  range(min, max) {
    return min + (max - min) * this.next();
  }

  /** Inclusive integer. @param {number} min @param {number} max */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** @param {[number, number]} pair */
  between(pair) {
    return this.range(pair[0], pair[1]);
  }

  /** @param {number} p */
  chance(p) {
    return this.next() < p;
  }

  /** @template T @param {readonly T[]} arr @returns {T} */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick a key with probability proportional to its weight. Keys are tried in insertion order.
   * @template {string} K @param {Record<K, number>} weights @returns {K} */
  weighted(weights) {
    const keys = /** @type {K[]} */ (Object.keys(weights));
    let total = 0;
    for (const k of keys) total += weights[k];
    let r = this.next() * total;
    for (const k of keys) {
      r -= weights[k];
      if (r < 0) return k;
    }
    return keys[keys.length - 1];
  }
}

/** @param {number} masterSeed @param {string} name */
export function createStream(masterSeed, name) {
  return new Rng(mixSeeds(masterSeed, hashString(name)));
}

/**
 * Turn a ?seed= value into a number. Blank means a fresh random seed,
 * kept small so it is easy to read off the overlay and type back in.
 * @param {string | null | undefined} value
 */
export function parseSeed(value) {
  const v = (value ?? '').trim();
  if (v === '') return 1 + Math.floor(Math.random() * 999999);
  if (/^\d+$/.test(v)) return Number(v) >>> 0;
  return hashString(v);
}
