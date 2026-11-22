// @ts-check

import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, formatTime, settingsFromQuery } from '../src/config.js';
import { EventBus } from '../src/events.js';
import { Crowd, attentionAt, makeMembers, makeSeats, rollOutcome } from '../src/crowd.js';
import { Session } from '../src/session.js';
import { SpeechDetector } from '../src/speech.js';
import { stream } from '../src/rng.js';
import { XRInput } from '../src/input/xr.js';
import { Audience } from '../src/render/audience.js';

test('query settings are bounded; default session is five minutes and 20 seats', () => {
  const defaults = settingsFromQuery('?seed=demo');
  assert.equal(defaults.fill, 20);
  assert.equal(defaults.minutes, 5);
  assert.equal(defaults.mode, 'timed');
  const chosen = settingsFromQuery('?seed=repeat&fill=99&minutes=-5&mode=mic');
  assert.equal(chosen.seed, 'repeat');
  assert.equal(chosen.fill, 30);
  assert.equal(chosen.minutes, 1);
  assert.equal(chosen.mode, 'mic');
  assert.equal(settingsFromQuery('?fill=broken&minutes=NaN&mode=bad&seed=x').minutes, 5);
  assert.equal(formatTime(300000), '5:00');
  assert.equal(formatTime(100), '0:01');
});

test('D3: 30 physical seats, seeded fill/appearance, and independent streams', () => {
  const seats = makeSeats();
  assert.equal(seats.length, 30);
  assert.equal(new Set(seats.map(seat => seat.id)).size, 30);
  assert.equal(new Set(seats.map(seat => seat.x + ',' + seat.z)).size, 30);
  assert.equal(CONFIG.audienceFloor, -0.45);
  const sameA = makeMembers('pub-demo', 20), sameB = makeMembers('pub-demo', 20);
  assert.deepEqual(sameA, sameB);
  assert.notDeepEqual(sameA, makeMembers('another-demo', 20));
  assert.equal(makeMembers('pub-demo', 15).length, 15);
  assert.equal(makeMembers('pub-demo', 30).length, 30);
  const appearance = stream('pub-demo', 'appearance');
  for (let i = 0; i < 250; i++) appearance();
  const schedA = stream('pub-demo', 'schedule'), schedB = stream('pub-demo', 'schedule');
  assert.deepEqual(Array.from({ length: 16 }, () => schedA()), Array.from({ length: 16 }, () => schedB()));
});

test('D3: identical full timed and ambient schedules at normal and throttled frame intervals', () => {
  /** @param {number} step @param {string} seed */
  function run(step, seed) {
    const bus = new EventBus();
    const crowd = new Crowd(bus, seed, 20);
    /** @type {import('../src/events.js').ReactionEvent[]} */
    const result = [];
    bus.on(event => { if (event.type === 'reaction' && event.source === 'timed') result.push(event); });
    crowd.begin(1000, 300000);
    for (let t = 0; t <= 300000; t += step) {
      const elapsed = Math.min(300000, t);
      crowd.timedThrough(elapsed);
      crowd.ambientThrough(elapsed);
      // Manual reaction draws must not change the timed stream.
      if (t % 9 === 0) crowd.manual('cough', 1000 + t);
    }
    crowd.timedThrough(300000);
    crowd.ambientThrough(300000);
    return { result, plan: crowd.timed, ambient: crowd.ambient };
  }
  const fast = run(14, 'same-room'), slow = run(781, 'same-room');
  assert.deepEqual(fast, slow);
  assert.notDeepEqual(fast, run(14, 'different-room'));
  assert.ok(fast.result.length >= 7);
  let previous = 0;
  for (const event of fast.plan) {
    assert.ok(event.at - previous >= 15000 && event.at - previous <= 40000);
    previous = event.at;
  }
});

test('reaction weights, participants, individual timings and silence', () => {
  assert.equal(rollOutcome(() => 0.0), 'silence');
  assert.equal(rollOutcome(() => 0.4), 'titter');
  assert.equal(rollOutcome(() => 0.7), 'ripple');
  assert.equal(rollOutcome(() => 0.9), 'laugh');
  const crowd = new Crowd(new EventBus(), 'reaction-test', 30);
  const rng = stream('reaction-test', 'sample');
  assert.equal(crowd.makeReaction('silence', 0, 'manual', rng).participants.length, 0);
  for (let i = 0; i < 25; i++) {
    const titter = crowd.makeReaction('titter', 0, 'manual', rng);
    const ripple = crowd.makeReaction('ripple', 0, 'manual', rng);
    const laugh = crowd.makeReaction('laugh', 0, 'manual', rng);
    assert.ok(titter.participants.length >= 1 && titter.participants.length <= 3);
    assert.ok(ripple.participants.length >= 4 && ripple.participants.length <= 8);
    assert.ok(laugh.participants.length >= 15 && laugh.participants.length <= 27);
    for (const [event, maxDelay] of [[titter, 300], [ripple, 500], [laugh, 800]]) {
      const reaction = /** @type {import('../src/events.js').ReactionEvent} */ (event);
      assert.equal(new Set(reaction.participants.map(p => p.seatId)).size, reaction.participants.length);
      assert.ok(reaction.participants.every(p => p.delayMs >= 0 && p.delayMs <= Number(maxDelay)));
      assert.ok(reaction.participants.every(p => p.pitch >= 0.9 && p.pitch <= 1.1));
    }
  }
});

test('idle attention is deterministic, staggered, and mostly on the stage', () => {
  const members = makeMembers('gaze-test', 30);
  let attentive = 0, total = 0;
  for (let t = 0; t < 180000; t += 937) {
    for (const member of members) {
      if (attentionAt(member, t).target === 'stage') attentive++;
      total++;
    }
  }
  assert.ok(attentive / total > 0.78 && attentive / total < 0.96);
  assert.ok(new Set(members.map(m => m.phase)).size === members.length);
});

test('30 animated audience members stay within a conservative geometry budget', () => {
  for (const seed of ['demo', 'stage-v0-test', 'different-crowd', 'audience-max', '5']) {
    const crowd = new Audience(makeMembers(seed, 30));
    let triangles = 0, calls = 0;
    for (const batch of Object.values(crowd.batches)) {
      const mesh = batch.mesh;
      if (!mesh) continue;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 * mesh.count;
      calls++;
    }
    assert.ok(calls <= 6);
    assert.ok(triangles < 70000, 'audience triangles: ' + triangles);
    crowd.dispose();
  }
});

test('D4: monotonic one-minute session, genuine finish and early stop cancellation', () => {
  const bus = new EventBus();
  const session = new Session(bus, 60000);
  const crowd = new Crowd(bus, 'stop-test', 20);
  /** @type {import('../src/events.js').StageEvent[]} */
  const events = [];
  bus.on(event => {
    events.push(event);
    if (event.type !== 'session') return;
    if (event.reason === 'start') crowd.begin(event.at, session.durationMs);
    else crowd.cancel();
  });
  assert.equal(session.state, 'ready');
  session.start(1000);
  session.advance(31250);
  assert.equal(session.state, 'running');
  assert.equal(session.remainingMs, 29750);
  session.advance(61041);
  assert.equal(session.state, 'finished');
  assert.equal(session.remainingMs, 0);
  const finish = events.find(event => event.type === 'session' && event.reason === 'finish');
  assert.equal(finish?.at, 61000);
  session.start(70000);
  session.stop(73000);
  assert.equal(session.state, 'ready');
  assert.equal(session.remainingMs, 60000);
  const count = events.length;
  crowd.timedThrough(60000);
  crowd.ambientThrough(60000);
  assert.equal(events.length, count);
  assert.equal(session.state, 'ready');
  session.stop(80000);
  assert.equal(session.state, 'ready');
});

test('D8: exactly one outcome across a ten-second pause; fresh two-second speech required', () => {
  const bus = new EventBus(), detector = new SpeechDetector(bus);
  /** @type {import('../src/events.js').PauseEvent[]} */
  const pauses = [];
  bus.on(event => { if (event.type === 'pause') pauses.push(event); });
  let time = 0;
  /** @param {number} duration @param {number} level @param {boolean} [guard] */
  const feed = (duration, level, guard = false) => {
    for (let i = 0; i < duration; i += 50) { detector.sample(time, level, guard); time += 50; }
  };
  detector.begin();
  feed(3000, 0.12);
  feed(10000, 0.002);
  assert.equal(pauses.length, 1);
  assert.equal(detector.armed, false);
  feed(1500, 0.12);
  feed(3000, 0.002);
  assert.equal(pauses.length, 1);
  feed(2200, 0.12);
  feed(1000, 0.002);
  assert.equal(pauses.length, 2);
  feed(15000, 0.002);
  assert.equal(pauses.length, 2);
});

test('D8: echo guard discards speech and requires a genuinely new segment', () => {
  const bus = new EventBus(), detector = new SpeechDetector(bus);
  let count = 0, time = 0;
  bus.on(event => { if (event.type === 'pause') count++; });
  /** @param {number} duration @param {number} level @param {boolean} [guard] */
  const feed = (duration, level, guard = false) => {
    for (let i = 0; i < duration; i += 50) { detector.sample(time, level, guard); time += 50; }
  };
  detector.begin();
  feed(2200, 0.12);
  assert.equal(detector.armed, true);
  feed(4000, 0.20, true);
  assert.equal(detector.state, 'guarded');
  assert.equal(detector.armed, false);
  feed(1000, 0.002);
  assert.equal(count, 0);
  feed(2100, 0.12); feed(850, 0.002);
  assert.equal(count, 1);
  feed(2100, 0.12); feed(9000, 0.002); // segment fell in the cooldown
  assert.equal(count, 1);
  detector.stop();
  feed(3000, 0.12); feed(1000, 0.002);
  assert.equal(count, 1);
});

test('controller input mapping (synthetic Quest layout): edges, hold-to-start, volume and exit', () => {
  /** @type {string[]} */
  const events = [];
  const input = new XRInput({
    toggleSession: () => events.push('session'),
    react: kind => events.push(kind),
    toggleDebug: () => events.push('debug'),
    adjustVolume: amount => events.push(amount > 0 ? 'volume-up' : 'volume-down'),
    exit: () => events.push('exit'),
  });
  const pad = () => ({ mapping: 'xr-standard', buttons: Array.from({ length: 7 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] });
  const left = pad(), right = pad();
  // Deliberately reverse the array order. Handedness must be respected.
  const xr = /** @type {XRSession} */ (/** @type {unknown} */ ({
    inputSources: [
      { handedness: 'right', gamepad: right, profiles: ['meta-quest-touch-plus'] },
      { handedness: 'left', gamepad: left, profiles: ['oculus-touch-v3'] },
    ],
  }));
  input.poll(xr, 0);
  right.buttons[4].pressed = true; input.poll(xr, 10); input.poll(xr, 22);
  right.buttons[4].pressed = false; input.poll(xr, 30);
  right.buttons[5].pressed = true; left.buttons[4].pressed = true; left.buttons[5].pressed = true;
  input.poll(xr, 40);
  right.buttons[5].pressed = false; left.buttons[4].pressed = false; left.buttons[5].pressed = false;
  left.buttons[3].pressed = true; right.buttons[3].pressed = true; input.poll(xr, 100);
  input.poll(xr, 1099); assert.ok(!events.includes('session'));
  input.poll(xr, 1100); input.poll(xr, 1900);
  right.buttons[3].pressed = false; left.buttons[3].pressed = false; right.axes[3] = -1;
  input.poll(xr, 2000);
  right.axes[3] = 0; input.poll(xr, 2100); right.axes[3] = 1; input.poll(xr, 2200);
  right.axes[3] = 0; left.buttons[1].pressed = true; right.buttons[1].pressed = true;
  input.poll(xr, 2300); input.poll(xr, 3299); assert.ok(!events.includes('exit'));
  input.poll(xr, 3300); input.poll(xr, 4300);
  assert.deepEqual(events, ['laugh', 'titter', 'applause', 'cough', 'debug', 'session', 'volume-up', 'volume-down', 'exit']);
});
