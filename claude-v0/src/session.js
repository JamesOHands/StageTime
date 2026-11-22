// @ts-check
/**
 * The session state machine and timer. Pure logic: no DOM, Three.js or audio.
 *
 *   ready ──start──▶ running ──time up──▶ finished
 *     ▲                 │                    │
 *     └──────stop───────┴───────stop─────────┘
 *
 * Starting again from `finished` begins a new session.
 */

/** @typedef {'ready'|'running'|'finished'} SessionState */

export class Session {
  /** @param {{ durationMs: number, emit: import('./events.js').Emit }} opts */
  constructor({ durationMs, emit }) {
    this.durationMs = durationMs;
    this.emit = emit;
    /** @type {SessionState} */
    this.state = 'ready';
    this.startedAt = 0;
    /** Counts sessions started, so each one can get its own random schedule. */
    this.count = 0;
  }

  /** @param {number} now ms */
  start(now) {
    if (this.state === 'running') return false;
    this.state = 'running';
    this.startedAt = now;
    this.count += 1;
    this.emit({ type: 'session', state: 'running', at: now, count: this.count });
    return true;
  }

  /** @param {number} now @param {string} [reason] */
  stop(now, reason = 'stopped') {
    if (this.state === 'ready') return false;
    const from = this.state;
    this.state = 'ready';
    this.emit({ type: 'session', state: 'ready', at: now, from, reason });
    return true;
  }

  /** Start/stop button behaviour. @param {number} now */
  toggle(now) {
    return this.state === 'running' ? this.stop(now) : this.start(now);
  }

  /** Call every frame. @param {number} now */
  update(now) {
    if (this.state === 'running' && now - this.startedAt >= this.durationMs) {
      this.state = 'finished';
      this.emit({ type: 'session', state: 'finished', at: this.startedAt + this.durationMs });
    }
  }

  /** Milliseconds since the set started (the session clock). @param {number} now */
  elapsed(now) {
    if (this.state === 'running') return Math.min(now - this.startedAt, this.durationMs);
    return this.state === 'finished' ? this.durationMs : 0;
  }

  /** @param {number} now */
  remaining(now) {
    return this.durationMs - this.elapsed(now);
  }
}

/** Format milliseconds as m:ss. @param {number} ms */
export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
