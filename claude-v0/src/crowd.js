// @ts-check
/**
 * The audience as data: seats, who is sitting where, what they look like,
 * where they are looking, and who takes part in each reaction.
 * Pure logic: no DOM, Three.js or audio. Rendering and audio subscribe to its events.
 *
 * Determinism: each person has their own random stream for attention changes, and
 * timed things (attention, ambience) are processed in time order, so the same seed gives
 * the same behaviour at any frame rate (tests/crowd.test.js).
 */

import { CONFIG } from './config.js';
import { createStream, Rng } from './rng.js';

/** @typedef {import('./config.js').ReactionKind} ReactionKind */
/** @typedef {import('./config.js').Outcome} Outcome */
/** @typedef {import('./session.js').SessionState} SessionState */
/** @typedef {{ index: number, row: number, x: number, z: number, yaw: number }} Seat */
/** @typedef {'stage'|'drink'|'neighbour'|'down'|'phone'} Attention */
/**
 * @typedef {{
 *   torsoScale: number, widthScale: number, headScale: number,
 *   skin: number, shirt: number, trousers: number, hair: number,
 *   hairStyle: 'short'|'long'|'bald', hat: null|'beanie'|'cap', hatColour: number,
 *   glasses: boolean, drink: boolean, drinkHand: 'left'|'right'
 * }} Look
 */
/** @typedef {{ pitch: number, gain: number, laughiness: number }} Voice */
/**
 * @typedef {{
 *   breathRate: number, breathPhase: number, swayRate: number, swayPhase: number,
 *   lean: number, gazeLagMs: number, gazeOffsetYaw: number, gazeOffsetPitch: number,
 *   neighbourSide: number
 * }} Idle
 */
/**
 * @typedef {{
 *   id: number, seat: Seat, look: Look, voice: Voice, idle: Idle,
 *   head: { x: number, y: number, z: number },
 *   attention: Attention, attentionSince: number, nextAttentionAt: number,
 *   rng: Rng, busyUntil: number, lastClip: Partial<Record<ReactionKind, number>>
 * }} Member
 */
/** @typedef {{ memberId: number, delayMs: number, durationMs: number, gain: number, pitch: number, clip: number }} Participant */
/**
 * @typedef {{ type: 'reaction', kind: ReactionKind|'silence', at: number, source: string,
 *   participants: Participant[], durationMs: number }} ReactionPlan
 */

/** Placeholder clip variants per kind. audio.js replaces these with the real library's counts.
 * Ripples are small group laughs, so they share the laugh clips. */
export const DEFAULT_CLIP_COUNTS = { laugh: 8, ripple: 8, titter: 6, applause: 4, cough: 4 };

/** Lay out the seats in gentle arcs facing the performer. */
export function buildSeats(venue = CONFIG.venue) {
  /** @type {Seat[]} */
  const seats = [];
  venue.rows.forEach((count, row) => {
    const radius = venue.firstRowRadius + row * venue.rowSpacing;
    // Alternate rows are offset by a quarter seat each way, so heads don't line up.
    const shift = row % 2 === 0 ? -0.25 : 0.25;
    for (let i = 0; i < count; i++) {
      const along = (i - (count - 1) / 2 + shift) * venue.seatSpacing;
      const angle = along / radius;
      const x = radius * Math.sin(angle);
      const z = -radius * Math.cos(angle);
      seats.push({ index: seats.length, row, x, z, yaw: Math.atan2(-x, -z) });
    }
  });
  return seats;
}

/** @param {number} fill */
export function clampFill(fill) {
  const a = CONFIG.audience;
  return Math.max(a.fillMin, Math.min(a.fillMax, Math.round(fill)));
}

/**
 * Choose which seats are filled: weighted random without replacement.
 * @param {Rng} rng @param {Seat[]} seats @param {number} fill
 */
function chooseSeats(rng, seats, fill) {
  const keyed = seats.map((seat) => {
    const w = CONFIG.venue.rowFillWeights[seat.row] ?? 1;
    return { seat, key: Math.pow(rng.next(), 1 / w) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed
    .slice(0, fill)
    .map((k) => k.seat)
    .sort((a, b) => a.index - b.index);
}

/** @param {Rng} rng @returns {Look} */
function createLook(rng) {
  const a = CONFIG.audience;
  const p = CONFIG.palettes;
  const bald = rng.chance(a.baldChance);
  const hatRoll = rng.chance(a.hatChance);
  return {
    torsoScale: rng.range(0.9, 1.1),
    widthScale: rng.range(0.85, 1.25),
    headScale: rng.range(0.93, 1.07),
    skin: rng.int(0, p.skin.length - 1),
    shirt: rng.int(0, p.shirt.length - 1),
    trousers: rng.int(0, p.trousers.length - 1),
    hair: rng.int(0, p.hair.length - 1),
    hairStyle: bald ? 'bald' : rng.chance(0.35) ? 'long' : 'short',
    hat: hatRoll ? (rng.chance(0.5) ? 'beanie' : 'cap') : null,
    hatColour: rng.int(0, p.hat.length - 1),
    glasses: rng.chance(a.glassesChance),
    drink: rng.chance(a.drinkChance),
    drinkHand: rng.chance(0.75) ? 'right' : 'left',
  };
}

/** @param {Rng} rng @returns {Voice} */
function createVoice(rng) {
  return { pitch: rng.range(0.9, 1.1), gain: rng.range(0.7, 1.0), laughiness: rng.range(0.4, 1.6) };
}

/** @param {Rng} rng @returns {Idle} */
function createIdle(rng) {
  return {
    breathRate: rng.range(0.18, 0.3),
    breathPhase: rng.range(0, Math.PI * 2),
    swayRate: rng.range(0.05, 0.12),
    swayPhase: rng.range(0, Math.PI * 2),
    lean: rng.range(-0.05, 0.12),
    gazeLagMs: rng.range(250, 800),
    gazeOffsetYaw: rng.range(-0.06, 0.06),
    gazeOffsetPitch: rng.range(-0.05, 0.05),
    neighbourSide: rng.chance(0.5) ? 1 : -1,
  };
}

/** Head centre height for a look, relative to the stage floor. @param {Look} look */
export function headHeight(look) {
  const v = CONFIG.venue;
  const b = CONFIG.body;
  return v.audienceFloorY + v.seatHeight + b.hipToShoulder * look.torsoScale + b.shoulderToHead * look.headScale;
}

/**
 * Pre-generate a timed-mode schedule on the session clock: [{ atMs, outcome }].
 * Built once per session from its own stream, so frame rate can't change it.
 * @param {Rng} rng @param {number} durationMs
 */
export function buildTimedSchedule(rng, durationMs) {
  /** @type {{ atMs: number, outcome: Outcome }[]} */
  const events = [];
  let t = rng.between(/** @type {[number, number]} */ (CONFIG.timed.gapMs));
  while (t < durationMs) {
    events.push({ atMs: t, outcome: rng.weighted(CONFIG.reactions.weights) });
    t += rng.between(/** @type {[number, number]} */ (CONFIG.timed.gapMs));
  }
  return events;
}

/** @typedef {'cough'|'glass'|'shuffle'} AmbientKind */
const AMBIENT_KINDS = /** @type {AmbientKind[]} */ (['cough', 'glass', 'shuffle']);

export class Crowd {
  /**
   * @param {{ seed: number, fill: number, now: number, emit: import('./events.js').Emit,
   *   clipCounts?: Record<ReactionKind, number> }} opts
   */
  constructor({ seed, fill, now, emit, clipCounts = DEFAULT_CLIP_COUNTS }) {
    this.seed = seed;
    this.emit = emit;
    this.clipCounts = { ...clipCounts };
    this.fill = clampFill(fill);
    this.seats = buildSeats();
    /** @type {SessionState} */
    this.sessionState = 'ready';

    const appearance = createStream(seed, 'appearance');
    const occupied = chooseSeats(appearance, this.seats, this.fill);
    /** @type {Member[]} */
    this.members = occupied.map((seat, id) => {
      const look = createLook(appearance);
      const voice = createVoice(appearance);
      const rng = createStream(seed, `idle:${id}`);
      const idle = createIdle(rng);
      /** @type {Member} */
      const m = {
        id,
        seat,
        look,
        voice,
        idle,
        head: { x: seat.x, y: headHeight(look), z: seat.z },
        attention: 'stage',
        attentionSince: now,
        nextAttentionAt: now,
        rng,
        busyUntil: now,
        lastClip: {},
      };
      // Start everyone part-way through a random look so they don't all change together.
      const p = CONFIG.audience.ready;
      if (rng.chance(0.5)) {
        m.nextAttentionAt = now + rng.between(/** @type {[number, number]} */ (p.stageMs)) * rng.next();
      } else {
        m.attention = this.pickAway(m);
        m.nextAttentionAt = now + rng.between(/** @type {[number, number]} */ (p.awayMs)) * rng.next();
      }
      return m;
    });

    this.reactionsRng = createStream(seed, 'reactions');
    this.ambienceRng = createStream(seed, 'ambience');
    /** @type {Record<AmbientKind, number>} */
    this.nextAmbient = { cough: 0, glass: 0, shuffle: 0 };
    for (const kind of AMBIENT_KINDS) this.scheduleAmbient(kind, now);
    /** @type {{ kind: string, endAt: number }[]} */
    this.active = [];
    this.lastUpdate = now;
  }

  /** @param {Record<ReactionKind, number>} counts */
  setClipCounts(counts) {
    this.clipCounts = { ...counts };
  }

  /** @param {Member} m @returns {Attention} */
  pickAway(m) {
    let away = m.rng.weighted(CONFIG.audience.awayWeights);
    if (away === 'drink' && !m.look.drink) away = 'neighbour';
    return away;
  }

  get attentionParams() {
    return this.sessionState === 'running' ? CONFIG.audience.running : CONFIG.audience.ready;
  }

  /** @param {Member} m @param {number} at */
  advanceAttention(m, at) {
    const p = this.attentionParams;
    if (m.attention === 'stage') {
      m.attention = this.pickAway(m);
      m.nextAttentionAt = at + m.rng.between(/** @type {[number, number]} */ (p.awayMs));
    } else {
      m.attention = 'stage';
      m.nextAttentionAt = at + m.rng.between(/** @type {[number, number]} */ (p.stageMs));
    }
    m.attentionSince = at;
  }

  /** @param {AmbientKind} kind @param {number} from */
  scheduleAmbient(kind, from) {
    const gaps = CONFIG.ambience;
    const range = kind === 'cough' ? gaps.coughGapMs : kind === 'glass' ? gaps.glassGapMs : gaps.shuffleGapMs;
    this.nextAmbient[kind] = from + this.ambienceRng.between(/** @type {[number, number]} */ (range));
  }

  /** @param {AmbientKind} kind @param {number} at */
  fireAmbient(kind, at) {
    const rng = this.ambienceRng;
    if (kind === 'glass') {
      this.emit({ type: 'ambient', kind, source: 'bar', at, clip: rng.int(0, 5) });
    } else {
      const m = rng.pick(this.members);
      if (m && m.busyUntil <= at) {
        if (kind === 'cough') {
          const durationMs = rng.between(/** @type {[number, number]} */ (CONFIG.reactions.cough.durMs));
          const clip = this.pickClip(m, 'cough', rng);
          m.busyUntil = at + durationMs;
          this.emit({ type: 'ambient', kind, memberId: m.id, at, durationMs, clip, gain: m.voice.gain * 0.8, pitch: m.voice.pitch });
        } else {
          this.emit({ type: 'ambient', kind, memberId: m.id, at, clip: rng.int(0, 3) });
        }
      }
    }
    this.scheduleAmbient(kind, at);
  }

  /** Call every frame with the current time in ms. @param {number} now */
  update(now) {
    for (const m of this.members) {
      while (now >= m.nextAttentionAt) this.advanceAttention(m, m.nextAttentionAt);
    }
    // Ambient sounds, strictly in time order.
    for (;;) {
      /** @type {AmbientKind} */
      let kind = 'cough';
      for (const k of AMBIENT_KINDS) if (this.nextAmbient[k] < this.nextAmbient[kind]) kind = k;
      const at = this.nextAmbient[kind];
      if (at > now) break;
      this.fireAmbient(kind, at);
    }
    this.active = this.active.filter((a) => a.endAt > now);
    this.lastUpdate = now;
  }

  /** @param {SessionState} state @param {number} now */
  setSessionState(state, now) {
    this.update(now);
    this.sessionState = state;
    if (state === 'running') {
      // The room settles: people looking away turn to the stage over the next second or two.
      for (const m of this.members) {
        if (m.attention !== 'stage') {
          const turn = now + m.rng.between(/** @type {[number, number]} */ (CONFIG.audience.hushTurnMs));
          m.nextAttentionAt = Math.min(m.nextAttentionAt, turn);
        }
      }
    }
  }

  /** Weighted outcome for a qualifying pause (mic mode). */
  rollOutcome() {
    return this.reactionsRng.weighted(CONFIG.reactions.weights);
  }

  /** @param {Member} m @param {ReactionKind} kind @param {Rng} rng */
  pickClip(m, kind, rng) {
    const n = this.clipCounts[kind] ?? 1;
    const last = m.lastClip[kind];
    let clip;
    if (n <= 1) clip = 0;
    else if (last === undefined) clip = rng.int(0, n - 1);
    else {
      clip = rng.int(0, n - 2);
      if (clip >= last) clip += 1; // never the same clip twice in a row from the same seat
    }
    m.lastClip[kind] = clip;
    return clip;
  }

  /**
   * Choose n people, favouring those who laugh more, without repeats.
   * @param {Member[]} pool @param {number} n @param {Rng} rng
   */
  choose(pool, n, rng) {
    return pool
      .map((m) => ({ m, key: Math.pow(rng.next(), 1 / m.voice.laughiness) }))
      .sort((a, b) => b.key - a.key)
      .slice(0, Math.max(0, Math.min(n, pool.length)))
      .map((k) => k.m);
  }

  /**
   * Plan who reacts, when and how loudly. Doesn't emit; see trigger().
   * @param {ReactionKind} kind @param {number} at @param {string} source
   * @returns {ReactionPlan}
   */
  planReaction(kind, at, source) {
    const rng = this.reactionsRng;
    const r = CONFIG.reactions;
    const free = this.members.filter((m) => m.busyUntil <= at);
    /** @type {Participant[]} */
    const participants = [];

    /** @param {Member} m @param {number} delayMs @param {number} durationMs @param {number} gainScale */
    const add = (m, delayMs, durationMs, gainScale) => {
      participants.push({
        memberId: m.id,
        delayMs,
        durationMs,
        gain: m.voice.gain * gainScale,
        pitch: m.voice.pitch * rng.range(0.98, 1.02),
        clip: this.pickClip(m, kind, rng),
      });
    };

    if (kind === 'cough') {
      const m = free.length ? rng.pick(free) : null;
      if (m) add(m, 0, rng.between(/** @type {[number, number]} */ (r.cough.durMs)), 0.9);
    } else if (kind === 'titter' || kind === 'ripple') {
      const spec = r[kind];
      const people = this.choose(free, rng.int(spec.count[0], spec.count[1]), rng);
      for (const m of people) {
        const gain = kind === 'titter' ? rng.range(0.55, 0.85) : rng.range(0.75, 1.0);
        add(m, rng.range(0, spec.spreadMs), rng.between(/** @type {[number, number]} */ (spec.durMs)), gain);
      }
    } else if (kind === 'laugh') {
      const spec = r.laugh;
      const n = Math.round(rng.between(/** @type {[number, number]} */ (spec.fraction)) * this.members.length);
      const people = this.choose(free, n, rng);
      const starters = rng.int(spec.starters[0], spec.starters[1]);
      people.forEach((m, i) => {
        const starter = i < starters;
        const delay = starter
          ? rng.range(0, spec.starterSpreadMs)
          : spec.starterSpreadMs + (spec.spreadMs - spec.starterSpreadMs) * Math.pow(rng.next(), 1.6);
        const dur = rng.between(/** @type {[number, number]} */ (spec.durMs)) * (starter ? 1.1 : rng.range(0.6, 1.0));
        add(m, delay, dur, starter ? 1 : rng.range(0.6, 1.0));
      });
    } else if (kind === 'applause') {
      const spec = r.applause;
      const n = Math.round(rng.between(/** @type {[number, number]} */ (spec.fraction)) * this.members.length);
      for (const m of this.choose(free, n, rng)) {
        add(m, spec.spreadMs * Math.pow(rng.next(), 1.5), rng.between(/** @type {[number, number]} */ (spec.durMs)), rng.range(0.7, 1.0));
      }
    }

    let durationMs = 0;
    for (const p of participants) {
      durationMs = Math.max(durationMs, p.delayMs + p.durationMs);
      this.members[p.memberId].busyUntil = at + p.delayMs + p.durationMs;
    }
    return { type: 'reaction', kind, at, source, participants, durationMs };
  }

  /** Plan and announce a reaction. @param {ReactionKind} kind @param {number} at @param {string} source */
  trigger(kind, at, source) {
    this.update(at);
    const plan = this.planReaction(kind, at, source);
    if (plan.durationMs > 0) this.active.push({ kind, endAt: at + plan.durationMs });
    this.emit(plan);
    return plan;
  }

  /** Announce an outcome; silence is an outcome too. @param {Outcome} outcome @param {number} at @param {string} source */
  triggerOutcome(outcome, at, source) {
    if (outcome === 'silence') {
      /** @type {ReactionPlan} */
      const plan = { type: 'reaction', kind: 'silence', at, source, participants: [], durationMs: 0 };
      this.emit(plan);
      return plan;
    }
    return this.trigger(outcome, at, source);
  }

  /** Stop: free everyone and tell audio and rendering to cancel. @param {number} now */
  cancelAll(now) {
    for (const m of this.members) m.busyUntil = Math.min(m.busyUntil, now);
    this.active = [];
    this.emit({ type: 'cancel', at: now });
  }

  /** A short label for the debug overlay. @param {number} now */
  stateLabel(now) {
    const kinds = new Set(this.active.filter((a) => a.endAt > now).map((a) => a.kind));
    for (const [kind, label] of [
      ['applause', 'applauding'],
      ['laugh', 'laughing'],
      ['ripple', 'rippling'],
      ['titter', 'tittering'],
      ['cough', 'coughing'],
    ]) {
      if (kinds.has(kind)) return label;
    }
    return this.sessionState === 'running' ? 'watching' : 'chatting';
  }

  lookingCount() {
    return this.members.filter((m) => m.attention === 'stage').length;
  }
}
