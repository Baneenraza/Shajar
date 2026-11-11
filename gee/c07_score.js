// C07 step 2: run after the exports from gee/c07_benchmark.js have finished.
// Trains the random forest on 70% of the points, scores it and the threshold baselines on the other 30%,
// and prints counts for c07/score.js (save the printed JSON as c07/gee_output.json).

var RF_FEATURES = ['ndvi_p10', 'ndvi_p25', 'ndvi_p50', 'ndvi_p75', 'ndvi_p90', 'ndvi_stdDev', 'mean',
  'B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'ndmi'];
var BASE = ['q1', 'q2', 'q3', 'q4', 'mean'];

var data = ee.FeatureCollection('projects/shajar-514406/assets/c07_samples').randomColumn('r', 11);
var hand = ee.FeatureCollection('projects/shajar-514406/assets/c07_hand');
var train = data.filter(ee.Filter.lt('r', 0.7));
var test = data.filter(ee.Filter.gte('r', 0.7));

var rf = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 1 }).train(train, 'label', RF_FEATURES);
var testRf = test.classify(rf, 'rf');
function cm(fc, y, p) { return fc.filter(ee.Filter.and(ee.Filter.eq('label', y), ee.Filter.eq('rf', p))).size(); }

function counts(fc, prop, t) {
  var yes = ee.Filter.gte(prop, t), no = ee.Filter.lt(prop, t);
  return [fc.filter(ee.Filter.and(ee.Filter.eq('label', 1), yes)).size(),
          fc.filter(ee.Filter.and(ee.Filter.eq('label', 0), yes)).size(),
          fc.filter(ee.Filter.and(ee.Filter.eq('label', 1), no)).size()];
}
var sweep = {};
BASE.forEach(function (p) {
  sweep[p] = ee.List.sequence(0.1, 0.7, 0.025).map(function (t) {
    return ee.List([t]).cat(counts(train, p, t)).cat(counts(test, p, t));
  });
});

ee.Dictionary({
  sizes: { train: train.size(), test: test.size(), trainTrees: train.filter(ee.Filter.eq('label', 1)).size(), testTrees: test.filter(ee.Filter.eq('label', 1)).size() },
  rfTest: { tp: cm(testRf, 1, 1), fp: cm(testRf, 0, 1), fn: cm(testRf, 1, 0), tn: cm(testRf, 0, 0) },
  importance: rf.explain().get('importance'),
  sweep: sweep,
  hand: hand.classify(rf, 'rf').toList(500).map(function (f) {
    f = ee.Feature(f);
    return ['lon', 'lat', 'label', 'rf', 'q1', 'q2', 'q3', 'q4', 'mean'].map(function (k) { return f.get(k); });
  }),
}).evaluate(function (r, err) { print(err ? 'Error: ' + err : 'C07S ' + JSON.stringify(r)); });
