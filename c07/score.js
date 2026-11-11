// C07 scoring: turns the Earth Engine output (c07/gee_output.json) and the hand labels (c07/hand_labels.json)
// into c07/results.js for the page. Run: node c07/score.js
const fs = require('fs');
const path = require('path');

const f1 = (c) => (2 * c.tp + c.fp + c.fn ? (2 * c.tp) / (2 * c.tp + c.fp + c.fn) : 0);

// sweep rows: [threshold, trainTP, trainFP, trainFN, testTP, testFP, testFN]
const at = (row, i) => ({ tp: row[i], fp: row[i + 1], fn: row[i + 2] });
function tuned(rows) {
  // Fair baseline: pick the threshold that works best on the training points, then score it on the test points.
  const best = rows.reduce((a, r) => (f1(at(r, 1)) > f1(at(a, 1)) ? r : a));
  return { threshold: best[0], f1: f1(at(best, 4)) };
}
function fixed(rows, t) {
  const row = rows.reduce((a, r) => (Math.abs(r[0] - t) < Math.abs(a[0] - t) ? r : a));
  return { threshold: row[0], f1: f1(at(row, 4)) };
}

function countsFrom(truth, pred) {
  const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
  truth.forEach((y, i) => { const p = pred[i]; if (y && p) c.tp++; else if (!y && p) c.fp++; else if (y && !p) c.fn++; else c.tn++; });
  return c;
}

// Raw Earth Engine rows -> counts. train: [label, q1..q4, mean]; test: [label, rf, q1..q4, mean].
const BASE = ['q1', 'q2', 'q3', 'q4', 'mean'];
function fromRows(raw) {
  const yes = (rows, col, t) => {
    const c = { tp: 0, fp: 0, fn: 0 };
    for (const r of rows) { const p = r[col] >= t; if (r[0] && p) c.tp++; else if (!r[0] && p) c.fp++; else if (r[0]) c.fn++; }
    return [c.tp, c.fp, c.fn];
  };
  const sweep = {};
  BASE.forEach((b, k) => {
    sweep[b] = [];
    for (let i = 0; i <= 24; i++) {
      const t = Math.round((0.1 + i * 0.025) * 1000) / 1000;
      sweep[b].push([t, ...yes(raw.train, 1 + k, t), ...yes(raw.test, 2 + k, t)]);
    }
  });
  const trees = (rows) => rows.filter((r) => r[0] === 1).length;
  return {
    sizes: { train: raw.train.length, test: raw.test.length, trainTrees: trees(raw.train), testTrees: trees(raw.test) },
    rfTest: countsFrom(raw.test.map((r) => r[0]), raw.test.map((r) => r[1] === 1)),
    sweep,
    hand: raw.hand,
  };
}

// The Drive CSV (columns split, lon, lat, label, rf, q1..q4, mean, in any order) -> the raw rows fromRows takes.
function fromCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  const raw = { train: [], test: [], hand: [] };
  for (const line of lines) {
    const v = line.split(',');
    const get = (c) => Number(v[cols.indexOf(c)]);
    const split = v[cols.indexOf('split')];
    const base = BASE.map(get);
    if (split === 'train') raw.train.push([get('label'), ...base]);
    else if (split === 'test') raw.test.push([get('label'), get('rf'), ...base]);
    else if (split === 'hand') raw.hand.push([get('lon'), get('lat'), get('label'), get('rf'), ...base]);
  }
  return raw;
}

function score(gee, handLabels) {
  const quarters = ['q1', 'q2', 'q3', 'q4'];
  const perQuarter = quarters.map((q) => ({ quarter: q, ...tuned(gee.sweep[q]) }));
  const single = perQuarter.reduce((a, q) => a + q.f1, 0) / perQuarter.length;
  const singleFixed = quarters.reduce((a, q) => a + fixed(gee.sweep[q], 0.35).f1, 0) / quarters.length;
  const mean = tuned(gee.sweep.mean);
  const rf = f1(gee.rfTest);
  const gain = (base) => ((rf - base) / base) * 100;

  const out = {
    answerKey: 'ESA WorldCover 2021, tree cover',
    sizes: gee.sizes,
    test: {
      randomForest: rf,
      singlePhotoFixed: singleFixed,
      singlePhotoTuned: single,
      perQuarter,
      yearlyAverage: mean,
      gainOverSinglePhotoPct: gain(single),
      gainOverYearlyAveragePct: gain(mean.f1),
    },
  };

  // Hand check: only points that have a label (1 tree, 0 no tree); unclear points are left out.
  const rows = gee.hand.map((r, i) => ({ r, y: handLabels[i] })).filter((x) => x.y === 0 || x.y === 1);
  if (rows.length) {
    const truth = rows.map((x) => x.y);
    const col = (k) => rows.map((x) => x.r[k]);
    // hand rows: [lon, lat, worldCover, rf, q1, q2, q3, q4, mean]
    const handSingle = perQuarter.map((q, k) => f1(countsFrom(truth, col(4 + k).map((v) => v >= q.threshold))));
    const h = {
      labelled: rows.length,
      randomForest: f1(countsFrom(truth, col(3).map((v) => v === 1))),
      singlePhotoTuned: handSingle.reduce((a, b) => a + b, 0) / handSingle.length,
      yearlyAverage: f1(countsFrom(truth, col(8).map((v) => v >= mean.threshold))),
      worldCoverAgreement: col(2).filter((v, i) => v === truth[i]).length / rows.length,
    };
    h.gainOverSinglePhotoPct = ((h.randomForest - h.singlePhotoTuned) / h.singlePhotoTuned) * 100;
    h.gainOverYearlyAveragePct = ((h.randomForest - h.yearlyAverage) / h.yearlyAverage) * 100;
    out.hand = h;
  }
  return out;
}

module.exports = { f1, tuned, fixed, countsFrom, fromRows, fromCsv, score };

if (require.main === module) {
  const dir = __dirname;
  const gee = fromRows(fromCsv(fs.readFileSync(path.join(dir, 'c07_points.csv'), 'utf8')));
  const labelsFile = path.join(dir, 'hand_labels.json');
  const labels = fs.existsSync(labelsFile) ? JSON.parse(fs.readFileSync(labelsFile, 'utf8')).labels : [];
  const result = score(gee, labels);
  fs.writeFileSync(path.join(dir, 'results.js'), '// Generated by c07/score.js. Do not edit by hand.\nwindow.C07 = ' + JSON.stringify(result, null, 1) + ';\n');
  fs.writeFileSync(path.join(dir, 'hand_points.js'), '// Generated by c07/score.js: points for c07/label.html (no answers included).\nwindow.HAND_POINTS = ' + JSON.stringify(gee.hand.map((r) => [r[0], r[1]])) + ';\n');
  console.log(JSON.stringify(result, null, 1));
}
