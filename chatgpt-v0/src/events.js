// @ts-check

/** @typedef {'ready' | 'running' | 'finished'} SessionState */
/** @typedef {'silence' | 'titter' | 'ripple' | 'laugh' | 'applause' | 'cough' | 'shuffle' | 'glass'} ReactionKind */
/** @typedef {'timed' | 'mic' | 'manual' | 'ambient' | 'finish'} ReactionSource */
/**
 * @typedef {Object} Participant
 * @property {number} seatId - -1 denotes the bar rather than a member.
 * @property {number} delayMs
 * @property {number} durationMs
 * @property {number} gain
 * @property {number} pitch
 * @property {number} variant
 * @property {number} intensity
 */
/**
 * @typedef {Object} ReactionEvent
 * @property {'reaction'} type
 * @property {ReactionKind} kind
 * @property {ReactionSource} source
 * @property {number} at - Monotonic clock milliseconds; relative in a schedule.
 * @property {Participant[]} participants
 */
/**
 * @typedef {Object} SessionEvent
 * @property {'session'} type
 * @property {SessionState} state
 * @property {'start' | 'stop' | 'finish' | 'exit' | 'reset'} reason
 * @property {number} at
 * @property {number} elapsedMs
 */
/** @typedef {{type: 'pause', at: number, speechMs: number, quietMs: number}} PauseEvent */
/** @typedef {ReactionEvent | SessionEvent | PauseEvent} StageEvent */

export class EventBus {
  constructor() {
    /** @type {Set<(event: StageEvent) => void>} */
    this.listeners = new Set();
  }

  /** @param {(event: StageEvent) => void} listener */
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @param {StageEvent} event */
  emit(event) {
    for (const listener of this.listeners) listener(event);
  }
}
