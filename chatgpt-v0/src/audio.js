// @ts-check

import { CONFIG, clamp } from './config.js';
import { range, stream } from './rng.js';

/** @typedef {import('./config.js').AudioKind} AudioKind */
/** @typedef {import('./crowd.js').Member} Member */
/** @typedef {import('./events.js').ReactionEvent} ReactionEvent */
/** @typedef {import('./events.js').SessionState} SessionState */
/** @typedef {{x:number,y:number,z:number}} XYZ */
/** @typedef {{source:AudioBufferSourceNode,gain:GainNode,start:number,end:number}} Voice */
/** @typedef {{source:AudioBufferSourceNode,gain:GainNode,panner:PannerNode}} Bed */
const RATE = 22050;
const TAU = Math.PI * 2;

const KINDS = /** @type {AudioKind[]} */ ([
  'titter', 'ripple', 'laugh', 'applause', 'cough', 'shuffle', 'glass', 'murmur', 'bar',
]);
/** @type {Record<AudioKind, number>} */
const VARIANTS = { titter: 8, ripple: 9, laugh: 12, applause: 8, cough: 6, shuffle: 4, glass: 5, murmur: 3, bar: 2 };
/** @type {Record<AudioKind, number>} */
const LENGTHS = { titter: 1.25, ripple: 2.0, laugh: 2.75, applause: 4.1, cough: 0.95, shuffle: 1.05, glass: 0.8, murmur: 7.0, bar: 8.4 };
/** @type {Record<AudioKind, number>} */
const GAINS = { titter: 0.20, ripple: 0.18, laugh: 0.20, applause: 0.14,
  cough: 0.23, shuffle: 0.093, glass: 0.12, murmur: 0.07, bar: 0.055 };

// Original synthesised placeholders; no speech recordings, special samples,
// AI voices or downloaded audio. Human clips can replace each bank later.
/** @param {AudioContext} context @param {AudioKind} kind @param {number} variant */
function placeholder(context, kind, variant) {
  const rng = stream('stage-time-original-audio-v0', kind + '/' + variant);
  const length = LENGTHS[kind];
  const buffer = context.createBuffer(1, Math.ceil(RATE * length), RATE);
  const data = buffer.getChannelData(0);

  if (kind === 'titter' || kind === 'ripple' || kind === 'laugh') {
    // Breath and voiced harmonic impulses with individually staggered,
    // irregular syllables. Intentionally a sketch of a laugh, not a recording.
    const base = range(rng, 112, 248);
    let onset = range(rng, 0.015, 0.07);
    while (onset < length - 0.12) {
      const dur = range(rng, 0.115, kind === 'titter' ? 0.24 : 0.34);
      const start = Math.floor(onset * RATE);
      const samples = Math.min(data.length - start, Math.floor(dur * RATE));
      const pitch = base * range(rng, 0.82, 1.18);
      const power = range(rng, 0.46, 1.0) * (1 - onset / length * 0.35);
      let phase = rng() * TAU, lowNoise = 0;
      for (let i = 0; i < samples; i++) {
        const t = i / Math.max(1, samples - 1);
        const env = Math.pow(Math.sin(Math.PI * t), 0.72) * Math.exp(-0.45 * t);
        phase += TAU / RATE * pitch * (1.14 - 0.29 * t + 0.035 * Math.sin(t * TAU));
        const white = rng() * 2 - 1;
        lowNoise += (white - lowNoise) * 0.31;
        const airy = white - lowNoise * 0.54;
        const voiced = Math.sin(phase) * 0.43 + Math.sin(phase * 2 + 0.3) * 0.31
          + Math.sin(phase * 3) * 0.15 + Math.sin(phase * 5 + 0.8) * 0.07;
        data[start + i] += power * env * (voiced * 0.56 + airy * 0.25);
      }
      onset += dur + range(rng, 0.025, 0.14);
      if (kind === 'titter' && onset > length * 0.72) break;
    }
  } else if (kind === 'applause') {
    let at = range(rng, 0.015, 0.16);
    while (at < length - 0.07) {
      const start = Math.floor(at * RATE);
      const count = Math.min(data.length - start, Math.floor(RATE * range(rng, 0.045, 0.095)));
      const power = range(rng, 0.50, 1);
      let low = 0;
      for (let i = 0; i < count; i++) {
        const t = i / RATE, white = rng() * 2 - 1;
        low += (white - low) * 0.29;
        const env = Math.min(1, t * 1800) * Math.exp(-t * 66);
        data[start + i] += power * env * (white * 0.53 + low * 0.46);
      }
      at += range(rng, 0.19, 0.36);
    }
  } else if (kind === 'cough' || kind === 'shuffle') {
    let low = 0, slow = 0;
    const double = kind === 'cough' && variant % 3 === 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / RATE, white = rng() * 2 - 1;
      low += (white - low) * 0.28;
      slow += (white - slow) * 0.045;
      const burst = Math.min(1, t * 75) * Math.exp(-t * (kind === 'cough' ? 9 : 5));
      const second = double && t > 0.33 ? Math.min(1, (t - 0.33) * 60) * Math.exp(-(t - 0.33) * 15) : 0;
      const endFade = Math.min(1, Math.max(0, (length - t) * 15));
      data[i] = (burst + second * 0.74) * endFade *
        (kind === 'cough' ? low * 0.8 + (low - slow) * 0.7 + Math.sin(t * TAU * 118) * 0.09
          : (low - slow) * 0.53 + white * 0.10);
    }
  } else if (kind === 'glass') {
    const f = range(rng, 850, 1470);
    for (let i = 0; i < data.length; i++) {
      const t = i / RATE;
      const env = Math.min(1, t * 1400) * Math.exp(-t * 11);
      data[i] = env * (Math.sin(t * TAU * f) * 0.46 + Math.sin(t * TAU * f * 1.57) * 0.25
        + Math.sin(t * TAU * f * 2.21) * 0.12 + (rng() * 2 - 1) * Math.exp(-t * 70) * 0.24);
    }
  } else {
    // Non-intelligible room-tone loops. Different slowly moving bands and
    // offsets suggest nearby chatter without making up spoken words.
    let low = 0, veryLow = 0, phase = rng() * TAU;
    const f = range(rng, 96, 168);
    for (let i = 0; i < data.length; i++) {
      const t = i / RATE, white = rng() * 2 - 1;
      low += (white - low) * 0.11;
      veryLow += (low - veryLow) * 0.025;
      phase += TAU / RATE * f * (1 + 0.05 * Math.sin(t * 2.7 + variant));
      const swell = 0.56 + 0.19 * Math.sin(t * 3.1 + variant) + 0.12 * Math.sin(t * 7.7 + 1.7 * variant);
      const seam = Math.min(1, t * 5, (length - t) * 5);
      const hum = Math.sin(phase) * 0.018 + Math.sin(phase * 2.02) * 0.009;
      data[i] = seam * (low * 0.36 + veryLow * 0.75 + (low - veryLow) * 0.2 + hum) * swell;
    }
  }
  let peak = 0;
  for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) {
    const multiplier = (kind === 'murmur' || kind === 'bar' ? 0.52 : 0.76) / peak;
    for (let i = 0; i < data.length; i++) data[i] *= multiplier;
  }
  return buffer;
}

/** @param {PannerNode} panner @param {XYZ} p */
function movePanner(panner, p) {
  if (panner.positionX) {
    panner.positionX.value = p.x;
    panner.positionY.value = p.y;
    panner.positionZ.value = p.z;
  } else {
    panner.setPosition(p.x, p.y, p.z);
  }
}

/** @param {AudioParam} param @param {number} now */
function holdParameter(param, now) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
  else {
    const value = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
  }
}

export class StageAudio {
  /** @param {(message:string) => void} notice */
  constructor(notice) {
    this.notice = notice;
    /** @type {AudioContext | null} */
    this.context = null;
    /** @type {GainNode | null} */
    this.master = null;
    /** @type {GainNode | null} */
    this.roomBus = null;
    /** @type {DynamicsCompressorNode | null} */
    this.limiter = null;
    /** @type {Map<number, PannerNode>} */
    this.panners = new Map();
    /** @type {Map<AudioKind, AudioBuffer[]>} */
    this.banks = new Map();
    /** @type {Set<Voice>} */
    this.voices = new Set();
    /** @type {Bed[]} */
    this.beds = [];
    /** @type {Map<number, AudioBuffer>} */
    this.previousClip = new Map();
    /** @type {number} */
    this.volume = CONFIG.defaultVolume;
    this.active = false;
    this.sharedClips = 0;
    this.loadingAssets = false;
    this.hrtfBackRows = true;
    /** @type {{kind:'murmur'|'bar', position:XYZ}[]} */
    this.bedPositions = [
      { kind: 'murmur', position: { x: -1.45, y: 0.78, z: -3.55 } },
      { kind: 'murmur', position: { x: 1.50, y: 0.75, z: -3.08 } },
      { kind: 'bar', position: { x: 0, y: 0.64, z: -5.8 } },
    ];
  }

  /** Must be called synchronously from a user gesture. */
  ensureContext() {
    if (this.context && this.context.state !== 'closed') return this.context;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.roomBus = ctx.createGain();
    this.roomBus.gain.value = 1;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 14;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.17;
    this.roomBus.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.banks.clear();
    return ctx;
  }

  async unlock() {
    const ctx = this.ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    return ctx;
  }

  /** Build the fallback banks once and then read the common sound manifest.
   * Missing, empty or invalid files cannot block VR. */
  prepare() {
    const ctx = this.context;
    if (!ctx || this.banks.size) return;
    for (const kind of KINDS) {
      this.banks.set(kind, Array.from({ length: VARIANTS[kind] }, (_, i) => placeholder(ctx, kind, i)));
    }
    void this.loadShared();
  }

  async loadShared() {
    const ctx = this.context;
    if (!ctx || this.loadingAssets) return;
    this.loadingAssets = true;
    const base = new URL('../../assets/audio/', import.meta.url);
    /** @type {Record<string, unknown>} */
    let manifest;
    try {
      const response = await fetch(new URL('manifest.json', base), { credentials: 'same-origin', cache: 'no-cache' });
      if (!response.ok) throw new Error('Sound manifest unavailable.');
      const supplied = await response.json();
      if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('Invalid sound manifest.');
      manifest = supplied;
    } catch {
      // A missing library is a normal prototype condition, not a blocker.
      this.loadingAssets = false;
      return;
    }
    /** @type {Map<string, AudioBuffer>} */
    const decodedFiles = new Map();
    let unavailable = 0;
    for (const kind of KINDS) {
      /** @type {AudioBuffer[]} */
      const valid = [];
      // The common manifest uses individual laugh clips for ripples too.
      const names = kind === 'ripple' && !Array.isArray(manifest.ripple)
        ? manifest.laugh : manifest[kind];
      if (!Array.isArray(names)) continue;
      for (const name of names.slice(0, 100)) {
        if (typeof name !== 'string' || !name.length) continue;
        try {
          const url = new URL(name, base);
          if (!url.href.startsWith(base.href)) throw new Error('Asset is outside the shared audio directory.');
          let decoded = decodedFiles.get(url.href);
          if (!decoded) {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Shared sound unavailable.');
            decoded = await ctx.decodeAudioData(await response.arrayBuffer());
            if (decoded.duration > 0) decodedFiles.set(url.href, decoded);
          }
          if (decoded.duration > 0 && !valid.includes(decoded)) valid.push(decoded);
        } catch {
          unavailable++;
        }
      }
      if (valid.length && this.context === ctx) {
        // Even a one-clip partial library has a different fallback voice
        // available if the same seat made the previous reaction.
        if (valid.length === 1 && kind !== 'murmur' && kind !== 'bar') {
          const fallback = this.banks.get(kind)?.[0];
          if (fallback) valid.push(fallback);
        }
        this.banks.set(kind, valid);
      }
    }
    if (this.context === ctx) {
      this.sharedClips = decodedFiles.size;
      if (this.active && (Array.isArray(manifest.murmur) || Array.isArray(manifest.bar)) && decodedFiles.size) {
        this.stopBeds();
        this.activate();
      }
    }
    this.loadingAssets = false;
    if (unavailable) this.notice('Some shared sound files were unavailable; using placeholders where needed.');
  }

  /** @param {boolean} [hrtf] */
  makePanner(hrtf = true) {
    const ctx = this.context;
    if (!ctx) throw new Error('Audio was not initialised.');
    const p = ctx.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 1.15;
    p.rolloffFactor = 0.83;
    p.maxDistance = 25;
    return p;
  }

  /** @param {Member[]} members */
  configure(members) {
    if (!this.context || !this.master) return;
    this.cancelReactions();
    this.stopBeds();
    this.panners.forEach(p => p.disconnect());
    this.panners.clear();
    this.previousClip.clear();
    this.prepare();
    for (const m of members) {
      const panner = this.makePanner(this.hrtfBackRows || m.seat.row < 3);
      movePanner(panner, {
        x: m.seat.x, y: CONFIG.audienceFloor + 0.53 + 0.687 * m.height, z: m.seat.z + 0.02,
      });
      panner.connect(this.master);
      this.panners.set(m.seat.id, panner);
    }
    const bar = this.makePanner();
    movePanner(bar, this.bedPositions[2].position);
    bar.connect(this.master);
    this.panners.set(-1, bar);
  }

  activate() {
    this.active = true;
    const ctx = this.context;
    if (!ctx || !this.roomBus || this.beds.length) return;
    this.prepare();
    this.bedPositions.forEach((position, i) => {
      const bank = this.banks.get(position.kind);
      if (!bank?.length || !this.roomBus || !this.context) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const panner = this.makePanner();
      source.buffer = bank[i % bank.length];
      source.loop = true;
      source.playbackRate.value = 0.92 + 0.055 * i;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(GAINS[position.kind], ctx.currentTime + 0.5);
      movePanner(panner, position.position);
      source.connect(gain);
      gain.connect(panner);
      panner.connect(this.roomBus);
      source.start(ctx.currentTime + 0.025, source.buffer.duration * (i * 0.23 % 0.9));
      this.beds.push({ source, gain, panner });
    });
  }

  /** @param {SessionState} state */
  setState(state) {
    if (!this.context || !this.roomBus) return;
    this.roomBus.gain.setTargetAtTime(state === 'running' ? 0.39 : 1, this.context.currentTime, 0.18);
  }

  /** @param {number} value */
  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.055);
    }
  }

  /** @param {XYZ} position @param {XYZ} forward @param {XYZ} up */
  setListener(position, forward, up) {
    const listener = this.context?.listener;
    if (!listener) return;
    if (listener.positionX) {
      listener.positionX.value = position.x; listener.positionY.value = position.y; listener.positionZ.value = position.z;
      listener.forwardX.value = forward.x; listener.forwardY.value = forward.y; listener.forwardZ.value = forward.z;
      listener.upX.value = up.x; listener.upY.value = up.y; listener.upZ.value = up.z;
    } else {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** @param {number} seatId @param {XYZ} position */
  setSeatPosition(seatId, position) {
    const panner = this.panners.get(seatId);
    if (panner) movePanner(panner, position);
  }

  /** @param {number} index @param {XYZ} position */
  setBedPosition(index, position) {
    const bed = this.beds[index];
    if (bed) movePanner(bed.panner, position);
  }

  /** @param {ReactionEvent} event @param {number} nowMs */
  play(event, nowMs) {
    const ctx = this.context;
    if (!this.active || !ctx || ctx.state !== 'running' || event.kind === 'silence') return;
    const kind = event.kind;
    const bank = this.banks.get(kind);
    if (!bank?.length) return;

    for (const participant of event.participants) {
      if (this.voices.size >= CONFIG.maxReactionVoices) break;
      const panner = this.panners.get(participant.seatId);
      if (!panner) continue;
      const onset = event.at + participant.delayMs;
      const elapsed = Math.max(0, (nowMs - onset) / 1000);
      const requestedDuration = participant.durationMs / 1000;
      // A slow frame never makes a queue of expired laughs play at once.
      if (elapsed >= requestedDuration - 0.03) continue;
      let index = participant.variant % bank.length;
      if (bank.length > 1 && bank[index] === this.previousClip.get(participant.seatId)) index = (index + 1) % bank.length;
      const buffer = bank[index];
      const pitch = participant.pitch;
      const offset = elapsed * pitch;
      const duration = Math.min(requestedDuration - elapsed, (buffer.duration - offset) / pitch);
      if (duration <= 0.025) continue;
      this.previousClip.set(participant.seatId, buffer);
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.playbackRate.value = pitch;
      const start = ctx.currentTime + Math.max(0.018, (onset - nowMs) / 1000 + 0.018);
      const end = start + duration;
      const level = GAINS[kind] * participant.gain;
      const attack = Math.min(0.023, duration * 0.20);
      const release = Math.min(0.10, duration * 0.27);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + attack);
      gain.gain.setValueAtTime(level, Math.max(start + attack, end - release));
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain);
      gain.connect(panner);
      /** @type {Voice} */
      const voice = { source, gain, start, end };
      this.voices.add(voice);
      source.onended = () => {
        this.voices.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      source.start(start, offset);
      source.stop(end + 0.006);
    }
  }

  cancelReactions() {
    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const voice of [...this.voices]) {
      try {
        if (voice.start > now) {
          // Stop before its scheduled start: this voice is never heard.
          voice.source.stop(now);
        } else {
          const end = Math.max(now + 0.008, Math.min(voice.end, now + 0.23));
          holdParameter(voice.gain.gain, now);
          voice.gain.gain.linearRampToValueAtTime(0, end);
          voice.source.stop(end + 0.008);
        }
      } catch {
        // Already ended between the audio clock and this callback.
      }
    }
  }

  stopBeds() {
    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const bed of this.beds.splice(0)) {
      holdParameter(bed.gain.gain, now);
      bed.gain.gain.linearRampToValueAtTime(0, now + 0.18);
      bed.source.onended = () => {
        bed.source.disconnect();
        bed.gain.disconnect();
        bed.panner.disconnect();
      };
      try { bed.source.stop(now + 0.19); } catch { /* Already ended. */ }
    }
  }

  deactivate() {
    this.active = false;
    this.cancelReactions();
    this.stopBeds();
  }
}
