// C07 quick run: same model and test as c07_benchmark.js, small enough to print its result in the Code Editor
// in a minute or two (no export task). Copy everything printed between the two marker lines into c07/c07_points.csv,
// then run node c07/score.js.
// Answer key: ESA WorldCover 2021 (tree cover = class 10). Mangroves (95) and water (80) are left out,
// because the app is about trees on farmland. Photos: Sentinel-2, same year as the answer key.
// Seeds are fixed, so a rerun gives the same points.

var region = ee.Geometry.Rectangle([68.75, 25.4, 68.95, 25.55]); // ~20 km around Tando Allahyar: mango orchards give tree points
var start = ee.Date.fromYMD(2021, 1, 1);

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(region).filterDate(start, start.advance(1, 'year'))
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)) // skip mostly-cloudy photos; per-pixel mask below handles the rest
  .map(function (i) {
    var scl = i.select('SCL'); // scene classification: drop shadow (3), cloud (8, 9, 10) and snow (11)
    var clear = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
    return i.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']).divide(10000)
      .addBands(i.normalizedDifference(['B8', 'B4']).rename('ndvi'))
      .addBands(i.normalizedDifference(['B8', 'B11']).rename('ndmi'))
      .updateMask(clear).copyProperties(i, ['system:time_start']);
  });

var ndvi = s2.select('ndvi');
function quarter(q) { return ndvi.filterDate(start.advance(3 * q, 'month'), start.advance(3 * q + 3, 'month')).median().rename('q' + (q + 1)); }
var features = ndvi.reduce(ee.Reducer.percentile([10, 25, 50, 75, 90]))
  .addBands(ndvi.reduce(ee.Reducer.stdDev()))
  .addBands(ndvi.mean().rename('mean'))
  .addBands(s2.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'ndmi']).median())
  .addBands(quarter(0)).addBands(quarter(1)).addBands(quarter(2)).addBands(quarter(3));

var wc = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map');
var label = wc.eq(10).rename('label').updateMask(wc.neq(80).and(wc.neq(95)));

var RF_FEATURES = ['ndvi_p10', 'ndvi_p25', 'ndvi_p50', 'ndvi_p75', 'ndvi_p90', 'ndvi_stdDev', 'mean',
  'B2', 'B3', 'B4', 'B8', 'B11', 'B12', 'ndmi'];
var BASE = ['q1', 'q2', 'q3', 'q4', 'mean'];


// Random points, then balance: take up to n of each class (small n so the Code Editor can finish).
function balanced(seed, n) {
  var pts = label.sampleRegions({ collection: ee.FeatureCollection.randomPoints(region, 4000, seed), scale: 10, geometries: true });
  var pick = pts.filter(ee.Filter.eq('label', 1)).limit(n).merge(pts.filter(ee.Filter.eq('label', 0)).limit(n));
  return features.sampleRegions({ collection: pick, properties: ['label'], scale: 10, geometries: true, tileScale: 4 })
    .filter(ee.Filter.notNull(RF_FEATURES.concat(BASE)));
}

var data = balanced(7, 60).randomColumn('r', 11);
var train = data.filter(ee.Filter.lt('r', 0.7));
var test = data.filter(ee.Filter.gte('r', 0.7));
var rf = ee.Classifier.smileRandomForest({ numberOfTrees: 50, seed: 1 }).train(train, 'label', RF_FEATURES);

function tag(fc, split) { return fc.classify(rf, 'rf').map(function (f) { return f.set('split', split); }); }
var cols = ['split', 'label', 'rf'].concat(BASE);
var rows = tag(train, 'train').merge(tag(test, 'test')).toList(500).map(function (f) {
  f = ee.Feature(f);
  return ee.List(cols.map(function (c) { return ee.String(f.get(c)); })).join(',');
});
rows.evaluate(function (list, err) {
  if (err) { print('Error: ' + err); return; }
  print('----- copy from the next line -----\n' + cols.join(',') + '\n' + list.join('\n') + '\n----- copy up to the line above -----');
});
