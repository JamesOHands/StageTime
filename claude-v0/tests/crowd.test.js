// @ts-check
// D3: repeatable randomness, independent of frame rate. Run: node --test claude-v0/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Crowd, buildSeats, buildTimedSchedule } from '../src/crowd.js';
import { createStream } from '../src/rng.js';

/** @param {any[]} log */
const collect = (log) => /** @param {any} e */ (e) => log.push(e);

/** @param {Crowd} c */
const looks = (c) => c.members.map((m) => ({ seat: m.seat.index, look: m.look, voice: m.voice }));

test('30 physical seats, all facing the performer', () => {
  const seats = buildSeats();
  assert.equal(seats.length, 30);
  for (const s of seats) {
    assert.ok(s.z < -1.1, 'every seat is in front of the stage edge');
    const facing = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    const toOrigin = { x: -s.x, z: -s.z };
    const len = Math.hypot(toOrigin.x, toOrigin.z);
    assert.ok((facing.x * toOrigin.x + facing.z * toOrigin.z) / len > 0.999);
  }
});

test('same seed and fill → same audience; different seed → different', () => {
  const a = new Crowd({ seed: 123, fill: 20, now: 0, emit: () => {} });
  const b = new Crowd({ seed: 123, fill: 20, now: 0, emit: () => {} });
  const c = new Crowd({ seed: 124, fill: 20, now: 0, emit: () => {} });
  assert.equal(a.members.length, 20);
  assert.deepEqual(looks(a), looks(b));
  assert.notDeepEqual(looks(a), looks(c));
});

test('fill is clamped to 15–30', () => {
  assert.equal(new Crowd({ seed: 1, fill: 3, now: 0, emit: () => {} }).members.length, 15);
  assert.equal(new Crowd({ seed: 1, fill: 99, now: 0, emit: () => {} }).members.length, 30);
});

/**
 * Simulate a session at a given frame pattern and record everything that happens.
 * @param {(i: number) => number} frameGapMs
 */
function simulate(frameGapMs) {
  /** @type {any[]} */
  const log = [];
  const crowd = new Crowd({ seed: 42, fill: 22, now: 1000, emit: collect(log) });
  const checkpoints = [5000, 15000, 30000, 60000, 90000, 120000];
  /** @type {string[][]} */
  const snapshots = [];
  let t = 1000;
  let i = 0;
  let started = false;
  const triggers = [
    { at: 20000, kind: /** @type {const} */ ('laugh') },
    { at: 47000, kind: /** @type {const} */ ('titter') },
    { at: 80000, kind: /** @type {const} */ ('applause') },
  ];
  while (t < 121000) {
    const next = t + frameGapMs(i++);
    // Things that happen at exact times (user actions, checkpoints) are applied at those times.
    if (!started && next >= 10000) {
      crowd.setSessionState('running', 10000);
      started = true;
    }
    for (const trig of triggers) if (t < trig.at && next >= trig.at) crowd.trigger(trig.kind, trig.at, 'test');
    for (const cp of checkpoints) {
      if (t < cp && next >= cp) {
        crowd.update(cp);
        snapshots.push(crowd.members.map((m) => m.attention));
      }
    }
    t = next;
    crowd.update(t);
  }
  return { log: JSON.stringify(log), snapshots };
}

test('frame rate does not change behaviour (72 fps vs 30 fps vs jittery)', () => {
  const steady72 = simulate(() => 1000 / 72);
  const steady30 = simulate(() => 1000 / 30);
  const jitter = createStream(9, 'jitter');
  const jittery = simulate(() => jitter.range(5, 120));
  assert.equal(steady30.log, steady72.log);
  assert.equal(jittery.log, steady72.log);
  assert.deepEqual(steady30.snapshots, steady72.snapshots);
  assert.deepEqual(jittery.snapshots, steady72.snapshots);
  assert.ok(steady72.log.includes('"type":"ambient"'), 'ambience happened');
});

test('timed schedule is repeatable and gaps are 15–40 s', () => {
  const a = buildTimedSchedule(createStream(7, 'schedule:1'), 5 * 60000);
  const b = buildTimedSchedule(createStream(7, 'schedule:1'), 5 * 60000);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 7 && a.length <= 20);
  let prev = 0;
  for (const e of a) {
    const gap = e.atMs - prev;
    assert.ok(gap >= 15000 && gap <= 40000, `gap ${gap}`);
    prev = e.atMs;
  }
});

test('reaction sizes follow the spec and nobody appears twice', () => {
  const crowd = new Crowd({ seed: 5, fill: 20, now: 0, emit: () => {} });
  let t = 0;
  for (let i = 0; i < 40; i++) {
    t += 20000; // far apart, so everyone is free
    const titter = crowd.planReaction('titter', t, 'test');
    assert.ok(titter.participants.length >= 1 && titter.participants.length <= 3);
    t += 20000;
    const ripple = crowd.planReaction('ripple', t, 'test');
    assert.ok(ripple.participants.length >= 4 && ripple.participants.length <= 8);
    t += 20000;
    const laugh = crowd.planReaction('laugh', t, 'test');
    assert.ok(laugh.participants.length >= 10 && laugh.participants.length <= 18);
    const ids = laugh.participants.map((p) => p.memberId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(Math.max(...laugh.participants.map((p) => p.delayMs)) <= 800);
  }
});

test('the same person never plays the same clip twice in a row', () => {
  const crowd = new Crowd({ seed: 11, fill: 15, now: 0, emit: () => {} });
  /** @type {Map<number, number>} */
  const last = new Map();
  let t = 0;
  for (let i = 0; i < 200; i++) {
    t += 10000;
    for (const p of crowd.planReaction('laugh', t, 'test').participants) {
      assert.notEqual(last.get(p.memberId), p.clip);
      last.set(p.memberId, p.clip);
    }
  }
});

test('cancelAll frees everyone and emits cancel', () => {
  /** @type {any[]} */
  const log = [];
  const crowd = new Crowd({ seed: 3, fill: 20, now: 0, emit: collect(log) });
  crowd.trigger('applause', 1000, 'test');
  assert.ok(crowd.members.some((m) => m.busyUntil > 1500));
  crowd.cancelAll(1500);
  assert.ok(crowd.members.every((m) => m.busyUntil <= 1500));
  assert.equal(log.at(-1).type, 'cancel');
  assert.equal(crowd.stateLabel(1500), 'chatting');
});

test('silence is an outcome with no participants', () => {
  /** @type {any[]} */
  const log = [];
  const crowd = new Crowd({ seed: 3, fill: 20, now: 0, emit: collect(log) });
  crowd.triggerOutcome('silence', 1000, 'pause');
  assert.equal(log.length, 1);
  assert.equal(log[0].kind, 'silence');
  assert.equal(log[0].participants.length, 0);
});

test('attention: roughly 85% look at the stage during a set', () => {
  const crowd = new Crowd({ seed: 77, fill: 30, now: 0, emit: () => {} });
  crowd.setSessionState('running', 0);
  let looking = 0;
  let samples = 0;
  for (let t = 10000; t < 600000; t += 1000) {
    crowd.update(t);
    looking += crowd.lookingCount();
    samples += crowd.members.length;
  }
  const share = looking / samples;
  assert.ok(share > 0.78 && share < 0.92, `share ${share.toFixed(2)}`);
});
