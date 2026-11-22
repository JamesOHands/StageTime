// @ts-check

import * as THREE from 'three';
import { CONFIG, clamp, formatTime, normaliseMode, normaliseSeed, randomSeed, settingsFromQuery } from './src/config.js';
import { EventBus } from './src/events.js';
import { Session } from './src/session.js';
import { Crowd } from './src/crowd.js';
import { SpeechDetector } from './src/speech.js';
import { MicCapture } from './src/mic.js';
import { StageAudio } from './src/audio.js';
import { Room } from './src/render/room.js';
import { Audience } from './src/render/audience.js';
import { FrameStats, Overlay } from './src/render/overlay.js';
import { CompatibilityPreview } from './src/render/compatibility.js';
import { DesktopInput } from './src/input/desktop.js';
import { XRInput } from './src/input/xr.js';

/** @typedef {import('./src/config.js').Settings} Settings */
/** @typedef {import('./src/config.js').Mode} Mode */
/** @typedef {import('./src/events.js').ReactionKind} ReactionKind */
/** @typedef {import('./src/input/desktop.js').InputActions} InputActions */
/** @typedef {import('./src/render/overlay.js').View} View */

/** @param {string} id */
function el(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing interface element: ' + id);
  return element;
}
/** @param {string} id */
const input = id => /** @type {HTMLInputElement} */ (el(id));
/** @param {string} id */
const button = id => /** @type {HTMLButtonElement} */ (el(id));
const canvas = /** @type {HTMLCanvasElement} */ (el('scene'));
const modeSelect = /** @type {HTMLSelectElement} */ (el('reaction-mode'));
const form = {
  seed: input('seed'), fill: input('fill'), minutes: input('minutes'),
  volume: input('volume'), house: input('house'), spot: input('spotlight'),
  countdown: input('countdown'),
};
const enterVRButton = button('enter-vr'), startDesktopButton = button('start-desktop'), micButton = button('mic-toggle');
const setup = el('setup'), setupStatus = el('setup-status'), hud = el('desktop-hud');
const deskVolume = input('desktop-volume');

/** @type {Settings} */
let settings = settingsFromQuery(location.search);
/** @type {Mode} */
let mode = settings.mode === 'mic' ? 'timed' : settings.mode;
/** @type {View} */
let view = 'entry';
/** @type {XRSession | null} */
let xrSession = null;
let xrSupported = false, exiting = false, aligned = false, enterGeneration = 0;
let viewStarted = performance.now(), lastNow = viewStarted, nextHud = 0, nextMic = 0, nextEmitters = 0;
let guardUntil = 0, micLevel = 0, lastEvent = 'Ready', lastNotice = '', noticeTimer = 0;
let lastCalls = 0, lastTriangles = 0, rendered = false, fatal = false;

const bus = new EventBus();
const session = new Session(bus, settings.minutes * 60000);
let crowd = new Crowd(bus, settings.seed, settings.fill);
const speech = new SpeechDetector(bus);
const audio = new StageAudio(notify);
const mic = new MicCapture(message => fallbackToTimed(message));

// Three r187 requires WebGL2. A browser with graphics explicitly disabled
// can still run a labelled, simplified desktop view of the same scene.
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
const webgl = gl ? new THREE.WebGLRenderer({
  canvas, context: gl, antialias: true, alpha: false, powerPreference: 'high-performance',
}) : null;
const renderer = webgl ?? new CompatibilityPreview(canvas);
const compatibility = renderer instanceof CompatibilityPreview ? renderer : null;
if (webgl) {
  webgl.outputColorSpace = THREE.SRGBColorSpace;
  webgl.toneMapping = THREE.ACESFilmicToneMapping;
  webgl.toneMappingExposure = 1.06;
  webgl.xr.enabled = true;
  webgl.xr.setReferenceSpaceType('local-floor');
  webgl.xr.setFramebufferScaleFactor(1);
} else {
  const label = document.querySelector('.preview-label');
  if (label) label.textContent = '2D COMPATIBILITY PREVIEW';
}
document.body.dataset.renderMode = webgl ? 'webgl' : 'compatibility';
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x231a16);
const camera = new THREE.PerspectiveCamera(63, innerWidth / Math.max(1, innerHeight), 0.025, 35);
camera.position.set(0, CONFIG.desktopHeight, 0);
camera.rotation.order = 'YXZ';
camera.rotation.x = -0.14;
const stage = new THREE.Group();
stage.name = 'Stage anchored at the standing floor';
scene.add(stage);
const room = new Room(crowd.seats);
stage.add(room.group);
let audience = new Audience(crowd.members);
stage.add(audience.group);
const overlay = new Overlay(stage, el('debug-panel'), el('debug-text'));
const frames = new FrameStats();
const headWorld = new THREE.Vector3(0, CONFIG.desktopHeight, 0);
const headLocal = new THREE.Vector3();
const headOrientation = new THREE.Quaternion();
const forward = new THREE.Vector3();
const up = new THREE.Vector3();
const emitterPosition = new THREE.Vector3();

/** @type {InputActions} */
const actions = {
  toggleSession: () => {
    if (!isOnStage() || exiting) return;
    if (mode === 'mic' && !mic.active) fallbackToTimed('Microphone unavailable; using timed reactions.');
    session.toggle(performance.now());
  },
  react: kind => {
    if (isOnStage() && !exiting) crowd.manual(kind, performance.now());
  },
  toggleDebug: () => {
    if (!isOnStage()) return;
    lastEvent = 'Debug overlay ' + (overlay.toggle() ? 'on' : 'off');
    updateHud(performance.now(), true);
  },
  adjustVolume: amount => {
    setVolume(settings.volume + amount);
    lastEvent = 'Volume ' + Math.round(settings.volume * 100) + '%';
    updateHud(performance.now(), true);
  },
  exit: () => { void leaveStage('Exited to setup.'); },
};
const desktop = new DesktopInput(canvas, camera, actions, () => view === 'desktop' && !exiting);
const xrInput = new XRInput(actions);

function isOnStage() {
  return view === 'desktop' || view === 'xr';
}

/** @param {string} message */
function notify(message) {
  lastNotice = message;
  const notice = el('notice');
  notice.textContent = message;
  notice.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 6500);
}

/** @param {unknown} error @param {string} context */
function errorMessage(error, context) {
  const detail = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return context + ': ' + detail.slice(0, 180);
}

/** @param {View} next */
function setView(next) {
  view = next;
  document.body.dataset.view = next;
  setup.hidden = next === 'desktop' || next === 'xr';
  hud.hidden = next !== 'desktop';
  overlay.setView(next);
  updateButtons();
  updateHud(performance.now(), true);
}

function resize() {
  if (webgl?.xr.isPresenting) return;
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
}
window.addEventListener('resize', resize);
resize();

function updateButtons() {
  const available = view === 'entry' && rendered && !fatal;
  startDesktopButton.disabled = !available;
  enterVRButton.disabled = !available || !xrSupported;
  micButton.disabled = !available;
}

function refreshMicUI() {
  micButton.textContent = mic.pending ? 'Cancel mic request' : mic.active ? 'Disable microphone' : 'Enable microphone';
  el('mic-status').textContent = mic.pending ? 'Waiting for permission…'
    : mic.active ? 'Enabled · on-device level only'
    : modeSelect.value === 'mic' ? 'Off · enable before entering'
    : 'Off · no recording';
  document.body.dataset.micActive = String(mic.active);
}

/** @param {string} message */
function fallbackToTimed(message) {
  mic.stop();
  speech.stop();
  if (mode === 'mic' || settings.mode === 'mic' || modeSelect.value === 'mic') {
    mode = 'timed';
    settings.mode = 'timed';
    modeSelect.value = 'timed';
    if (session.state === 'running') crowd.skipTimedThrough(session.elapsedAt(performance.now()));
  }
  micLevel = 0;
  refreshMicUI();
  if (message) notify(message);
  updateHud(performance.now(), true);
}

// The opt-in button is the only place which asks for microphone permission.
micButton.addEventListener('click', async () => {
  if (view !== 'entry') return;
  if (mic.active || mic.pending) {
    fallbackToTimed('Microphone off. Timed reactions selected.');
    return;
  }
  modeSelect.value = settings.mode = 'mic';
  try {
    const context = audio.ensureContext();
    void audio.unlock().catch(error => notify(errorMessage(error, 'Audio could not start')));
    const pending = mic.start(context);
    refreshMicUI();
    const enabled = await pending;
    if (enabled && view === 'entry' && modeSelect.value === 'mic') {
      mode = 'mic';
      lastNotice = 'Microphone enabled locally; no recording.';
      notify(lastNotice);
    }
  } catch (error) {
    fallbackToTimed('Microphone denied or unavailable. Timed reactions selected. (' +
      (error instanceof Error ? error.name : 'unavailable') + ')');
  } finally {
    refreshMicUI();
  }
});

modeSelect.addEventListener('change', () => {
  const wanted = normaliseMode(modeSelect.value);
  settings.mode = wanted;
  if (wanted !== 'mic') {
    mic.stop();
    speech.stop();
    mode = wanted;
  } else {
    mode = mic.active ? 'mic' : 'timed';
  }
  refreshMicUI();
});

/** @param {number} value */
function setVolume(value) {
  settings.volume = clamp(value, 0, 1);
  audio.setVolume(settings.volume);
  const percent = String(Math.round(settings.volume * 100));
  form.volume.value = deskVolume.value = percent;
  el('volume-value').textContent = percent + '%';
  el('hud-volume-value').textContent = percent + '%';
}
function setLightingFromForm() {
  settings.house = clamp(Number(form.house.value) / 100, 0, 1);
  settings.spotlight = clamp(Number(form.spot.value) / 100, 0, 1);
  room.setLighting(settings.house, settings.spotlight);
  if (compatibility) compatibility.house = settings.house;
  el('house-value').textContent = Math.round(settings.house * 100) + '%';
  el('spotlight-value').textContent = Math.round(settings.spotlight * 100) + '%';
}
form.volume.addEventListener('input', () => setVolume(Number(form.volume.value) / 100));
deskVolume.addEventListener('input', () => setVolume(Number(deskVolume.value) / 100));
form.house.addEventListener('input', setLightingFromForm);
form.spot.addEventListener('input', setLightingFromForm);
form.countdown.addEventListener('change', () => {
  settings.countdown = form.countdown.checked;
  room.setCountdown(settings.countdown);
});

/** @param {HTMLInputElement} field @param {number} min @param {number} max @param {number} fallback */
function readInt(field, min, max, fallback) {
  const n = field.valueAsNumber;
  return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback;
}

function applySetup() {
  if (!isOnStage()) {
    const seed = normaliseSeed(form.seed.value);
    const fill = readInt(form.fill, CONFIG.minFill, CONFIG.capacity, CONFIG.defaultFill);
    const minutes = readInt(form.minutes, 1, 10, CONFIG.defaultMinutes);
    if (seed !== settings.seed || fill !== settings.fill) {
      audience.dispose();
      crowd = new Crowd(bus, seed, fill);
      audience = new Audience(crowd.members);
      stage.add(audience.group);
    }
    settings.seed = seed; settings.fill = fill; settings.minutes = minutes;
    settings.mode = normaliseMode(modeSelect.value);
    form.seed.value = seed; form.fill.value = String(fill); form.minutes.value = String(minutes);
    settings.countdown = form.countdown.checked;
    session.configure(minutes * 60000);
    setVolume(Number(form.volume.value) / 100);
    setLightingFromForm();
    room.setCountdown(settings.countdown);
    room.updateTimer(session.remainingMs, session.state);
    el('preview-fill').textContent = fill + ' people · ' + CONFIG.capacity + ' seats';
    document.body.dataset.seed = seed;
    document.body.dataset.occupied = crowd.members.map(member => member.seat.id).join(',');
  }
}
for (const field of [form.seed, form.fill, form.minutes]) field.addEventListener('change', applySetup);
button('new-seed').addEventListener('click', () => {
  form.seed.value = randomSeed();
  applySetup();
});

function unlockAudio() {
  // This call begins on the trusted click, before awaiting anything from XR
  // or an asset loader. A muted / unavailable sound device cannot block entry.
  void audio.unlock().catch(error => notify(errorMessage(error, 'Audio unavailable')));
}

function prepareEntry() {
  applySetup();
  if (settings.mode === 'mic' && !mic.active) {
    fallbackToTimed('Microphone is not enabled; using timed reactions.');
  } else {
    mode = settings.mode;
    if (mode !== 'mic') mic.stop();
    refreshMicUI();
  }
  const token = ++enterGeneration;
  setupStatus.textContent = 'Preparing the room…';
  setView('entering');
  unlockAudio();
  return token;
}

/** @param {'desktop' | 'xr'} next */
function beginStage(next) {
  viewStarted = lastNow = performance.now();
  nextHud = nextMic = nextEmitters = 0;
  aligned = false; guardUntil = 0; micLevel = 0;
  frames.reset();
  stage.position.set(0, 0, 0);
  stage.rotation.set(0, 0, 0);
  stage.updateMatrixWorld(true);
  desktop.reset();
  camera.position.set(0, CONFIG.desktopHeight, 0);
  xrInput.reset();
  session.configure(settings.minutes * 60000);
  crowd.cancel();
  audience.clearReactions();
  speech.stop();
  lastEvent = 'Ready — start when you want';
  try {
    audio.configure(crowd.members);
    audio.setVolume(settings.volume);
    audio.activate();
    audio.setState('ready');
  } catch (error) {
    notify(errorMessage(error, 'Sound initialisation'));
  }
  setView(next);
  room.updateTimer(session.remainingMs, session.state);
  if (next === 'desktop') canvas.focus({ preventScroll: true });
}

startDesktopButton.addEventListener('click', () => {
  if (view !== 'entry' || !rendered) return;
  prepareEntry();
  beginStage('desktop');
});

enterVRButton.addEventListener('click', async () => {
  if (view !== 'entry' || !xrSupported || !navigator.xr || !webgl) return;
  const token = prepareEntry();
  try {
    // Request the immersive session immediately from the same user gesture.
    const active = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
    if (token !== enterGeneration) {
      await active.end();
      return;
    }
    xrSession = active;
    active.addEventListener('end', () => onXREnd(active), { once: true });
    active.addEventListener('visibilitychange', () => {
      if (active.visibilityState === 'hidden' && xrSession === active) void leaveStage('VR was hidden; session stopped.');
    });
    beginStage('xr');
    await webgl.xr.setSession(active);
    if (xrSession === active) {
      try { webgl.xr.setFoveation(1); } catch { /* Device may not expose fixed foveation. */ }
    }
  } catch (error) {
    if (token !== enterGeneration && view === 'entry') return;
    const message = errorMessage(error, 'Could not enter VR');
    await leaveStage(message);
    setupStatus.textContent = message + '. Desktop mode is still available.';
  }
});

/** @param {string} [message] */
function cleanStage(message = '') {
  session.stop(performance.now(), 'exit');
  audio.deactivate();
  mic.stop();
  speech.stop();
  if (settings.mode === 'mic' || mode === 'mic') {
    mode = settings.mode = 'timed';
    modeSelect.value = 'timed';
  }
  refreshMicUI();
  desktop.release();
  if (message) notify(message);
}

function returnToSetup() {
  xrSession = null;
  exiting = false;
  aligned = false;
  stage.position.set(0, 0, 0);
  stage.rotation.set(0, 0, 0);
  stage.updateMatrixWorld(true);
  desktop.reset();
  camera.position.set(0, CONFIG.desktopHeight, 0);
  viewStarted = lastNow = performance.now();
  frames.reset();
  setView('entry');
  resize();
  showAvailability();
}

/** @param {XRSession} ended */
function onXREnd(ended) {
  if (xrSession !== ended) return;
  ++enterGeneration;
  cleanStage('Returned from VR. Microphone off.');
  returnToSetup();
}

/** @param {string} [message] */
async function leaveStage(message = '') {
  if (exiting) return;
  ++enterGeneration;
  exiting = true;
  cleanStage(message);
  const ending = xrSession;
  if (ending) {
    try {
      await ending.end();
    } catch (error) {
      // A system-initiated end can race with our explicit exit.
      if (xrSession === ending && webgl?.xr.isPresenting) {
        exiting = false;
        notify(errorMessage(error, 'VR exit failed. Use the system button'));
        return;
      }
    }
    if (xrSession === ending) returnToSetup();
  } else {
    returnToSetup();
  }
}

// A hidden browser tab must never continue listening or playing crowd sounds.
// In immersive mode, the XR session's own visibility state is authoritative:
// the 2D browser surface is not necessarily visible while the headset is.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (xrSession && xrSession.visibilityState !== 'hidden') return;
  if (view !== 'entry') void leaveStage('Page hidden; rehearsal stopped.');
  else if (mic.active || mic.pending) fallbackToTimed('Page hidden; microphone off.');
});
window.addEventListener('pagehide', () => {
  ++enterGeneration;
  cleanStage();
  if (xrSession) void xrSession.end().catch(() => {});
});

button('desktop-start-stop').addEventListener('click', actions.toggleSession);
button('desktop-debug').addEventListener('click', actions.toggleDebug);
button('desktop-exit').addEventListener('click', actions.exit);
document.querySelectorAll('[data-reaction]').forEach(node => {
  const control = /** @type {HTMLButtonElement} */ (node);
  control.addEventListener('click', () => {
    const kind = control.dataset.reaction;
    if (kind === 'laugh' || kind === 'titter' || kind === 'ripple' || kind === 'applause' || kind === 'cough') actions.react(kind);
  });
});

bus.on(event => {
  if (event.type === 'session') {
    if (event.reason === 'start') {
      crowd.begin(event.at, session.durationMs);
      audience.clearReactions();
      audio.cancelReactions();
      guardUntil = 0;
      if (mode === 'mic' && mic.active) speech.begin();
      else speech.stop();
      audio.setState('running');
      lastEvent = 'Set started';
    } else {
      crowd.cancel();
      speech.stop();
      audience.clearReactions();
      audio.cancelReactions();
      guardUntil = 0;
      audio.setState(event.state);
      // On desktop release every track on stop or finish. Inside an active
      // XR session we stop detection but retain explicitly-enabled tracks
      // until exit, avoiding an invisible re-permission prompt on restart.
      if (event.reason === 'exit' || view === 'desktop') {
        const wasMic = mic.active || mode === 'mic';
        mic.stop();
        if (wasMic) {
          mode = settings.mode = 'timed';
          modeSelect.value = 'timed';
          if (event.reason !== 'exit') notify('Microphone released. Return to setup to enable it again.');
        }
        refreshMicUI();
      }
      lastEvent = event.reason === 'finish' ? 'Set complete' : event.reason === 'exit' ? 'Exited' : 'Set stopped';
      if (event.reason === 'finish') crowd.finish(performance.now());
    }
  } else if (event.type === 'pause') {
    if (session.state === 'running' && mode === 'mic' && mic.active) crowd.onPause(event.at);
  } else if (event.type === 'reaction') {
    if (!isOnStage() || exiting) return;
    audience.react(event);
    audio.play(event, performance.now());
    const description = event.kind.charAt(0).toUpperCase() + event.kind.slice(1);
    lastEvent = description + ' · ' + event.source +
      (event.kind !== 'silence' && event.participants[0]?.seatId !== -1 ? ' · ' + event.participants.length : '');
    if (event.kind === 'laugh' || event.kind === 'ripple' || event.kind === 'applause' || event.kind === 'cough') {
      const end = event.participants.reduce((max, p) => Math.max(max, p.delayMs + p.durationMs), 0);
      guardUntil = Math.max(guardUntil, event.at + end + CONFIG.echoTailMs);
    }
  }
  updateHud(performance.now(), true);
});

/** @param {number} now @param {boolean} [force] */
function updateHud(now, force = false) {
  if (!force && now < nextHud) return;
  nextHud = now + 100;
  const state = session.state;
  document.body.dataset.state = state;
  document.body.dataset.mode = mode;
  document.body.dataset.micActive = String(mic.active);
  document.body.dataset.voices = String(audio.voices.size);
  document.body.dataset.debug = String(overlay.enabled);
  document.body.dataset.lastEvent = lastEvent;
  document.body.dataset.drawCalls = String(lastCalls);
  document.body.dataset.triangles = String(lastTriangles);
  if (view === 'desktop') {
    document.body.dataset.lookYaw = desktop.yaw.toFixed(3);
    document.body.dataset.lookPitch = desktop.pitch.toFixed(3);
  }
  el('hud-time').textContent = formatTime(session.remainingMs);
  el('hud-time').hidden = !settings.countdown;
  el('hud-state-text').textContent = state.toUpperCase();
  el('hud-mode').textContent = mode.toUpperCase();
  const prompt = state === 'running' ? 'The stage is yours. Space stops the set.'
    : state === 'finished' ? 'Set complete. Press Space to start again.'
    : 'Press Space when you are ready.';
  el('hud-prompt').textContent = prompt + (compatibility ? ' · 2D compatibility view' : '');
  const startButton = button('desktop-start-stop');
  if (startButton.dataset.state !== state) {
    startButton.dataset.state = state;
    startButton.innerHTML = (state === 'running' ? 'Stop set' : 'Start set') + ' <kbd>Space</kbd>';
  }
  el('last-event').textContent = lastEvent;
  el('sound-label').textContent = audio.sharedClips ? audio.sharedClips + ' shared sounds + fallbacks' : 'Synthesised placeholders';
}

/** @param {XRFrame | undefined} frame */
function updateViewer(frame) {
  if (xrSession && frame) {
    const reference = webgl?.xr.getReferenceSpace();
    const pose = reference && frame.getViewerPose(reference);
    if (pose) {
      const p = pose.transform.position, q = pose.transform.orientation;
      headWorld.set(p.x, p.y, p.z);
      headOrientation.set(q.x, q.y, q.z, q.w);
      if (!aligned) {
        // Align the ROOM once, before the first rendered headset frame. The
        // camera is never moved artificially. Its physical Y remains intact.
        forward.set(0, 0, -1).applyQuaternion(headOrientation);
        stage.position.set(p.x, 0, p.z);
        stage.rotation.y = Math.atan2(-forward.x, -forward.z);
        stage.updateMatrixWorld(true);
        aligned = true;
        nextEmitters = 0;
      }
    }
  } else if (view !== 'xr') {
    camera.getWorldPosition(headWorld);
    camera.getWorldQuaternion(headOrientation);
  }
  headLocal.copy(headWorld);
  stage.worldToLocal(headLocal);
  forward.set(0, 0, -1).applyQuaternion(headOrientation);
  up.set(0, 1, 0).applyQuaternion(headOrientation);
  if (isOnStage()) audio.setListener(headWorld, forward, up);
}

/** @param {number} now */
function updateEmitters(now) {
  if (!isOnStage() || now < nextEmitters) return;
  nextEmitters = now + 90;
  for (const member of crowd.members) {
    audience.headPosition(member.seat.id, emitterPosition);
    stage.localToWorld(emitterPosition);
    audio.setSeatPosition(member.seat.id, emitterPosition);
  }
  audio.bedPositions.forEach(({ position }, index) => {
    emitterPosition.set(position.x, position.y, position.z);
    stage.localToWorld(emitterPosition);
    audio.setBedPosition(index, emitterPosition);
    if (index === 2) audio.setSeatPosition(-1, emitterPosition);
  });
}

function targetRate() {
  if (compatibility) return '2D preview';
  if (!xrSession) return 'desktop';
  const rate = /** @type {XRSession & {frameRate?:number}} */ (xrSession).frameRate;
  return Number.isFinite(rate) ? String(Math.round(rate || CONFIG.targetFps)) + ' Hz' : CONFIG.targetFps + '+ target';
}

/** @param {number} now */
function updateOverlay(now) {
  overlay.update(now, {
    fps: frames.fps, lowestFps: frames.lowest, target: targetRate(),
    micLevel, micActive: mic.active, speechState: speech.state, armed: speech.armed,
    mode, state: session.state, remainingMs: session.remainingMs,
    attentive: audience.attentiveCount, total: crowd.members.length, reacting: audience.activeCount,
    lastEvent, seed: settings.seed, calls: lastCalls, triangles: lastTriangles,
    voices: audio.voices.size, volume: settings.volume,
    sound: audio.sharedClips ? audio.sharedClips + ' shared + fallback' : 'Synthesised placeholder',
    notice: lastNotice,
  });
}

/** @param {number} _timestamp @param {XRFrame} [frame] */
function animate(_timestamp, frame) {
  if (fatal) return;
  const now = performance.now();
  const dt = Math.max(0, Math.min(0.12, (now - lastNow) / 1000));
  lastNow = now;
  try {
    frames.record(now);
    if (view === 'xr' && xrSession && !exiting && frame) xrInput.poll(xrSession, now);
    updateViewer(frame);
    if (isOnStage() && session.state === 'running' && !exiting) {
      const elapsed = session.elapsedAt(now);
      if (mode === 'timed') crowd.timedThrough(elapsed);
      if (mode !== 'manual') crowd.ambientThrough(elapsed);
      session.advance(now);
    }
    if (mic.active && now >= nextMic) {
      nextMic = now + 32;
      try {
        micLevel = mic.readLevel();
        speech.sample(now, micLevel, now < guardUntil);
      } catch {
        fallbackToTimed('Microphone analysis failed; using timed reactions.');
      }
    } else if (!mic.active) micLevel = 0;
    audience.update(now, now - viewStarted, dt, headLocal);
    updateEmitters(now);
    room.updateTimer(session.remainingMs, session.state);
    updateHud(now);
    updateOverlay(now);
    renderer.render(scene, camera);
    lastCalls = renderer.info.render.calls;
    lastTriangles = renderer.info.render.triangles;
    if (!rendered) {
      rendered = true;
      document.body.dataset.ready = 'true';
      setupStatus.textContent = 'Ready · checking VR availability…';
      updateButtons();
      void checkVR();
    }
  } catch (error) {
    fatal = true;
    document.body.dataset.error = 'true';
    cleanStage();
    notify(errorMessage(error, 'Rendering stopped'));
    setupStatus.textContent = 'Rendering stopped. Refresh the page to try again.';
    updateButtons();
    if (xrSession) void leaveStage('Rendering stopped; VR exited.');
    else setView('entry');
    console.error('Stage Time frame error:', error);
  }
}

async function checkVR() {
  try {
    xrSupported = Boolean(webgl && navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'));
  } catch { xrSupported = false; }
  showAvailability();
  updateButtons();
}

function showAvailability() {
  setupStatus.textContent = compatibility
    ? 'WebGL2 unavailable · simplified 2D desktop view. VR requires WebGL2 and a compatible headset.'
    : xrSupported ? 'Ready · immersive VR available'
    : 'Ready · desktop preview. Enter VR requires a compatible headset browser.';
}

window.addEventListener('error', event => notify('Error: ' + event.message.slice(0, 170)));
window.addEventListener('unhandledrejection', event => notify(errorMessage(event.reason, 'Unexpected error')));
form.seed.value = settings.seed;
form.fill.value = String(settings.fill);
form.minutes.value = String(settings.minutes);
form.volume.value = String(Math.round(settings.volume * 100));
form.house.value = String(Math.round(settings.house * 100));
form.spot.value = String(Math.round(settings.spotlight * 100));
form.countdown.checked = settings.countdown;
modeSelect.value = settings.mode;
applySetup();
refreshMicUI();
setView('entry');
renderer.setAnimationLoop(animate);
