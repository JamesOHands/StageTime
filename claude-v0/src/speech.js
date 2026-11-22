// @ts-check
/**
 * Voice activity and pause detection. Pure logic: it is fed (time, level in dB)
 * samples by mic.js and decides what they mean. Nothing here touches audio,
 * so it can be tested with synthetic data (tests/speech.test.js).
 *
 * Rules (SPEC.md §2, mic mode):
 * - Speech: level above an adaptive noise floor for ≥ voiceMinMs.
 * - A qualifying pause: ≥ pauseMs of silence, after a speech segment ≥ minSegmentMs,
 *   and ≥ cooldownMs since the last reaction.
 * - One pause, one outcome. The segment ends when the pause is detected, so the
 *   next outcome needs fresh speech of ≥ minSegmentMs.
 * - Echo guard: while guarded (during and just after loud crowd reactions) the mic
 *   is ignored, and silence is only counted from the end of the guard.
 */

import { CONFIG } from './config.js';

/** @typedef {typeof CONFIG.speech} SpeechConfig */

export class PauseDetector {
  /** @param {{ emit: import('./events.js').Emit, cfg?: SpeechConfig }} opts */
  constructor({ emit, cfg = CONFIG.speech }) {
    this.emit = emit;
    this.cfg = cfg;
    /** @type {number | null} */
    this.firstSampleAt = null;
    /** @type {number | null} */
    this.lastSampleAt = null;
    this.floorDb = -60;
    this.levelDb = -100;
    /** @type {number | null} */
    this.aboveSince = null;
    this.voiced = false;
    this.inSegment = false;
    this.segmentStart = 0;
    this.lastVoiceAt = 0;
    this.guardUntil = -Infinity;
    /** @type {number | null} */
    this.lastOutcomeAt = null;
  }

  /** Back to the state of a fresh detector, including re-learning the noise floor. */
  reset() {
    /** @type {number | null} */
    this.firstSampleAt = null;
    /** @type {number | null} */
    this.lastSampleAt = null;
    this.floorDb = -60;
    this.levelDb = -100;
    /** @type {number | null} */
    this.aboveSince = null;
    this.voiced = false;
    this.inSegment = false;
    this.segmentStart = 0;
    this.lastVoiceAt = 0;
    this.guardUntil = -Infinity;
    /** @type {number | null} */
    this.lastOutcomeAt = null;
  }

  /** Forget any speech in progress (on start/stop) but keep the learnt noise floor. */
  clearSegment() {
    this.inSegment = false;
    this.aboveSince = null;
    this.voiced = false;
    this.lastOutcomeAt = null;
    this.guardUntil = -Infinity;
  }

  /** Ignore the mic until this time (ms). @param {number} until */
  setGuard(until) {
    this.guardUntil = Math.max(this.guardUntil, until);
  }

  /** Any reaction (manual, timed or from a pause) restarts the cooldown. @param {number} at */
  noteReaction(at) {
    this.lastOutcomeAt = this.lastOutcomeAt === null ? at : Math.max(this.lastOutcomeAt, at);
  }

  /** @param {number} t */
  isGuarded(t) {
    return t < this.guardUntil;
  }

  /** Would a pause right now produce an outcome? (Shown on the debug overlay.) @param {number} t */
  isArmed(t) {
    return (
      this.inSegment &&
      this.lastVoiceAt - this.segmentStart >= this.cfg.minSegmentMs &&
      (this.lastOutcomeAt === null || t - this.lastOutcomeAt >= this.cfg.cooldownMs)
    );
  }

  /**
   * Feed one level sample.
   * @param {number} t time in ms
   * @param {number} levelDb mic level in dBFS (e.g. −60 quiet room, −20 talking)
   */
  sample(t, levelDb) {
    const c = this.cfg;
    const dt = this.lastSampleAt === null ? 0 : Math.max(0, t - this.lastSampleAt);
    this.lastSampleAt = t;
    this.levelDb = levelDb;
    if (this.firstSampleAt === null) {
      this.firstSampleAt = t;
      this.floorDb = levelDb;
    }

    // Calibration: learn the room's background level before listening for speech.
    if (t - this.firstSampleAt < c.calibrationMs) {
      this.floorDb += (levelDb - this.floorDb) * (1 - Math.exp(-dt / 200));
      return;
    }

    const guarded = this.isGuarded(t);
    const above = !guarded && levelDb > this.floorDb + c.thresholdDb && levelDb > c.absMinDb;

    // Adaptive noise floor: falls quickly, rises slowly, barely moves while someone talks.
    if (!guarded) {
      const tau = levelDb < this.floorDb ? c.floorFallTauMs : above ? c.floorRiseDuringVoiceTauMs : c.floorRiseTauMs;
      this.floorDb += (levelDb - this.floorDb) * (1 - Math.exp(-dt / tau));
    }

    if (above) {
      if (this.aboveSince === null) this.aboveSince = t;
    } else {
      this.aboveSince = null;
    }
    this.voiced = above && this.aboveSince !== null && t - this.aboveSince >= c.voiceMinMs;

    if (this.voiced) {
      if (!this.inSegment) {
        this.inSegment = true;
        this.segmentStart = /** @type {number} */ (this.aboveSince);
        this.emit({ type: 'speech', state: 'speaking', at: t });
      }
      this.lastVoiceAt = t;
      return;
    }

    if (!this.inSegment) return;

    // Silence is counted from the last voiced sample, or from the end of the echo guard.
    const silenceStart = Math.max(this.lastVoiceAt, this.guardUntil);
    if (t - silenceStart < c.pauseMs) return;

    const segmentMs = this.lastVoiceAt - this.segmentStart;
    this.inSegment = false;
    this.emit({ type: 'speech', state: 'silent', at: t, segmentMs });

    const cooled = this.lastOutcomeAt === null || t - this.lastOutcomeAt >= c.cooldownMs;
    if (segmentMs >= c.minSegmentMs && cooled) {
      this.lastOutcomeAt = t;
      this.emit({ type: 'pause', at: t, segmentMs });
    }
  }
}

/** Convert a linear RMS value (0–1) to dBFS. @param {number} rms */
export function rmsToDb(rms) {
  return 20 * Math.log10(Math.max(rms, 1e-6));
}
