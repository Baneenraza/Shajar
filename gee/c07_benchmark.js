// C07: is a year of satellite photos (random forest) better than one greenness threshold at spotting trees?
// Run in the Earth Engine Code Editor, then start the "c07_points" task in the Tasks tab. It saves c07_points.csv
// to Google Drive (export tasks have no 5-minute limit). Save that file as c07/c07_points.csv and run node c07/score.js.
// Answer key: ESA WorldCover 2021 (tree cover = class 10). Mangroves (95) and water (80) are left out,
// because the app is about trees on farmland. Photos: Sentinel-2, same year as the answer key.
// Seeds are fixed, so a rerun gives the same points.

var region = ee.Geometry.Rectangle([68.6, 25.3, 68.95, 25.6]); // ~35 km around Tando Allahyar and Mirpur Khas: mango orchards give enough tree points
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

// Random points, then balance: trees are rare in Sindh, so take up to n of each class.
function balanced(seed, n) {
  var pts = label.sampleRegions({ collection: ee.FeatureCollection.randomPoints(region, 8000, seed), scale: 10, geometries: true });
  var pick = pts.filter(ee.Filter.eq('label', 1)).limit(n).merge(pts.filter(ee.Filter.eq('label', 0)).limit(n));
  return features.sampleRegions({ collection: pick, properties: ['label'], scale: 10, geometries: true, tileScale: 4 })
    .filter(ee.Filter.notNull(RF_FEATURES.concat(BASE)));
}

var data = balanced(7, 150).randomColumn('r', 11);
var train = data.filter(ee.Filter.lt('r', 0.7));
var test = data.filter(ee.Filter.gte('r', 0.7));
var rf = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 1 }).train(train, 'label', RF_FEATURES);

// One table: every point with its split, the model's answer and the rule inputs. The model's answer on
// training points is not scored (it has seen them); only test and hand points are.
function tag(fc, split) {
  return fc.classify(rf, 'rf').map(function (f) {
    var c = f.geometry().coordinates();
    return f.set({ split: split, lon: c.get(0), lat: c.get(1) });
  });
}
var out = tag(train, 'train').merge(tag(test, 'test')).merge(tag(balanced(99, 40), 'hand'));

Export.table.toDrive({
  collection: out, description: 'c07_points', fileNamePrefix: 'c07_points', fileFormat: 'CSV',
  selectors: ['split', 'lon', 'lat', 'label', 'rf'].concat(BASE),
});
print('Start the c07_points task in the Tasks tab.');
