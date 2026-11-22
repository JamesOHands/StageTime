// @ts-check

/** @typedef {() => number} Rng */

/** Stable FNV-1a hash, with a final avalanche. @param {string} value */
export function hashSeed(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mulberry32. @param {number} seed @returns {Rng} */
export function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Named streams are independent, including after any number of draws. @param {string} master @param {string} name */
export function stream(master, name) {
  return makeRng(hashSeed(master.length + ':' + master + '/' + name));
}

/** @param {Rng} rng @param {number} min @param {number} max */
export function range(rng, min, max) {
  return min + (max - min) * rng();
}

/** @param {Rng} rng @param {number} min @param {number} max */
export function integer(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

/** @template T @param {Rng} rng @param {readonly T[]} values @returns {T} */
export function pick(rng, values) {
  if (values.length === 0) throw new Error('Cannot choose from an empty list');
  return values[integer(rng, 0, values.length - 1)];
}

/** @template T @param {Rng} rng @param {readonly T[]} values @returns {T[]} */
export function shuffled(rng, values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = integer(rng, 0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
