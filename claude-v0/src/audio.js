// @ts-check
/**
 * Sound: one AudioContext, a spatial (HRTF) voice per person, room murmur, bar sounds,
 * and reactions built from individual voices with staggered starts.
 *
 * Sources: if /assets/audio/manifest.json exists, its clips are used per kind.
 * Anything missing falls back to placeholders synthesised here, so the build always runs.
 *
 * Manifest format (paths relative to /assets/audio/):
 *   { "laugh": ["laugh/01.ogg", …], "titter": […], "applause": […], "cough": […],
 *     "glass": […], "shuffle": […], "murmur": […] }
 */

import { CONFIG } from './config.js';
import { createStream, Rng } from './rng.js';

/** @typedef {import('./crowd.js').Member} Member */
/** @typedef {import('./crowd.js').ReactionPlan} ReactionPlan */
/** @typedef {'laugh'|'titter'|'applause'|'cough'|'glass'|'shuffle'|'murmur'} ClipKind */
/** @typedef {Record<ClipKind, AudioBuffer[]>} ClipBank */

const SR = CONFIG.audio.sampleRate;
const KINDS = /** @type {ClipKind[]} */ (['laugh', 'titter', 'applause', 'cough', 'glass', 'shuffle', 'murmur']);
const LIBRARY_URL = new URL('../../assets/audio/', import.meta.url);

// ---------------------------------------------------------------------------------
// Placeholder synthesis
// ---------------------------------------------------------------------------------

/** Scale a buffer so its loudest sample is `peak`. @param {AudioBuffer} buf @param {number} peak */
function normalise(buf, peak = 0.9) {
  const d = buf.getChannelData(0);
  let max = 1e-6;
  for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  const k = peak / max;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return buf;
}

/** @param {BaseAudioContext} ctx @param {number} seconds @param {Rng} rng */
function noiseBuffer(ctx, seconds, rng) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rng.range(-1, 1);
  return b;
}

/** @param {number} seconds @param {(ctx: OfflineAudioContext, out: AudioNode) => void} build */
async function renderOffline(seconds, build) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  build(ctx, out);
  return normalise(await ctx.startRendering());
}

/**
 * A "ha-ha-ha": pulses of a buzzy voice through two vowel filters, with breathy onsets.
 * @param {Rng} rng
 * @param {{ syllables: [number, number], f0: [number, number], vowel: [number, number], breath: number, rate: [number, number] }} o
 */
function synthLaugh(rng, o) {
  const n = rng.int(o.syllables[0], o.syllables[1]);
  const rate = rng.between(o.rate);
  const dur = n / rate + 0.6;
  const f0 = rng.between(o.f0);
  return renderOffline(dur, (ctx, out) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, dur, rng);
    const voice = ctx.createGain();
    voice.gain.value = 0;
    const breath = ctx.createGain();
    breath.gain.value = 0;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = o.vowel[0] * rng.range(0.9, 1.1);
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = o.vowel[1] * rng.range(0.9, 1.1);
    f2.Q.value = 7;
    const f2g = ctx.createGain();
    f2g.gain.value = 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    osc.connect(voice);
    voice.connect(f1).connect(out);
    voice.connect(f2).connect(f2g).connect(out);
    noise.connect(breath).connect(hp).connect(out);
    let t = 0.04;
    for (let i = 0; i < n; i++) {
      const amp = 1 - (i / n) * 0.55;
      osc.frequency.setValueAtTime(f0 * (1.18 - 0.32 * (i / n)) * rng.range(0.96, 1.04), t);
      breath.gain.setValueAtTime(0, t);
      breath.gain.linearRampToValueAtTime(o.breath * amp, t + 0.02);
      breath.gain.linearRampToValueAtTime(0, t + 0.05);
      voice.gain.setValueAtTime(0, t + 0.02);
      voice.gain.linearRampToValueAtTime(amp, t + 0.045);
      voice.gain.linearRampToValueAtTime(amp * 0.6, t + 0.1);
      voice.gain.linearRampToValueAtTime(0, t + 0.16);
      t += (1 / rate) * rng.range(0.88, 1.12);
    }
    // A breath in at the end.
    breath.gain.setValueAtTime(0, t + 0.05);
    breath.gain.linearRampToValueAtTime(o.breath * 0.35, t + 0.25);
    breath.gain.linearRampToValueAtTime(0, t + 0.5);
    osc.start(0);
    noise.start(0);
  });
}

/** @param {Rng} rng */
function synthCough(rng) {
  return renderOffline(0.9, (ctx, out) => {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 0.9, rng);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rng.range(450, 900);
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0;
    noise.connect(bp).connect(g).connect(out);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = rng.range(95, 160);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const og = ctx.createGain();
    og.gain.value = 0;
    osc.connect(lp).connect(og).connect(out);
    const bursts = rng.chance(0.5) ? [0.02, 0.38] : [0.02];
    bursts.forEach((t, i) => {
      const a = i === 0 ? 1 : 0.55;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.25 * a, t + 0.12);
      g.gain.linearRampToValueAtTime(0, t + 0.32);
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.4 * a, t + 0.015);
      og.gain.linearRampToValueAtTime(0, t + 0.15);
    });
    noise.start(0);
    osc.start(0);
  });
}

/** RBJ band-pass biquad, applied in place. @param {Float32Array} d @param {number} f @param {number} q */
function bandpassInPlace(d, f, q) {
  const w = (2 * Math.PI * f) / SR;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y;
  }
}

/** @param {number} seconds */
function emptyBuffer(seconds) {
  return new AudioBuffer({ length: Math.ceil(seconds * SR), sampleRate: SR, numberOfChannels: 1 });
}

/** One person clapping for 6 s, building up and tailing off. @param {Rng} rng */
function synthClapping(rng) {
  const seconds = 6;
  const buf = emptyBuffer(seconds);
  const d = buf.getChannelData(0);
  const rate = rng.range(3.6, 5.2);
  const centre = rng.range(1100, 2400);
  let t = rng.range(0, 0.12);
  while (t < seconds - 0.1) {
    const start = Math.floor(t * SR);
    const len = Math.floor(0.045 * SR);
    const amp = rng.range(0.6, 1.0);
    for (let i = 0; i < len && start + i < d.length; i++) {
      d[start + i] += rng.range(-1, 1) * amp * Math.exp(-i / (0.006 * SR));
    }
    t += (1 / rate) * rng.range(0.85, 1.15);
  }
  bandpassInPlace(d, centre, 0.9);
  for (let i = 0; i < d.length; i++) {
    const s = i / SR;
    d[i] *= Math.min(1, s / 0.25) * Math.min(1, (seconds - s) / 1.5);
  }
  return normalise(buf);
}

/** @param {Rng} rng */
function synthGlass(rng) {
  const buf = emptyBuffer(0.7);
  const d = buf.getChannelData(0);
  const f = rng.range(2000, 3300);
  const partials = [
    [1, 1, 0.35],
    [2.32, 0.5, 0.2],
    [4.25, 0.25, 0.1],
  ];
  const second = rng.chance(0.5) ? rng.range(0.08, 0.2) : -1;
  for (let i = 0; i < d.length; i++) {
    const s = i / SR;
    let v = 0;
    for (const [m, a, dec] of partials) {
      v += a * Math.sin(2 * Math.PI * f * m * s) * Math.exp(-s / dec);
      if (second > 0 && s > second) v += 0.6 * a * Math.sin(2 * Math.PI * f * 1.07 * m * (s - second)) * Math.exp(-(s - second) / dec);
    }
    d[i] = v;
  }
  return normalise(buf, 0.6);
}

/** @param {Rng} rng */
function synthShuffle(rng) {
  const buf = emptyBuffer(0.6);
  const d = buf.getChannelData(0);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    const s = i / SR;
    y += 0.08 * (rng.range(-1, 1) - y);
    d[i] = y * Math.sin(Math.PI * Math.min(1, s / 0.6)) * (0.6 + 0.4 * Math.sin(s * 37));
  }
  return normalise(buf, 0.5);
}

/** Twelve seconds of indistinct chatter from six talkers. @param {Rng} rng */
function synthMurmur(rng) {
  const seconds = 12;
  return renderOffline(seconds, (ctx, out) => {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(out);
    const vowels = [
      [750, 1250],
      [550, 1800],
      [400, 2100],
      [600, 1000],
      [450, 900],
    ];
    for (let k = 0; k < 6; k++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const base = rng.range(95, 230);
      const g = ctx.createGain();
      g.gain.value = 0;
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 4;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.Q.value = 6;
      osc.connect(g);
      g.connect(f1).connect(lp);
      g.connect(f2).connect(lp);
      const level = rng.range(0.3, 1);
      let t = rng.range(0, 1.5);
      while (t < seconds - 0.3) {
        const phraseEnd = Math.min(seconds - 0.3, t + rng.range(1, 3));
        while (t < phraseEnd) {
          const v = rng.pick(vowels);
          f1.frequency.setValueAtTime(v[0], t);
          f2.frequency.setValueAtTime(v[1], t);
          osc.frequency.setValueAtTime(base * rng.range(0.85, 1.2), t);
          const syl = rng.range(0.1, 0.2);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(level, t + 0.03);
          g.gain.linearRampToValueAtTime(0, t + syl);
          t += syl + rng.range(0.03, 0.12);
        }
        t += rng.range(0.3, 1.2);
      }
      osc.start(0);
    }
    // A soft room bed under the voices.
    const bed = ctx.createBufferSource();
    bed.buffer = noiseBuffer(ctx, seconds, rng);
    const bedLp = ctx.createBiquadFilter();
    bedLp.type = 'lowpass';
    bedLp.frequency.value = 400;
    const bedG = ctx.createGain();
    bedG.gain.value = 0.15;
    bed.connect(bedLp).connect(bedG).connect(out);
    bed.start(0);
  });
}

/** @returns {Promise<ClipBank>} */
async function buildPlaceholders() {
  /** @param {string} name */
  const rng = (name) => createStream(1, `placeholder:${name}`);
  const counts = { laugh: 8, titter: 6, applause: 4, cough: 4, glass: 6, shuffle: 4 };
  const laughVowels = /** @type {[number, number][]} */ ([
    [750, 1250],
    [600, 1700],
    [700, 1100],
  ]);
  const jobs = {
    laugh: Array.from({ length: counts.laugh }, (_, i) =>
      synthLaugh(rng(`laugh${i}`), { syllables: [5, 10], f0: i % 2 ? [190, 280] : [110, 170], vowel: laughVowels[i % 3], breath: 0.35, rate: [4.5, 6] }),
    ),
    titter: Array.from({ length: counts.titter }, (_, i) =>
      synthLaugh(rng(`titter${i}`), { syllables: [2, 4], f0: i % 2 ? [210, 300] : [130, 190], vowel: [420, 2000], breath: 0.7, rate: [5, 7] }),
    ),
    applause: Array.from({ length: counts.applause }, (_, i) => Promise.resolve(synthClapping(rng(`clap${i}`)))),
    cough: Array.from({ length: counts.cough }, (_, i) => synthCough(rng(`cough${i}`))),
    glass: Array.from({ length: counts.glass }, (_, i) => Promise.resolve(synthGlass(rng(`glass${i}`)))),
    shuffle: Array.from({ length: counts.shuffle }, (_, i) => Promise.resolve(synthShuffle(rng(`shuffle${i}`)))),
    murmur: [synthMurmur(rng('murmur'))],
  };
  /** @type {Partial<ClipBank>} */
  const bank = {};
  for (const kind of KINDS) bank[kind] = await Promise.all(jobs[kind]);
  return /** @type {ClipBank} */ (bank);
}

// ---------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------

/** @typedef {{ src: AudioBufferSourceNode, gain: GainNode, panner: PannerNode, when: number, reaction: boolean }} Voice */

export class AudioEngine {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    /** @type {ClipBank | null} */
    this.bank = null;
    /** @type {Record<string, 'library'|'placeholder'>} */
    this.sourceOf = {};
    /** @type {Set<Voice>} */
    this.voices = new Set();
    /** @type {Member[]} */
    this.members = [];
    this.volume = CONFIG.audio.volumeDefault;
    this.murmurLevel = 0.35;
    this.roomToneStarted = false;
    /** @type {GainNode | null} */ this.master = null;
    /** @type {GainNode | null} */ this.reactionBus = null;
    /** @type {GainNode | null} */ this.ambienceBus = null;
    /** @type {GainNode | null} */ this.murmurBus = null;
    this.barPos = { x: 0, y: CONFIG.venue.audienceFloorY + 1.2, z: CONFIG.venue.roomBackZ + 0.6 };
  }

  /** Synthesise placeholders and load any library clips. Safe to call before a user gesture. */
  async prepare() {
    const bank = await buildPlaceholders();
    for (const k of KINDS) this.sourceOf[k] = 'placeholder';
    try {
      const res = await fetch(new URL('manifest.json', LIBRARY_URL), { cache: 'no-cache' });
      if (res.ok) {
        const manifest = await res.json();
        const decoder = new OfflineAudioContext(1, 1, SR);
        for (const k of KINDS) {
          const files = manifest[k];
          if (!Array.isArray(files) || files.length === 0) continue;
          const decoded = await Promise.all(
            files.map(async (/** @type {string} */ f) => decoder.decodeAudioData(await (await fetch(new URL(f, LIBRARY_URL))).arrayBuffer())),
          );
          bank[k] = decoded;
          this.sourceOf[k] = 'library';
        }
      }
    } catch (err) {
      console.warn('Sound library not loaded; using placeholders.', err);
    }
    this.bank = bank;
    return this.clipCounts();
  }

  clipCounts() {
    const b = this.bank;
    return {
      laugh: b?.laugh.length ?? 1,
      ripple: b?.laugh.length ?? 1,
      titter: b?.titter.length ?? 1,
      applause: b?.applause.length ?? 1,
      cough: b?.cough.length ?? 1,
    };
  }

  /** Create or resume the AudioContext. Call from a click or button press. */
  ensureContext() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      this.master.connect(comp).connect(ctx.destination);
      this.reactionBus = ctx.createGain();
      this.reactionBus.gain.value = 0.55;
      this.ambienceBus = ctx.createGain();
      this.ambienceBus.gain.value = 0.45;
      this.murmurBus = ctx.createGain();
      this.murmurBus.gain.value = this.murmurLevel;
      for (const bus of [this.reactionBus, this.ambienceBus, this.murmurBus]) bus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.startRoomTone();
    return this.ctx;
  }

  /** @param {Member[]} members */
  setMembers(members) {
    this.members = members;
  }

  /** @param {{ x: number, y: number, z: number }} pos @param {boolean} hrtf */
  makePanner(pos, hrtf) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const p = ctx.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 1.2;
    p.rolloffFactor = 1;
    p.maxDistance = 25;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    return p;
  }

  startRoomTone() {
    if (this.roomToneStarted || !this.ctx || !this.bank || !this.murmurBus) return;
    this.roomToneStarted = true;
    const ctx = this.ctx;
    const buf = this.bank.murmur[0];
    const spots = [
      { x: -1.6, y: 0.7, z: -3.4 },
      { x: 1.5, y: 0.7, z: -4.6 },
      { x: -0.6, y: 0.7, z: -6.0 },
      { x: 0.4, y: 0.9, z: CONFIG.venue.roomBackZ + 0.9 },
    ];
    spots.forEach((pos, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.94 + i * 0.04;
      const g = ctx.createGain();
      g.gain.value = i === 3 ? 0.5 : 0.8;
      src.connect(g).connect(this.makePanner(pos, false)).connect(/** @type {GainNode} */ (this.murmurBus));
      src.start(ctx.currentTime + 0.05, (i * buf.duration) / spots.length);
    });
  }

  /** Room hushes while a set is running. @param {string} state */
  setSessionState(state) {
    if (!this.ctx || !this.murmurBus) return;
    const target = state === 'running' ? this.murmurLevel * CONFIG.audio.hushGain : this.murmurLevel;
    this.murmurBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.8);
  }

  /** @param {number} v 0–1 */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  /** Keep the listener at the performer's head. @param {import('three').Matrix4} m camera.matrixWorld */
  updateListener(m) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const e = m.elements;
    const px = e[12];
    const py = e[13];
    const pz = e[14];
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    const ux = e[4];
    const uy = e[5];
    const uz = e[6];
    if (L.positionX) {
      L.positionX.value = px;
      L.positionY.value = py;
      L.positionZ.value = pz;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = ux;
      L.upY.value = uy;
      L.upZ.value = uz;
    } else {
      L.setPosition(px, py, pz);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /**
   * @param {AudioBuffer} buffer
   * @param {{ when: number, gain: number, pitch: number, maxDur: number, pos: { x: number, y: number, z: number }, hrtf: boolean, bus: AudioNode }} o
   */
  playVoice(buffer, o) {
    const ctx = this.ctx;
    if (!ctx || this.voices.size >= CONFIG.audio.maxVoices) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = o.pitch;
    const gain = ctx.createGain();
    const length = Math.min(buffer.duration / o.pitch, o.maxDur);
    gain.gain.setValueAtTime(0, o.when);
    gain.gain.linearRampToValueAtTime(o.gain, o.when + 0.02);
    if (length < buffer.duration / o.pitch - 0.05) {
      gain.gain.setValueAtTime(o.gain, Math.max(o.when + 0.03, o.when + length - 0.3));
      gain.gain.linearRampToValueAtTime(0, o.when + length);
    }
    const panner = this.makePanner(o.pos, o.hrtf);
    src.connect(gain).connect(panner).connect(o.bus);
    /** @type {Voice} */
    const voice = { src, gain, panner, when: o.when, reaction: o.bus === this.reactionBus };
    this.voices.add(voice);
    src.onended = () => this.dropVoice(voice);
    src.start(o.when);
    src.stop(o.when + length + 0.05);
  }

  /** @param {ReactionPlan} plan */
  playReaction(plan) {
    if (!this.ctx || !this.bank || plan.kind === 'silence' || !this.reactionBus) return;
    // Ripples are small group laughs and use the laugh clips.
    const clips = this.bank[plan.kind === 'ripple' ? 'laugh' : plan.kind];
    const now = this.ctx.currentTime + 0.02;
    for (const p of plan.participants) {
      const m = this.members[p.memberId];
      if (!m) continue;
      const bus = plan.kind === 'cough' ? this.ambienceBus : this.reactionBus;
      this.playVoice(clips[p.clip % clips.length], {
        when: now + p.delayMs / 1000,
        gain: p.gain,
        pitch: p.pitch,
        maxDur: p.durationMs / 1000,
        pos: m.head,
        hrtf: CONFIG.audio.hrtfBackRows || m.seat.row < 2,
        bus: /** @type {AudioNode} */ (bus),
      });
    }
  }

  /** @param {{ kind: string, memberId?: number, clip?: number, gain?: number, pitch?: number, durationMs?: number }} e */
  playAmbient(e) {
    if (!this.ctx || !this.bank || !this.ambienceBus) return;
    const now = this.ctx.currentTime + 0.02;
    const clip = e.clip ?? 0;
    if (e.kind === 'glass') {
      const clips = this.bank.glass;
      this.playVoice(clips[clip % clips.length], { when: now, gain: 0.35, pitch: 1, maxDur: 2, pos: this.barPos, hrtf: false, bus: this.ambienceBus });
      return;
    }
    const m = e.memberId === undefined ? null : this.members[e.memberId];
    if (!m) return;
    const kind = e.kind === 'cough' ? 'cough' : 'shuffle';
    const clips = this.bank[kind];
    this.playVoice(clips[clip % clips.length], {
      when: now,
      gain: kind === 'cough' ? (e.gain ?? 0.7) : 0.3,
      pitch: e.pitch ?? 1,
      maxDur: (e.durationMs ?? 1500) / 1000 + 0.2,
      pos: m.head,
      hrtf: true,
      bus: this.ambienceBus,
    });
  }

  /** @param {Voice} v */
  dropVoice(v) {
    if (!this.voices.delete(v)) return;
    v.src.disconnect();
    v.gain.disconnect();
    v.panner.disconnect();
  }

  /**
   * Stop: cancel every reaction voice not yet started (silenced and dropped at once),
   * and fade out the ones already playing. Room tone and bar sounds carry on.
   */
  cancelAll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const fade = CONFIG.audio.cancelFadeMs / 1000;
    for (const v of [...this.voices]) {
      if (!v.reaction) continue;
      try {
        if (v.when > now) {
          v.src.onended = null;
          v.src.stop(0);
          this.dropVoice(v);
        } else {
          v.gain.gain.cancelScheduledValues(now);
          v.gain.gain.setValueAtTime(v.gain.gain.value, now);
          v.gain.gain.linearRampToValueAtTime(0, now + fade);
          v.src.stop(now + fade + 0.02);
        }
      } catch {
        // Already stopped.
      }
    }
  }

  pendingVoices() {
    return this.voices.size;
  }

  reactionVoices() {
    let n = 0;
    for (const v of this.voices) if (v.reaction) n++;
    return n;
  }
}
