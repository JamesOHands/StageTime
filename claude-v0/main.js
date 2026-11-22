// @ts-check
/**
 * Stage Time — Claude v0. Wires the modules together and runs the frame loop.
 * Logic (session, crowd, speech) emits events; rendering, audio and the overlay react to them.
 */

import * as THREE from 'three';
import { CONFIG } from './src/config.js';
import { EventBus } from './src/events.js';
import { parseSeed, createStream } from './src/rng.js';
import { Session, formatClock } from './src/session.js';
import { Crowd, clampFill, buildTimedSchedule } from './src/crowd.js';
import { PauseDetector } from './src/speech.js';
import { Mic } from './src/mic.js';
import { AudioEngine } from './src/audio.js';
import { buildRoom } from './src/render/room.js';
import { AudienceView } from './src/render/audience.js';
import { DebugOverlay, FrameStats } from './src/render/overlay.js';
import { DesktopControls } from './src/input/desktop.js';
import { XRControls } from './src/input/xr.js';

/** @typedef {import('./src/config.js').Mode} Mode */
/** @typedef {import('./src/input/desktop.js').Action} Action */

// ---------------------------------------------------------------------------------
// Settings (URL parameters → form → settings)
// ---------------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** @param {string | null} v @param {number} fallback */
const num = (v, fallback) => (v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);
const modeParam = params.get('mode');

const settings = {
  seed: parseSeed(params.get('seed')),
  /** @type {Mode} */
  mode: modeParam === 'timed' || modeParam === 'manual' ? modeParam : 'mic',
  fill: clampFill(num(params.get('fill'), CONFIG.audience.fillDefault)),
  minutes: clamp(Math.round(num(params.get('minutes'), CONFIG.session.minutesDefault)), CONFIG.session.minutesMin, CONFIG.session.minutesMax),
  volume: CONFIG.audio.volumeDefault,
  house: CONFIG.lighting.houseDefault,
  spot: CONFIG.lighting.spotDefault,
  countdown: true,
  /** @type {'left'|'right'|'none'} */
  micHand: 'right',
};

// ---------------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------------

/** @template {HTMLElement} T @param {string} id @returns {T} */
const $ = (id) => /** @type {T} */ (document.getElementById(id));
const ui = {
  panel: $('panel'),
  status: $('status'),
  micBtn: /** @type {HTMLButtonElement} */ ($('mic-btn')),
  micStatus: $('mic-status'),
  modeRadios: /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="mode"]')),
  fill: /** @type {HTMLInputElement} */ ($('fill')),
  fillOut: $('fill-out'),
  minutes: /** @type {HTMLInputElement} */ ($('minutes')),
  volume: /** @type {HTMLInputElement} */ ($('volume')),
  volumeOut: $('volume-out'),
  house: /** @type {HTMLInputElement} */ ($('house')),
  spot: /** @type {HTMLInputElement} */ ($('spot')),
  countdown: /** @type {HTMLInputElement} */ ($('countdown')),
  micHand: /** @type {HTMLSelectElement} */ ($('mic-hand')),
  seed: /** @type {HTMLInputElement} */ ($('seed')),
  newSeed: /** @type {HTMLButtonElement} */ ($('new-seed')),
  enterVR: /** @type {HTMLButtonElement} */ ($('enter-vr')),
  startDesktop: /** @type {HTMLButtonElement} */ ($('start-desktop')),
  vrNote: $('vr-note'),
  menuBtn: /** @type {HTMLButtonElement} */ ($('menu-btn')),
  hint: $('hint'),
  debug: $('debug'),
};

/** @type {string[]} */
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.message ?? e.reason)));

// ---------------------------------------------------------------------------------
// Three.js
// ---------------------------------------------------------------------------------

const canvas = /** @type {HTMLCanvasElement} */ ($('scene'));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060405);
scene.fog = new THREE.Fog(0x070506, 7, 16);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 40);
camera.position.set(0, CONFIG.desktop.eyeHeight, 0);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const room = buildRoom(scene, { house: settings.house, spot: settings.spot });
const audienceView = new AudienceView(scene);
const overlay = new DebugOverlay(scene, ui.debug);
const stats = new FrameStats();

// ---------------------------------------------------------------------------------
// Logic, audio, mic
// ---------------------------------------------------------------------------------

const bus = new EventBus();
/** @type {import('./src/events.js').Emit} */
const emit = (e) => bus.emit(e);
const audio = new AudioEngine();
const mic = new Mic();
const detector = new PauseDetector({ emit });
const session = new Session({ durationMs: settings.minutes * 60000, emit });

/** @type {Crowd} */
let crowd;
let builtFor = '';
function buildCrowd() {
  const key = `${settings.seed}|${settings.fill}`;
  if (key === builtFor) return;
  builtFor = key;
  crowd = new Crowd({ seed: settings.seed, fill: settings.fill, now: performance.now(), emit, clipCounts: audio.clipCounts() });
  audienceView.build(crowd.members);
  audio.setMembers(crowd.members);
}
buildCrowd();

/** The mode actually in use this session (mic falls back to timed). @type {Mode} */
let activeMode = settings.mode;
let modeNote = '';
/** @type {{ atMs: number, outcome: import('./src/config.js').Outcome }[]} */
let schedule = [];
let lastEvent = { text: 'none', at: 0 };
let soundSource = 'preparing';

function chooseMode() {
  activeMode = settings.mode;
  modeNote = '';
  if (settings.mode === 'mic' && !mic.active) {
    activeMode = 'timed';
    modeNote = mic.status === 'off' ? 'mic not enabled → timed' : `mic ${mic.status} → timed`;
  }
}

/** @param {number} fromMs session-clock time to schedule from */
function buildSchedule(fromMs) {
  const all = buildTimedSchedule(createStream(settings.seed, `schedule:${session.count}`), session.durationMs);
  schedule = all.filter((e) => e.atMs > fromMs);
}

bus.on('reaction', (plan) => {
  const now = performance.now();
  audienceView.onReaction(/** @type {any} */ (plan), now);
  audio.playReaction(/** @type {any} */ (plan));
  const n = plan.participants.length;
  lastEvent = { text: `${plan.kind}${n ? ` ×${n}` : ''} (${plan.source})`, at: now };
  if (plan.kind !== 'silence') detector.noteReaction(plan.at);
  if (CONFIG.reactions.loudKinds.includes(plan.kind)) detector.setGuard(plan.at + plan.durationMs + CONFIG.speech.echoGuardMs);
});

bus.on('ambient', (e) => {
  audienceView.onAmbient(/** @type {any} */ (e), performance.now());
  audio.playAmbient(/** @type {any} */ (e));
});

bus.on('cancel', () => {
  audio.cancelAll();
  audienceView.cancel(performance.now());
});

bus.on('session', (e) => {
  const at = e.at;
  lastEvent = { text: `session ${e.state}${e.reason ? ` (${e.reason})` : ''}`, at: performance.now() };
  crowd.setSessionState(e.state, at);
  audio.setSessionState(e.state);
  detector.clearSegment();
  if (e.state === 'running') {
    chooseMode();
    schedule = [];
    if (activeMode === 'timed') buildSchedule(0);
  } else if (e.state === 'finished') {
    schedule = [];
    crowd.trigger('applause', at, 'finish');
  } else {
    schedule = [];
    crowd.cancelAll(at);
  }
});

bus.on('pause', (e) => {
  if (session.state === 'running' && activeMode === 'mic') crowd.triggerOutcome(crowd.rollOutcome(), e.at, 'pause');
});

// ---------------------------------------------------------------------------------
// Actions (desktop keys and controller buttons)
// ---------------------------------------------------------------------------------

/** @param {number} v */
function setVolume(v) {
  settings.volume = Math.round(clamp(v, 0, 1) * 100) / 100;
  audio.setVolume(settings.volume);
  ui.volume.value = String(Math.round(settings.volume * 100));
  ui.volumeOut.textContent = `${Math.round(settings.volume * 100)}%`;
}

/** @param {Action} action */
function onAction(action) {
  const now = performance.now();
  switch (action) {
    case 'toggleSession':
      session.toggle(now);
      break;
    case 'laugh':
    case 'titter':
    case 'applause':
    case 'cough':
      crowd.trigger(action, now, 'manual');
      break;
    case 'debug':
      overlay.toggle();
      break;
    case 'volumeUp':
      setVolume(settings.volume + CONFIG.audio.volumeStep);
      lastEvent = { text: `volume ${Math.round(settings.volume * 100)}%`, at: now };
      break;
    case 'volumeDown':
      setVolume(settings.volume - CONFIG.audio.volumeStep);
      lastEvent = { text: `volume ${Math.round(settings.volume * 100)}%`, at: now };
      break;
    case 'exitVR':
      renderer.xr.getSession()?.end();
      break;
  }
}

const desktop = new DesktopControls(camera, canvas, onAction);
const xr = new XRControls(renderer, scene, onAction);
xr.setMicHand(settings.micHand);
xr.onGripsChanged = () => {
  room.setStandHasMic(!(renderer.xr.isPresenting && xr.holdsMic));
  overlay.attachTo(xr.grips.left);
};

// ---------------------------------------------------------------------------------
// Entry page
// ---------------------------------------------------------------------------------

function syncForm() {
  for (const r of ui.modeRadios) r.checked = r.value === settings.mode;
  ui.fill.value = String(settings.fill);
  ui.fillOut.textContent = String(settings.fill);
  ui.minutes.value = String(settings.minutes);
  ui.house.value = String(Math.round(settings.house * 100));
  ui.spot.value = String(Math.round(settings.spot * 100));
  ui.countdown.checked = settings.countdown;
  ui.micHand.value = settings.micHand;
  ui.seed.value = String(settings.seed);
  setVolume(settings.volume);
}

function updateUrl() {
  const p = new URLSearchParams({ seed: String(settings.seed), mode: settings.mode, fill: String(settings.fill), minutes: String(settings.minutes) });
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function readForm() {
  const checked = [...ui.modeRadios].find((r) => r.checked);
  settings.mode = /** @type {Mode} */ (checked?.value ?? settings.mode);
  settings.fill = clampFill(Number(ui.fill.value));
  settings.minutes = clamp(Math.round(num(ui.minutes.value, settings.minutes)), CONFIG.session.minutesMin, CONFIG.session.minutesMax);
  settings.seed = parseSeed(ui.seed.value);
  settings.countdown = ui.countdown.checked;
  settings.micHand = /** @type {'left'|'right'|'none'} */ (ui.micHand.value);
  ui.seed.value = String(settings.seed);
  ui.fillOut.textContent = String(settings.fill);
  session.durationMs = settings.minutes * 60000;
  xr.setMicHand(settings.micHand);
  if (session.state !== 'running') buildCrowd();
  updateUrl();
}

for (const el of [ui.fill, ui.minutes, ui.seed, ui.countdown, ui.micHand, ...ui.modeRadios]) el.addEventListener('change', readForm);
ui.fill.addEventListener('input', () => (ui.fillOut.textContent = ui.fill.value));
ui.volume.addEventListener('input', () => setVolume(Number(ui.volume.value) / 100));
for (const el of [ui.house, ui.spot]) {
  el.addEventListener('input', () => {
    settings.house = Number(ui.house.value) / 100;
    settings.spot = Number(ui.spot.value) / 100;
    room.setLighting(settings.house, settings.spot);
  });
}
ui.newSeed.addEventListener('click', () => {
  ui.seed.value = String(parseSeed(''));
  readForm();
});

function updateMicUi() {
  const text = {
    off: 'Off.',
    on: 'On. Listening for pauses — analysed on this device only, never recorded or sent.',
    denied: 'Permission denied. Timed reactions will be used instead.',
    unavailable: 'No microphone available here. Timed reactions will be used instead.',
    error: 'The microphone stopped working. Timed reactions will be used instead.',
  }[mic.status];
  ui.micStatus.textContent = text;
  ui.micBtn.textContent = mic.active ? 'Microphone on' : 'Enable microphone';
  ui.micBtn.disabled = mic.active;
}

ui.micBtn.addEventListener('click', async () => {
  const ctx = audio.ensureContext();
  ui.micStatus.textContent = 'Asking for permission…';
  const ok = await mic.start(ctx);
  if (ok) {
    settings.mode = 'mic';
    syncForm();
    updateUrl();
  }
  updateMicUi();
});

/** @param {boolean} inScene */
function showPanel(inScene) {
  ui.panel.hidden = inScene;
  ui.menuBtn.hidden = !inScene || renderer.xr.isPresenting;
  ui.hint.hidden = !inScene || renderer.xr.isPresenting;
}

ui.startDesktop.addEventListener('click', () => {
  audio.ensureContext();
  readForm();
  showPanel(true);
  desktop.setEnabled(true);
  room.setStandHasMic(true);
});

ui.menuBtn.addEventListener('click', () => {
  session.stop(performance.now(), 'menu');
  desktop.setEnabled(false);
  showPanel(false);
});

ui.enterVR.addEventListener('click', async () => {
  if (!navigator.xr) return;
  audio.ensureContext();
  readForm();
  try {
    const xrSession = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    xrSession.addEventListener('end', onXREnd);
    await renderer.xr.setSession(xrSession);
    desktop.setEnabled(false);
    showPanel(true);
    stats.reset();
    overlay.setInVR(true);
    xr.onGripsChanged?.();
  } catch (err) {
    ui.vrNote.textContent = `Couldn't start VR: ${/** @type {Error} */ (err).message}`;
    errors.push(String(/** @type {Error} */ (err).message));
  }
});

function onXREnd() {
  session.stop(performance.now(), 'exit VR');
  mic.release();
  detector.clearSegment();
  updateMicUi();
  ui.micStatus.textContent = 'Released when you left VR. Enable it again to use mic mode.';
  camera.position.set(0, CONFIG.desktop.eyeHeight, 0);
  desktop.apply();
  overlay.attachTo(null);
  overlay.setInVR(false);
  room.setStandHasMic(true);
  stats.reset();
  showPanel(false);
}

// Leaving or hiding the page lets go of the mic. (Not while in VR: some browsers hide the page then.)
window.addEventListener('pagehide', () => {
  session.stop(performance.now(), 'page hidden');
  mic.release();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !renderer.xr.isPresenting) {
    session.stop(performance.now(), 'page hidden');
    mic.release();
    updateMicUi();
  }
});

if (navigator.xr) {
  navigator.xr
    .isSessionSupported('immersive-vr')
    .then((ok) => {
      ui.enterVR.disabled = !ok;
      if (!ok) ui.vrNote.textContent = "VR isn't available in this browser. Use Start on desktop, or open this page in the Quest Browser.";
    })
    .catch(() => (ui.enterVR.disabled = true));
} else {
  ui.enterVR.disabled = true;
  ui.vrNote.textContent = "VR isn't available in this browser. Use Start on desktop, or open this page in the Quest Browser.";
}

syncForm();
updateMicUi();
updateUrl();

ui.status.textContent = 'Preparing sounds…';
audio
  .prepare()
  .then((counts) => {
    crowd.setClipCounts(counts);
    soundSource = Object.values(audio.sourceOf).includes('library') ? 'library + placeholders' : 'placeholders';
    ui.status.textContent = `Ready. Sounds: ${soundSource}.`;
    audio.startRoomTone();
  })
  .catch((err) => {
    errors.push(`sound: ${err.message}`);
    ui.status.textContent = 'Sounds failed to load — see the debug overlay.';
  });

// ---------------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------------

const headPos = new THREE.Vector3();
let lastFrame = performance.now();

/** @param {number} now */
function debugLines(now) {
  const xrSession = renderer.xr.getSession();
  const target = xrSession && 'frameRate' in xrSession && xrSession.frameRate ? Math.round(Number(xrSession.frameRate)) : '—';
  const micLine = mic.active
    ? `mic ${mic.levelDb.toFixed(0)} dB · floor ${detector.floorDb.toFixed(0)} · ${detector.isGuarded(now) ? 'guard' : detector.voiced ? 'speaking' : 'silent'} · ${detector.isArmed(now) ? 'ARMED' : 'not armed'}`
    : `mic ${mic.status}`;
  const ago = lastEvent.at ? `${((now - lastEvent.at) / 1000).toFixed(1)} s ago` : '';
  return [
    `fps ${stats.fps} · target ${target} · min 10 s ${stats.min10s}`,
    `mode ${session.state === 'running' ? activeMode : settings.mode}${modeNote && session.state === 'running' ? ` (${modeNote})` : ''}`,
    micLine,
    `session ${session.state} · ${formatClock(session.remaining(now))} left`,
    `crowd ${crowd.stateLabel(now)} · ${crowd.lookingCount()}/${crowd.members.length} looking`,
    `last: ${lastEvent.text} ${ago}`,
    `seed ${settings.seed} · fill ${settings.fill} · voices ${audio.pendingVoices()}`,
    `sounds ${soundSource} · vol ${Math.round(settings.volume * 100)}%`,
    ...errors.slice(-3).map((e) => `! ${e}`.slice(0, 60)),
  ];
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  stats.tick(now);

  if (renderer.xr.isPresenting) xr.poll(now);
  session.update(now);

  // If the mic dies mid-set, carry on with timed reactions.
  if (session.state === 'running' && activeMode === 'mic' && !mic.active) {
    activeMode = 'timed';
    modeNote = `mic ${mic.status} → timed`;
    buildSchedule(session.elapsed(now));
    updateMicUi();
  }
  if (session.state === 'running' && activeMode === 'timed') {
    const elapsed = session.elapsed(now);
    while (schedule.length && schedule[0].atMs <= elapsed) {
      const ev = /** @type {{ atMs: number, outcome: import('./src/config.js').Outcome }} */ (schedule.shift());
      crowd.triggerOutcome(ev.outcome, session.startedAt + ev.atMs, 'timed');
    }
  }

  crowd.update(now);
  if (mic.active) detector.sample(now, mic.read());

  camera.getWorldPosition(headPos);
  audienceView.update(now, dt, headPos);
  audio.updateListener(camera.matrixWorld);

  if (settings.countdown) room.setCountdown(formatClock(session.remaining(now)));
  else room.setCountdown(null);
  overlay.update(debugLines(now), now);

  renderer.render(scene, camera);
});

// Handles for automated desktop tests (tests/browser_test.py). Not used by the app itself.
Object.assign(window, {
  __stageTime: { renderer, session, getCrowd: () => crowd, mic, detector, overlay, audio, onAction, getLastEvent: () => lastEvent, settings, errors, camera, simulateXREnd: onXREnd, debugLines: () => debugLines(performance.now()) },
});
