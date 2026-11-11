// C07: is a year of satellite photos (random forest) better than one greenness threshold at spotting trees?
// Run in the Earth Engine Code Editor. Prints one JSON block of raw values; c07/score.js turns it into scores.
// Answer key: ESA WorldCover 2021 (tree cover = class 10). Mangroves (95) and water (80) are left out,
// because the app is about trees on farmland. Photos: Sentinel-2, same year as the answer key.
// Seeds are fixed, so a rerun gives the same points.

var region = ee.Geometry.Rectangle([66.8, 24.0, 69.5, 26.0]); // lower Sindh: Karachi, Thatta, Hyderabad, Mirpur Khas
var start = ee.Date.fromYMD(2021, 1, 1);

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(region).filterDate(start, start.advance(1, 'year'))
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

// Random points, then balance: trees are rare in Sindh, so take up to n of each class.
function balanced(seed, n) {
  var pts = label.sampleRegions({ collection: ee.FeatureCollection.randomPoints(region, 25000, seed), scale: 10, geometries: true });
  var pick = pts.filter(ee.Filter.eq('label', 1)).limit(n).merge(pts.filter(ee.Filter.eq('label', 0)).limit(n));
  return features.sampleRegions({ collection: pick, properties: ['label'], scale: 10, geometries: true, tileScale: 4 })
    .filter(ee.Filter.notNull(RF_FEATURES.concat(BASE)));
}

var data = balanced(7, 1200).randomColumn('r', 11);
var train = data.filter(ee.Filter.lt('r', 0.7));
var test = data.filter(ee.Filter.gte('r', 0.7));
var rf = ee.Classifier.smileRandomForest(100).train(train, 'label', RF_FEATURES);

function rows(fc, extra) {
  var cols = ['label'].concat(extra).concat(BASE);
  return fc.toList(5000).map(function (f) {
    f = ee.Feature(f);
    return cols.map(function (c) { return f.get(c); });
  });
}
var hand = balanced(99, 100).classify(rf, 'rf').map(function (f) {
  var c = f.geometry().coordinates();
  return f.set({ lon: c.get(0), lat: c.get(1) });
});

ee.Dictionary({
  columns: { train: ['label'].concat(BASE), test: ['label', 'rf'].concat(BASE), hand: ['label', 'rf', 'lon', 'lat'].concat(BASE) },
  train: rows(train, []),
  test: rows(test.classify(rf, 'rf'), ['rf']),
  hand: rows(hand, ['rf', 'lon', 'lat']),
}).evaluate(function (r, err) { print(err ? 'Error: ' + err : 'C07 ' + JSON.stringify(r)); });
