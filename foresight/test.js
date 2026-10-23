'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./engine.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('parseNumbers reads mixed separators', () => {
  assert.deepEqual(F.parseNumbers('1, 2.5\n-3  4e2'), [1, 2.5, -3, 400]);
});

test('compile: precedence and functions', () => {
  const ev = (s, v = {}) => F.compile(s, Object.keys(v))(v);
  assert.equal(ev('2 + 3 * 4'), 14);
  assert.equal(ev('-2 ^ 2'), -4);
  assert.equal(ev('2 ^ 3 ^ 2'), 512);
  assert.equal(ev('2 ** 3'), 8);
  assert.equal(ev('min(3, 4) + max(1, 2, 9)'), 12);
  assert.equal(ev('x > 2 ? x * 10 : 0', { x: 3 }), 30);
  assert.equal(ev('10 % 4'), 2);
  close(ev('pi'), Math.PI);
});

test('compile: rejects anything that is not arithmetic', () => {
  for (const bad of ['process.exit()', 'constructor', 'this', 'a.b', 'a[0]', '(function(){})()', 'alert(1)', '1 +', 'x y', '`1`', '']) {
    assert.throws(() => F.compile(bad, ['a', 'x']), undefined, bad);
  }
  assert.throws(() => F.compile('1'.repeat(501)));
  assert.throws(() => F.compile('toString + 1', ['x']));
  assert.throws(() => F.compile('__proto__', ['x']));
});

test('forecast: linear series is extended exactly', () => {
  const r = F.forecast([1, 2, 3, 4, 5, 6, 7, 8], { h: 3, method: 'linear' });
  r.mean.forEach((m, i) => close(m, 9 + i));
  r.mean.forEach((m, i) => close(r.hi[i] - r.lo[i], 0, 1e-6));
});

test('forecast: doubling series is exponential, and auto finds it', () => {
  const y = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
  const r = F.forecast(y, { h: 2, method: 'exp' });
  close(r.mean[0], 1024, 1e-3);
  assert.equal(F.forecast(y, { h: 2 }).used, 'exp');
});

test('forecast: exp falls back when values are not positive; short input throws', () => {
  const r = F.forecast([-1, 0, 1, 2, 3], { method: 'exp' });
  assert.equal(r.used, 'linear'); assert.ok(r.note);
  assert.throws(() => F.forecast([1, 2, 3]));
});

test('forecast: range widens with distance', () => {
  const r = F.forecast([5, 7, 6, 9, 8, 11, 10, 13, 12, 15], { h: 10, method: 'linear' });
  assert.ok(r.hi[9] - r.lo[9] > r.hi[0] - r.lo[0]);
});

test('crossing: finds the step a rising series hits a target', () => {
  const y = [1, 2, 3, 4, 5, 6, 7, 8], r = F.forecast(y, { h: 6, method: 'linear' });
  assert.equal(F.crossing(y, r, 11).central, 3);
  assert.equal(F.crossing(y, r, 1000).central, null);
});

test('simulate: same seed gives the same answer; mean matches the triangular mean', () => {
  const cfg = { inputs: [{ name: 'x', min: 0, mode: 5, max: 10 }], formula: 'x', trials: 50000, seed: 7 };
  const a = F.simulate(cfg), b = F.simulate(cfg);
  assert.equal(a.mean, b.mean);
  close(a.mean, 5, .06);
  close(F.simulate({ ...cfg, formula: 'x', threshold: 5 }).pAbove, .5, .01);
});

test('simulate: sensitivity ranks the driver and reports bad input as an error', () => {
  const r = F.simulate({ inputs: [{ name: 'big', min: 0, mode: 50, max: 100 }, { name: 'small', min: 0, mode: 1, max: 2 }], formula: 'big + small', trials: 20000, seed: 3 });
  assert.equal(r.sens[0].name, 'big');
  assert.ok(F.simulate({ inputs: [{ name: 'x', min: 3, mode: 2, max: 1 }], formula: 'x' }).error);
  assert.ok(F.simulate({ inputs: [{ name: 'x', min: 0, mode: 1, max: 2 }], formula: 'x +' }).error);
  assert.ok(F.simulate({ inputs: [{ name: 'x', min: 0, mode: 1, max: 2 }], formula: 'process.exit()' }).error);
});

test('bayes: textbook screening example', () => {
  const s = F.bayes(1, [{ ph: 90, pn: 9, seen: true }]);
  close(s[1].post, (0.01 * 0.9) / (0.01 * 0.9 + 0.99 * 0.09), 1e-9);
  const absent = F.bayes(50, [{ ph: 80, pn: 20, seen: false }]);
  close(absent[1].post, 0.2 / (0.2 + 0.8), 1e-9);
});

test('decide: expected value, rescaling and ranking', () => {
  const r = F.decide([
    { name: 'safe', outcomes: [{ p: 100, v: 10 }] },
    { name: 'bet', outcomes: [{ p: 50, v: 100 }, { p: 50, v: -60 }] },
    { name: 'empty', outcomes: [] }
  ], 0);
  assert.equal(r.length, 2);
  assert.equal(r[0].name, 'bet'); close(r[0].ev, 20);
  assert.equal(F.decide([{ name: 'bet', outcomes: [{ p: 1, v: 100 }, { p: 1, v: -60 }] }], 0)[0].rescaled, true);
  assert.equal(F.decide([{ name: 'safe', outcomes: [{ p: 100, v: 10 }] }, { name: 'bet', outcomes: [{ p: 50, v: 100 }, { p: 50, v: -60 }] }], 2)[0].name, 'safe');
});

test('growth and cagr', () => {
  const g = F.growth({ start: 100, rate: 10, periods: 2, add: 0, target: 121 });
  close(g.end, 121); assert.equal(g.reach, 2); close(g.doubling, Math.log(2) / Math.log(1.1));
  assert.equal(F.growth({ start: 100, rate: 0, periods: 5, add: 0, target: 200 }).reach, 'never');
  close(F.cagr(100, 400, 2), 1);
  assert.equal(F.cagr(0, 5, 2), null);
});

test('score: Brier and calibration buckets', () => {
  const s = F.score([{ p: .9, outcome: true }, { p: .9, outcome: false }, { p: .2, outcome: false }, { p: .5, outcome: null }]);
  assert.equal(s.n, 3);
  close(s.brier, (0.01 + 0.81 + 0.04) / 3);
  assert.equal(s.buckets[9].n, 2); close(s.buckets[9].o, 1);
  assert.equal(F.score([]).brier, null);
});
