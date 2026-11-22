// @ts-check
// D8: one outcome per pause, re-arm on fresh speech, echo guard. Run: node --test claude-v0/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { PauseDetector } from '../src/speech.js';

const QUIET = -60;
const TALK = -22;
const CROWD = -15;

/**
 * Feed a scripted level timeline into a detector at a given sample rate.
 * @param {[number, number][]} script [durationMs, levelDb] pairs
 * @param {number} hz
 * @param {(d: PauseDetector, t: number) => void} [hook]
 */
function run(script, hz = 72, hook) {
  /** @type {any[]} */
  const events = [];
  const d = new PauseDetector({ emit: (e) => events.push(e) });
  const step = 1000 / hz;
  let t = 0;
  for (const [dur, level] of script) {
    const end = t + dur;
    for (; t < end; t += step) {
      hook?.(d, t);
      d.sample(t, level);
    }
  }
  return { d, pauses: events.filter((e) => e.type === 'pause'), events };
}

test('3 s speech then 10 s silence gives exactly one outcome', () => {
  const { pauses } = run([
    [2000, QUIET],
    [3000, TALK],
    [10000, QUIET],
  ]);
  assert.equal(pauses.length, 1);
  // ~700 ms after the speech stopped at t=5000
  assert.ok(pauses[0].at >= 5700 && pauses[0].at < 5800, `at ${pauses[0].at}`);
});

test('a second outcome needs fresh speech of at least 2 s', () => {
  const { pauses } = run([
    [2000, QUIET],
    [3000, TALK],
    [5000, QUIET], // outcome 1
    [1200, TALK], // too short
    [5000, QUIET], // nothing
    [2600, TALK], // long enough
    [5000, QUIET], // outcome 2
  ]);
  assert.equal(pauses.length, 2);
});

test('short gaps between words do not count as pauses', () => {
  /** @type {[number, number][]} */
  const script = [[2000, QUIET]];
  for (let i = 0; i < 10; i++) script.push([600, TALK], [300, QUIET]);
  script.push([5000, QUIET]);
  const { pauses } = run(script);
  assert.equal(pauses.length, 1);
});

test('cooldown: no outcome within 4 s of the previous one', () => {
  const { pauses } = run([
    [2000, QUIET],
    [2500, TALK],
    [800, QUIET], // outcome at ~5200
    [2200, TALK],
    [5000, QUIET], // pause at ~8900: only 3.7 s after → none
  ]);
  assert.equal(pauses.length, 1);
});

test('echo guard: crowd noise during the guard is ignored', () => {
  const { pauses, events } = run(
    [
      [2000, QUIET],
      [3000, TALK],
      [1000, QUIET], // outcome at ~5700, then the crowd laughs
      [3000, CROWD], // loud laugh: would look like speech without the guard
      [5000, QUIET],
    ],
    72,
    (d, t) => {
      if (t >= 5700 && t < 5720) d.setGuard(9500); // laugh lasts to 9000, plus 500 ms
    },
  );
  assert.equal(pauses.length, 1);
  const speaking = events.filter((e) => e.type === 'speech' && e.state === 'speaking');
  assert.equal(speaking.length, 1, 'the laugh never counted as speech');
});

test('a reaction mid-sentence does not cut the segment short', () => {
  const { pauses } = run(
    [
      [2000, QUIET],
      [6000, TALK], // manual laugh at 4000 while talking; guard until 6500
      [5000, QUIET],
    ],
    72,
    (d, t) => {
      if (t >= 4000 && t < 4020) {
        d.noteReaction(4000);
        d.setGuard(6500);
      }
    },
  );
  // Speech ends at 8000; pause at ~8700, and 4.7 s after the manual reaction → counts.
  assert.equal(pauses.length, 1);
  assert.ok(pauses[0].at > 8000);
});

test('a noisy room is learnt as background, not speech', () => {
  const { pauses, events } = run([
    [3000, -45],
    [20000, -44],
  ]);
  assert.equal(pauses.length, 0);
  assert.equal(events.filter((e) => e.type === 'speech').length, 0);
});

test('sample rate does not change the outcome (30 / 72 / 90 Hz)', () => {
  /** @type {[number, number][]} */
  const script = [
    [2000, QUIET],
    [3000, TALK],
    [6000, QUIET],
    [2500, TALK],
    [6000, QUIET],
  ];
  const times = [30, 72, 90].map((hz) => run(script, hz).pauses.map((p) => p.at));
  for (const t of times) assert.equal(t.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(times[0][i] - times[1][i]) <= 40);
    assert.ok(Math.abs(times[2][i] - times[1][i]) <= 40);
  }
});
