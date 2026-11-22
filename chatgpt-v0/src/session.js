// @ts-check

/** @typedef {import('./events.js').EventBus} EventBus */
/** @typedef {import('./events.js').SessionState} SessionState */

/** All time comes from the caller. This module has no clocks, DOM or audio. */
export class Session {
  /** @param {EventBus} bus @param {number} durationMs */
  constructor(bus, durationMs) {
    this.bus = bus;
    this.durationMs = durationMs;
    /** @type {SessionState} */
    this.state = 'ready';
    this.startedAt = 0;
    this.elapsedMs = 0;
  }

  /** @param {number} durationMs */
  configure(durationMs) {
    this.durationMs = durationMs;
    this.state = 'ready';
    this.elapsedMs = 0;
  }

  /** @param {number} now */
  start(now) {
    if (this.state === 'running') return;
    this.state = 'running';
    this.startedAt = now;
    this.elapsedMs = 0;
    this.bus.emit({ type: 'session', state: 'running', reason: 'start', at: now, elapsedMs: 0 });
  }

  /** @param {number} now */
  elapsedAt(now) {
    return this.state === 'running'
      ? Math.max(0, Math.min(this.durationMs, now - this.startedAt))
      : this.elapsedMs;
  }

  get remainingMs() {
    return Math.max(0, this.durationMs - this.elapsedMs);
  }

  /** @param {number} now */
  advance(now) {
    if (this.state !== 'running') return;
    this.elapsedMs = this.elapsedAt(now);
    if (this.elapsedMs >= this.durationMs) {
      this.state = 'finished';
      this.bus.emit({
        type: 'session', state: 'finished', reason: 'finish',
        at: this.startedAt + this.durationMs, elapsedMs: this.durationMs,
      });
    }
  }

  /** Stop is an abort, not a successful finish; it never triggers applause.
   * @param {number} now @param {'stop' | 'exit' | 'reset'} [reason] */
  stop(now, reason = 'stop') {
    const previousElapsed = this.elapsedAt(now);
    this.state = 'ready';
    this.elapsedMs = 0;
    this.bus.emit({
      type: 'session', state: 'ready', reason, at: now,
      elapsedMs: previousElapsed,
    });
  }

  /** @param {number} now */
  toggle(now) {
    if (this.state === 'running') this.stop(now);
    else this.start(now);
  }
}
