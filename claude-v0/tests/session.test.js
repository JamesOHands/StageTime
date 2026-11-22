// @ts-check
// D4: ready → running → finished; stopping works from any state. Run: node --test claude-v0/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, formatClock } from '../src/session.js';
import { Rng, createStream, parseSeed } from '../src/rng.js';

test('ready → running → finished, then start again', () => {
  /** @type {any[]} */
  const log = [];
  const s = new Session({ durationMs: 60000, emit: (e) => log.push(e) });
  assert.equal(s.state, 'ready');
  assert.equal(s.remaining(0), 60000);
  s.start(1000);
  s.update(30000);
  assert.equal(s.state, 'running');
  assert.equal(formatClock(s.remaining(30000)), '0:31');
  s.update(61000);
  assert.equal(s.state, 'finished');
  assert.equal(log.at(-1).at, 61000);
  assert.equal(s.remaining(70000), 0);
  s.toggle(80000);
  assert.equal(s.state, 'running');
  assert.equal(s.count, 2);
});

test('stop works from running and finished; not from ready', () => {
  const s = new Session({ durationMs: 60000, emit: () => {} });
  assert.equal(s.stop(0), false);
  s.start(0);
  assert.equal(s.stop(5000), true);
  assert.equal(s.state, 'ready');
  s.start(6000);
  s.update(70000);
  assert.equal(s.state, 'finished');
  assert.equal(s.stop(71000), true);
  assert.equal(s.state, 'ready');
});

test('clock formatting', () => {
  assert.equal(formatClock(300000), '5:00');
  assert.equal(formatClock(59001), '1:00');
  assert.equal(formatClock(0), '0:00');
});

test('named streams are independent and repeatable', () => {
  const a1 = createStream(9, 'appearance');
  const b1 = createStream(9, 'reactions');
  const first = [b1.next(), b1.next()];
  for (let i = 0; i < 100; i++) a1.next(); // drawing lots from one stream…
  const b2 = createStream(9, 'reactions');
  assert.deepEqual([b2.next(), b2.next()], first); // …doesn't shift another
  assert.notEqual(createStream(9, 'x').next(), createStream(10, 'x').next());
});

test('seed parsing', () => {
  assert.equal(parseSeed('1234'), 1234);
  assert.equal(parseSeed('hello'), parseSeed('hello'));
  const r = parseSeed('');
  assert.ok(r >= 1 && r <= 1000000);
  const rng = new Rng(1);
  for (let i = 0; i < 1000; i++) {
    const v = rng.int(2, 4);
    assert.ok(v >= 2 && v <= 4);
  }
});
