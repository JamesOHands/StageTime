// @ts-check
/**
 * A tiny event bus. Logic modules emit plain objects with a `type`;
 * rendering, audio and the overlay subscribe.
 */

/** @typedef {{ type: string } & Record<string, any>} AppEvent */
/** @typedef {(event: AppEvent) => void} Emit */

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<(e: AppEvent) => void>>} */
    this.handlers = new Map();
  }

  /**
   * Subscribe to one event type, or '*' for everything. Returns an unsubscribe function.
   * @param {string} type @param {(e: AppEvent) => void} fn
   */
  on(type, fn) {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set?.delete(fn);
  }

  /** @param {AppEvent} event */
  emit(event) {
    for (const key of [event.type, '*']) {
      const set = this.handlers.get(key);
      if (!set) continue;
      for (const fn of set) fn(event);
    }
  }
}
