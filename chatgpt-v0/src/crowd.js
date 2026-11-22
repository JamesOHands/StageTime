// @ts-check

import { CONFIG, REACTION_WEIGHTS, clamp } from './config.js';
import { integer, pick, range, shuffled, stream } from './rng.js';

/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./events.js').EventBus} EventBus */
/** @typedef {import('./events.js').ReactionKind} ReactionKind */
/** @typedef {import('./events.js').ReactionSource} ReactionSource */
/** @typedef {import('./events.js').ReactionEvent} ReactionEvent */
/** @typedef {import('./events.js').Participant} Participant */
/** @typedef {import('./config.js').Outcome} Outcome */
/** @typedef {'stage' | 'drink' | 'phone' | 'neighbour'} Attention */
/** @typedef {{id: number, row: number, column: number, x: number, z: number}} Seat */
/**
 * @typedef {Object} Member
 * @property {Seat} seat
 * @property {number} height
 * @property {number} build
 * @property {number} skin
 * @property {number} hair
 * @property {number} shirt
 * @property {number} trousers
 * @property {number} style
 * @property {boolean} glasses
 * @property {boolean} beard
 * @property {number} pitch
 * @property {number} gain
 * @property {number} voice
 * @property {number} phase
 * @property {number} breathMs
 * @property {number} shiftMs
 * @property {number} glanceMs
 * @property {number} glanceOffset
 * @property {number} glanceFraction
 * @property {Attention[]} glances
 * @property {number} gazeYaw
 * @property {number} gazePitch
 * @property {number} lean
 * @property {number} sipMs
 * @property {boolean} hasDrink
 */

/** Thirty real positions, five close rows and a central aisle. @returns {Seat[]} */
export function makeSeats() {
  const xs = [-2.12, -1.34, -0.56, 0.56, 1.34, 2.12];
  return Array.from({ length: CONFIG.capacity }, (_, id) => {
    const row = Math.floor(id / xs.length), column = id % xs.length;
    return { id, row, column, x: xs[column], z: -1.49 - row * 0.82 };
  });
}

const SKINS = [0xf1c49d, 0xdba079, 0xc68a61, 0xa86d48, 0x845238, 0x633d30, 0xf0b59c, 0xd69379];
const HAIR = [0x271f1a, 0x49332a, 0x69513a, 0x9e6f41, 0x8b3c24, 0x736f68, 0xbbb29e];
const SHIRTS = [0x546c79, 0x673b43, 0x304c4b, 0xb3a188, 0x3f485f, 0x5c6648, 0x785b49, 0x393d43, 0x8f7865, 0x8f5350, 0x42666f, 0x938f80];
const TROUSERS = [0x323e4c, 0x43464a, 0x554a40, 0x374e56, 0x2e3036, 0x665c4e];
/** @type {Attention[]} */
const GLANCES = ['drink', 'phone', 'neighbour', 'neighbour', 'stage'];

/** @param {string} seed @param {number} fill @returns {Member[]} */
export function makeMembers(seed, fill) {
  const count = clamp(Math.round(fill), CONFIG.minFill, CONFIG.capacity);
  const seats = shuffled(stream(seed, 'appearance/fill'), makeSeats()).slice(0, count)
    .sort((a, b) => a.id - b.id);
  return seats.map(seat => {
    const look = stream(seed, 'appearance/seat/' + seat.id);
    const idle = stream(seed, 'idle/seat/' + seat.id);
    const hasDrink = look() < 0.57;
    return {
      seat,
      height: range(look, 0.91, 1.1),
      build: range(look, 0.83, 1.18),
      skin: pick(look, SKINS),
      hair: pick(look, HAIR),
      shirt: pick(look, SHIRTS),
      trousers: pick(look, TROUSERS),
      style: integer(look, 0, 7),
      glasses: look() < 0.18,
      beard: look() < 0.19,
      pitch: range(look, 0.90, 1.10),
      gain: range(look, 0.65, 1.10),
      voice: integer(look, 0, 11),
      phase: range(idle, 0, Math.PI * 2),
      breathMs: range(idle, 3200, 5700),
      shiftMs: range(idle, 5400, 11800),
      glanceMs: range(idle, 9500, 23000),
      glanceOffset: range(idle, 0, 23000),
      glanceFraction: range(idle, 0.13, 0.20),
      glances: Array.from({ length: 5 }, () => {
        const target = pick(idle, GLANCES);
        return target === 'drink' && !hasDrink ? 'neighbour' : target;
      }),
      gazeYaw: range(idle, -0.065, 0.065),
      gazePitch: range(idle, -0.045, 0.045),
      lean: range(idle, -0.055, 0.055),
      sipMs: range(idle, 26000, 47000),
      hasDrink,
    };
  });
}

/** @param {Member} member @param {number} elapsedMs */
export function attentionAt(member, elapsedMs) {
  const t = Math.max(0, elapsedMs) + member.glanceOffset;
  const cycle = Math.floor(t / member.glanceMs);
  const phase = (t % member.glanceMs) / member.glanceMs;
  if (phase >= member.glanceFraction) {
    return { target: /** @type {Attention} */ ('stage'), progress: 0 };
  }
  return {
    target: member.glances[cycle % member.glances.length],
    progress: phase / member.glanceFraction,
  };
}

/** @param {Rng} rng @returns {Outcome} */
export function rollOutcome(rng) {
  const total = Object.values(REACTION_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  let cursor = rng() * total;
  /** @type {Outcome[]} */
  const kinds = ['silence', 'titter', 'ripple', 'laugh'];
  for (const kind of kinds) {
    cursor -= REACTION_WEIGHTS[kind];
    if (cursor < 0) return kind;
  }
  return 'laugh';
}

export class Crowd {
  /** @param {EventBus} bus @param {string} seed @param {number} fill */
  constructor(bus, seed, fill) {
    this.bus = bus;
    this.seed = seed;
    this.seats = makeSeats();
    this.members = makeMembers(seed, fill);
    this.startedAt = 0;
    /** @type {ReactionEvent[]} */
    this.timed = [];
    /** @type {ReactionEvent[]} */
    this.ambient = [];
    this.timedCursor = 0;
    this.ambientCursor = 0;
    this.manualRng = stream(seed, 'reactions/manual');
    this.micRng = stream(seed, 'reactions/mic');
    this.finishRng = stream(seed, 'reactions/finish');
  }

  /** @param {ReactionKind} kind @param {number} at @param {ReactionSource} source @param {Rng} rng @returns {ReactionEvent} */
  makeReaction(kind, at, source, rng) {
    /** @type {Participant[]} */
    const participants = [];
    if (kind === 'silence') return { type: 'reaction', kind, source, at, participants };
    if (kind === 'glass') {
      participants.push({
        seatId: -1, delayMs: 0, durationMs: range(rng, 350, 650),
        gain: range(rng, 0.45, 0.72), pitch: range(rng, 0.9, 1.1),
        variant: integer(rng, 0, 11), intensity: 0.4,
      });
      return { type: 'reaction', kind, source, at, participants };
    }
    const n = this.members.length;
    let count = 1, spread = 0, minDur = 380, maxDur = 850, power = 0.45;
    if (kind === 'titter') {
      count = integer(rng, 1, 3); spread = 300; minDur = 460; maxDur = 1000; power = 0.36;
    } else if (kind === 'ripple') {
      count = integer(rng, 4, 8); spread = 500; minDur = 820; maxDur = 1700; power = 0.64;
    } else if (kind === 'laugh') {
      count = integer(rng, Math.ceil(n * 0.5), Math.floor(n * 0.9));
      spread = 800; minDur = 1180; maxDur = 2480; power = 1;
    } else if (kind === 'applause') {
      count = Math.max(1, Math.round(n * range(rng, 0.7, 1)));
      spread = 850; minDur = 1700; maxDur = 3600; power = 0.78;
    } else if (kind === 'shuffle') {
      minDur = 400; maxDur = 920; power = 0.3;
    }
    const selected = shuffled(rng, this.members).slice(0, Math.min(count, n));
    selected.forEach((member, index) => {
      const delayMs = kind === 'laugh'
        ? (index < 2 ? range(rng, 0, 100) : range(rng, 130, spread))
        : range(rng, 0, spread);
      participants.push({
        seatId: member.seat.id,
        delayMs: Math.round(delayMs),
        durationMs: Math.round(range(rng, minDur, maxDur)),
        gain: member.gain * range(rng, 0.83, 1.05),
        pitch: member.pitch,
        variant: member.voice + integer(rng, 0, 11),
        intensity: power * range(rng, 0.72, 1.0),
      });
    });
    return { type: 'reaction', kind, source, at, participants };
  }

  /** Build a relative session-clock timeline before rendering starts.
   * @param {number} durationMs @returns {ReactionEvent[]} */
  planTimed(durationMs) {
    const schedule = stream(this.seed, 'schedule/timed');
    const reactions = stream(this.seed, 'reactions/timed');
    /** @type {ReactionEvent[]} */
    const timeline = [];
    let at = Math.round(range(schedule, CONFIG.timedMinMs, CONFIG.timedMaxMs));
    while (at < durationMs) {
      timeline.push(this.makeReaction(rollOutcome(reactions), at, 'timed', reactions));
      at += Math.round(range(schedule, CONFIG.timedMinMs, CONFIG.timedMaxMs));
    }
    return timeline;
  }

  /** Unrelated pub ambience, not a verdict on speech. @param {number} durationMs */
  planAmbient(durationMs) {
    const schedule = stream(this.seed, 'schedule/ambient');
    const rng = stream(this.seed, 'reactions/ambient');
    /** @type {ReactionKind[]} */
    const kinds = ['cough', 'shuffle', 'glass', 'shuffle', 'glass'];
    /** @type {ReactionEvent[]} */
    const timeline = [];
    let at = range(schedule, 12000, 32000);
    while (at < durationMs) {
      timeline.push(this.makeReaction(pick(rng, kinds), Math.round(at), 'ambient', rng));
      at += range(schedule, 21000, 46000);
    }
    return timeline;
  }

  /** @param {number} now @param {number} durationMs */
  begin(now, durationMs) {
    this.startedAt = now;
    this.timed = this.planTimed(durationMs);
    this.ambient = this.planAmbient(durationMs);
    this.timedCursor = 0;
    this.ambientCursor = 0;
    this.micRng = stream(this.seed, 'reactions/mic');
    this.manualRng = stream(this.seed, 'reactions/manual');
    this.finishRng = stream(this.seed, 'reactions/finish');
  }

  /** @param {number} elapsedMs */
  timedThrough(elapsedMs) {
    while (this.timedCursor < this.timed.length && this.timed[this.timedCursor].at <= elapsedMs) {
      const next = this.timed[this.timedCursor++];
      this.bus.emit({ ...next, at: this.startedAt + next.at });
    }
  }

  /** A mic failure mid-session must not replay older, already-past slots. @param {number} elapsedMs */
  skipTimedThrough(elapsedMs) {
    while (this.timedCursor < this.timed.length && this.timed[this.timedCursor].at <= elapsedMs) this.timedCursor++;
  }

  /** @param {number} elapsedMs */
  ambientThrough(elapsedMs) {
    while (this.ambientCursor < this.ambient.length && this.ambient[this.ambientCursor].at <= elapsedMs) {
      const next = this.ambient[this.ambientCursor++];
      this.bus.emit({ ...next, at: this.startedAt + next.at });
    }
  }

  cancel() {
    this.timed = [];
    this.ambient = [];
    this.timedCursor = 0;
    this.ambientCursor = 0;
  }

  /** @param {number} now */
  onPause(now) {
    const event = this.makeReaction(rollOutcome(this.micRng), now, 'mic', this.micRng);
    this.bus.emit(event);
    return event;
  }

  /** @param {ReactionKind} kind @param {number} now */
  manual(kind, now) {
    const event = this.makeReaction(kind, now, 'manual', this.manualRng);
    this.bus.emit(event);
    return event;
  }

  /** @param {number} now */
  finish(now) {
    this.bus.emit(this.makeReaction('applause', now, 'finish', this.finishRng));
  }
}
