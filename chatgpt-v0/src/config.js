// @ts-check

/** @typedef {'mic' | 'timed' | 'manual'} Mode */
/** @typedef {'silence' | 'titter' | 'ripple' | 'laugh'} Outcome */
/** @typedef {'titter' | 'ripple' | 'laugh' | 'applause' | 'cough' | 'shuffle' | 'glass' | 'murmur' | 'bar'} AudioKind */
/**
 * @typedef {Object} Settings
 * @property {string} seed
 * @property {Mode} mode
 * @property {number} fill
 * @property {number} minutes
 * @property {number} volume
 * @property {number} house
 * @property {number} spotlight
 * @property {boolean} countdown
 */

export const CONFIG = Object.freeze({
  capacity: 30,
  defaultFill: 20,
  minFill: 15,
  defaultMinutes: 5,
  audienceFloor: -0.45,
  desktopHeight: 1.7,
  defaultVolume: 0.48,
  defaultHouse: 0.72,
  defaultSpotlight: 0.8,
  speechConfirmMs: 150,
  minSpeechMs: 2000,
  pauseMs: 700,
  reactionCooldownMs: 4000,
  echoTailMs: 500,
  timedMinMs: 15000,
  timedMaxMs: 40000,
  maxReactionVoices: 24,
  ctrlHoldMs: 1000,
  targetFps: 72,
});

/** @type {Readonly<Record<Outcome, number>>} */
export const REACTION_WEIGHTS = Object.freeze({
  silence: 40, titter: 30, ripple: 20, laugh: 10,
});

/** @param {number} value @param {number} min @param {number} max */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** @param {string} value @returns {Mode} */
export function normaliseMode(value) {
  return value === 'mic' || value === 'manual' ? value : 'timed';
}

export function randomSeed() {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0].toString(36).padStart(7, '0');
}

/** @param {string | null | undefined} value */
export function normaliseSeed(value) {
  return String(value ?? '').trim().slice(0, 64) || randomSeed();
}

/** @param {string | null} value @param {number} min @param {number} max @param {number} fallback */
function boundedInt(value, min, max, fallback) {
  const number = value === null || value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(number) ? clamp(Math.round(number), min, max) : fallback;
}

/** @param {string} search @returns {Settings} */
export function settingsFromQuery(search) {
  const q = new URLSearchParams(search);
  return {
    seed: normaliseSeed(q.get('seed')),
    mode: normaliseMode(q.get('mode') ?? 'timed'),
    fill: boundedInt(q.get('fill'), CONFIG.minFill, CONFIG.capacity, CONFIG.defaultFill),
    minutes: boundedInt(q.get('minutes'), 1, 10, CONFIG.defaultMinutes),
    volume: CONFIG.defaultVolume,
    house: CONFIG.defaultHouse,
    spotlight: CONFIG.defaultSpotlight,
    countdown: true,
  };
}

/** @param {number} remainingMs */
export function formatTime(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
