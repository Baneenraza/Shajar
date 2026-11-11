const test = require('node:test');
const assert = require('node:assert');
const { f1, tuned, fixed, countsFrom, score } = require('./score.js');

test('f1 from counts', () => {
  assert.strictEqual(f1({ tp: 8, fp: 2, fn: 2 }), 0.8);
  assert.strictEqual(f1({ tp: 0, fp: 0, fn: 0 }), 0);
});

test('baseline threshold is chosen on training counts, scored on test counts', () => {
  const rows = [[0.2, 10, 10, 0, 5, 9, 0], [0.4, 9, 1, 1, 1, 0, 9]];
  assert.deepStrictEqual(tuned(rows), { threshold: 0.4, f1: 2 / 11 });
  assert.strictEqual(fixed(rows, 0.35).threshold, 0.4);
});

test('confusion counts from labels and predictions', () => {
  assert.deepStrictEqual(countsFrom([1, 1, 0, 0], [true, false, true, false]), { tp: 1, fp: 1, fn: 1, tn: 1 });
});

test('score: gain is relative to the baseline, unlabelled hand points are skipped', () => {
  const sweep = [[0.35, 5, 5, 5, 5, 5, 5]];
  const gee = { sizes: {}, rfTest: { tp: 9, fp: 1, fn: 1 }, sweep: { q1: sweep, q2: sweep, q3: sweep, q4: sweep, mean: sweep },
    hand: [[0, 0, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5], [0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1], [0, 0, 1, 1, 0.9, 0.9, 0.9, 0.9, 0.9]] };
  const r = score(gee, [1, 0, null]);
  assert.ok(Math.abs(r.test.randomForest - 0.9) < 1e-9);
  assert.ok(Math.abs(r.test.singlePhotoTuned - 0.5) < 1e-9);
  assert.ok(Math.abs(r.test.gainOverSinglePhotoPct - 80) < 1e-9);
  assert.strictEqual(r.hand.labelled, 2);
  assert.strictEqual(r.hand.randomForest, 1);
});
