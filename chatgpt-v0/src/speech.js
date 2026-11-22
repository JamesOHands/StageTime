// @ts-check

import { CONFIG, clamp } from './config.js';

/** @typedef {import('./events.js').EventBus} EventBus */
/** @typedef {'idle' | 'candidate' | 'speech' | 'pause' | 'guarded' | 'off'} SpeechState */

/** Pure, time-stamped RMS-level state machine. No audio data is retained. */
export class SpeechDetector {
  /** @param {EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.noiseFloor = 0.004;
    this.level = 0;
    this.threshold = 0.014;
    /** @type {SpeechState} */
    this.state = 'off';
    this.enabled = false;
    this.armed = false;
    /** @type {number | null} */
    this.candidateAt = null;
    /** @type {number | null} */
    this.speechAt = null;
    /** @type {number | null} */
    this.quietAt = null;
    this.lastOutcomeAt = -Infinity;
  }

  clearSegment() {
    this.candidateAt = null;
    this.speechAt = null;
    this.quietAt = null;
    this.armed = false;
  }

  begin() {
    this.clearSegment();
    this.enabled = true;
    this.state = 'idle';
    this.lastOutcomeAt = -Infinity;
  }

  stop() {
    this.enabled = false;
    this.clearSegment();
    this.state = 'off';
  }

  /** Estimate the floor from quiet samples only; speech cannot drag it upwards.
   * @param {number} level */
  learnQuiet(level) {
    const sample = clamp(level, 0.0006, 0.035);
    const speed = sample < this.noiseFloor ? 0.08 : 0.025;
    this.noiseFloor += (sample - this.noiseFloor) * speed;
    this.threshold = clamp(this.noiseFloor * 2.7 + 0.004, 0.014, 0.11);
  }

  /** @param {number} now @param {number} rawLevel @param {boolean} [guarded] */
  sample(now, rawLevel, guarded = false) {
    const level = Number.isFinite(rawLevel) ? Math.max(0, rawLevel) : 0;
    this.level = level;
    if (guarded) {
      // Discard the whole segment. Residual crowd audio can never arm a pause.
      this.clearSegment();
      this.state = this.enabled ? 'guarded' : 'off';
      return;
    }
    if (!this.enabled) {
      if (level < Math.max(this.threshold, 0.025)) this.learnQuiet(level);
      return;
    }
    const above = level >= (this.speechAt === null ? this.threshold : this.threshold * 0.78);
    if (above) {
      this.quietAt = null;
      if (this.candidateAt === null) this.candidateAt = now;
      if (this.speechAt === null && now - this.candidateAt >= CONFIG.speechConfirmMs) {
        this.speechAt = this.candidateAt;
      }
      if (this.speechAt !== null) {
        this.state = 'speech';
        this.armed = now - this.speechAt >= CONFIG.minSpeechMs;
      } else {
        this.state = 'candidate';
      }
      return;
    }

    if (this.speechAt === null) {
      this.clearSegment();
      this.state = 'idle';
      if (level < this.threshold) this.learnQuiet(level);
      return;
    }
    if (this.quietAt === null) this.quietAt = now;
    this.state = 'pause';
    const quietMs = now - this.quietAt;
    const speechMs = this.quietAt - this.speechAt;
    this.armed = speechMs >= CONFIG.minSpeechMs;
    if (quietMs >= CONFIG.pauseMs) {
      const qualifies = this.armed && now - this.lastOutcomeAt >= CONFIG.reactionCooldownMs;
      // Consume this segment even when in cooldown, and even when the outcome
      // is silence. A fresh two-second speech segment is always required.
      this.clearSegment();
      this.state = 'idle';
      this.learnQuiet(level);
      if (qualifies) {
        this.lastOutcomeAt = now;
        this.bus.emit({ type: 'pause', at: now, speechMs, quietMs });
      }
    }
  }
}
