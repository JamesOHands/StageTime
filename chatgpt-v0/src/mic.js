// @ts-check

/** Explicitly opted-in local analysis. The microphone has no path to the
 * speakers, no recorder, and no network or persistence code. */
export class MicCapture {
  /** @param {(message: string) => void} onLost */
  constructor(onLost) {
    this.onLost = onLost;
    /** @type {MediaStream | null} */
    this.stream = null;
    /** @type {MediaStreamAudioSourceNode | null} */
    this.source = null;
    /** @type {AnalyserNode | null} */
    this.analyser = null;
    /** @type {Float32Array<ArrayBuffer> | null} */
    this.samples = null;
    this.pending = false;
    this.generation = 0;
  }

  get active() {
    return Boolean(this.stream?.getAudioTracks().some(track => track.readyState === 'live'));
  }

  /** Only invoked by the entry page's Enable microphone button.
   * @param {AudioContext} context */
  async start(context) {
    this.stop();
    const generation = ++this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone is unavailable in this browser.');
    this.pending = true;
    /** @type {MediaStream | null} */
    let acquired = null;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      // A permission prompt may resolve after the user has left or chosen
      // timed mode. Never leave a late-arriving microphone running.
      if (generation !== this.generation) {
        acquired.getTracks().forEach(track => track.stop());
        return false;
      }
      if (!acquired.getAudioTracks().length) throw new Error('No microphone track was returned.');
      this.stream = acquired;
      this.source = context.createMediaStreamSource(acquired);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.12;
      this.samples = new Float32Array(this.analyser.fftSize);
      // An AnalyserNode works without its output connected. Do not monitor
      // the performer's voice through the sound system.
      this.source.connect(this.analyser);
      acquired.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => {
          if (generation !== this.generation) return;
          this.stop();
          this.onLost('Microphone disconnected; using timed reactions.');
        });
      });
      return true;
    } catch (error) {
      if (generation !== this.generation) {
        acquired?.getTracks().forEach(track => track.stop());
        return false;
      }
      acquired?.getTracks().forEach(track => track.stop());
      this.stop();
      throw error;
    } finally {
      if (generation === this.generation) this.pending = false;
    }
  }

  readLevel() {
    const analyser = this.analyser, data = this.samples;
    if (!this.active || !analyser || !data) return 0;
    analyser.getFloatTimeDomainData(data);
    let energy = 0, mean = 0;
    for (let i = 0; i < data.length; i++) {
      energy += data[i] * data[i];
      mean += data[i];
    }
    mean /= data.length;
    return Math.sqrt(Math.max(0, energy / data.length - mean * mean));
  }

  stop() {
    this.generation++;
    this.pending = false;
    this.stream?.getTracks().forEach(track => track.stop());
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.samples?.fill(0);
    this.stream = this.source = this.analyser = this.samples = null;
  }
}
