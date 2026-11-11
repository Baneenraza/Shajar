const test = require('node:test');
const assert = require('node:assert');
const { f1, tuned, fixed, countsFrom, fromRows, fromCsv, score } = require('./score.js');

test('fromCsv: splits the Drive export by column name, not position', () => {
  const csv = 'split,lon,lat,label,rf,q1,q2,q3,q4,mean\r\ntrain,68,25,1,1,0.5,0.4,0.3,0.2,0.35\r\ntest,68,25,0,1,0.1,0.1,0.1,0.1,0.1\r\nhand,68.5,25.5,1,0,0.6,0.6,0.6,0.6,0.6\r\n';
  assert.deepStrictEqual(fromCsv(csv), {
    train: [[1, 0.5, 0.4, 0.3, 0.2, 0.35]],
    test: [[0, 1, 0.1, 0.1, 0.1, 0.1, 0.1]],
    hand: [[68.5, 25.5, 1, 0, 0.6, 0.6, 0.6, 0.6, 0.6]],
  });
});

test('fromRows: raw Earth Engine points become sweep and random forest counts', () => {
  const g = fromRows({
    train: [[1, 0.5, 0.5, 0.5, 0.5, 0.5], [0, 0.2, 0.2, 0.2, 0.2, 0.2]],
    test: [[1, 1, 0.5, 0.5, 0.5, 0.5, 0.5], [0, 1, 0.4, 0.4, 0.4, 0.4, 0.4], [1, 0, 0.1, 0.1, 0.1, 0.1, 0.1]],
    hand: [],
  });
  assert.deepStrictEqual(g.rfTest, { tp: 1, fp: 1, fn: 1, tn: 0 });
  assert.deepStrictEqual(g.sizes, { train: 2, test: 3, trainTrees: 1, testTrees: 2 });
  // At 0.35: train 1 TP; test 0.5 is TP, 0.4 is FP, 0.1 is FN.
  assert.deepStrictEqual(g.sweep.q1.find((r) => r[0] === 0.35), [0.35, 1, 0, 0, 1, 1, 1]);
  assert.strictEqual(g.sweep.mean.length, 25);
});

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
