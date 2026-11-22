// @ts-check
/**
 * The microphone: asks permission, measures the level each frame, and lets go of it.
 * Audio is analysed in memory only. Nothing is recorded, stored or sent anywhere.
 * What the level *means* (speech, pauses) is decided by speech.js.
 */

import { rmsToDb } from './speech.js';

export class Mic {
  constructor() {
    /** @type {MediaStream | null} */
    this.stream = null;
    /** @type {MediaStreamAudioSourceNode | null} */
    this.source = null;
    /** @type {AnalyserNode | null} */
    this.analyser = null;
    /** @type {Float32Array<ArrayBuffer> | null} */
    this.buffer = null;
    /** @type {'off'|'on'|'denied'|'unavailable'|'error'} */
    this.status = 'off';
    this.levelDb = -100;
  }

  get active() {
    return this.status === 'on';
  }

  /** Ask for the mic. Call from a button press. @param {AudioContext} ctx */
  async start(ctx) {
    if (this.active) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status = 'unavailable';
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
    } catch (err) {
      const name = /** @type {any} */ (err)?.name;
      this.status = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error';
      return false;
    }
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.buffer = new Float32Array(this.analyser.fftSize);
    // Analysed only: never connected to the speakers or anything else.
    this.source.connect(this.analyser);
    this.status = 'on';
    // If the browser or system takes the mic away, notice.
    for (const track of this.stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (this.status === 'on') this.release('error');
      });
    }
    return true;
  }

  /** Current level in dBFS (call once per frame). */
  read() {
    if (!this.analyser || !this.buffer) return (this.levelDb = -100);
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i];
    this.levelDb = rmsToDb(Math.sqrt(sum / this.buffer.length));
    return this.levelDb;
  }

  /** Stop every track so the browser's mic indicator goes off. @param {'off'|'error'} [status] */
  release(status = 'off') {
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.source?.disconnect();
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.buffer = null;
    this.status = status;
    this.levelDb = -100;
  }

  /** True while any track is still live (used by tests). */
  liveTracks() {
    return this.stream ? this.stream.getTracks().filter((t) => t.readyState === 'live').length : 0;
  }
}
