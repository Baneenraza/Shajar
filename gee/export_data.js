// Run in the Earth Engine Code Editor (https://code.earthengine.google.com), signed in with your team's account.
// It prints one JSON block. Copy each site's `sat` and each plot's `passes` / `treeCoverFraction` into data.js,
// set satSource to 'earth-engine' and latestImagery to the printed date.
// Dataset IDs are from memory: confirm each in the catalog (developers.google.com/earth-engine/datasets).

var sites = [
  { id: 'gulahmed', lat: 24.85, lon: 67.1467 }, { id: 'nrl', lat: 24.846, lon: 67.1242 }, { id: 'agha', lat: 24.8419, lon: 67.3113 },
  { id: 'sea', lat: 24.6, lon: 66.6 }, { id: 'jsm', lat: 26.92, lon: 70.91 }, { id: 'thr', lat: 26.0, lon: 69.5 },
];
var plots = [
  { id: 'm1', lat: 24.9291, lon: 67.2309, acres: 3 }, { id: 'm2', lat: 25.4796, lon: 69.1744, acres: 3 },
  { id: 's1', lat: 24.97, lon: 67.3, acres: 10 }, { id: 's2', lat: 24.74, lon: 67.6, acres: 15 },
  { id: 's3', lat: 25.38, lon: 68.3, acres: 20 }, { id: 's4', lat: 25.46, lon: 68.72, acres: 2 },
];
var passDates = ['2026-02-10', '2026-05-12', '2026-08-10', '2026-11-03', '2027-02-10'];

var end = ee.Date(Date.now());
var start = end.advance(-6, 'month');
var NO2_BAND = 'tropospheric_NO2_column_number_density';
var no2 = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2').filterDate(start, end).select(NO2_BAND).mean();
var worldCover = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map');
var pakistan = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017').filter(ee.Filter.eq('country_na', 'Pakistan'));
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
var cloudScore = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');

function share(classValue, geom) { // fraction of the area in one WorldCover class
  return worldCover.eq(classValue).reduceRegion(ee.Reducer.mean(), geom, 10, null, null, false, 1e8).get('Map');
}

function siteSat(s) {
  var pt = ee.Geometry.Point([s.lon, s.lat]);
  var ring = pt.buffer(50000).difference(pt.buffer(20000)); // background around the site
  return ee.Dictionary({
    id: s.id,
    inPakistan: pakistan.filterBounds(pt).size().gt(0),
    no2Site: no2.reduceRegion(ee.Reducer.mean(), pt.buffer(5000), 1113).get(NO2_BAND),
    no2Background: no2.reduceRegion(ee.Reducer.mean(), ring, 1113, null, null, false, 1e9).get(NO2_BAND),
    builtUpFraction: share(50, pt.buffer(1000)),
    waterFraction: share(80, pt.buffer(1000)),
  });
}

function plotGeom(p) { return ee.Geometry.Point([p.lon, p.lat]).buffer(Math.sqrt((p.acres * 4047) / Math.PI)); }

function passSat(geom, date) {
  var d = ee.Date(date);
  var col = s2.filterBounds(geom).filterDate(d.advance(-15, 'day'), d.advance(15, 'day'))
    .linkCollection(cloudScore, ['cs'])
    .map(function (img) {
      var clear = img.select('cs').gte(0.6);
      var cloud = ee.Number(1).subtract(clear.reduceRegion(ee.Reducer.mean(), geom, 10).get('cs'));
      var ndvi = img.normalizedDifference(['B8', 'B4']).updateMask(clear).reduceRegion(ee.Reducer.mean(), geom, 10).get('nd');
      return img.set({ cloud: cloud, ndvi: ndvi });
    })
    .sort('cloud');
  // No image in the window (e.g. a future date) -> only the date, which the app reads as "no image yet".
  return ee.Algorithms.If(col.size().gt(0),
    ee.Dictionary({ date: date, ndvi: col.first().get('ndvi'), cloud: col.first().get('cloud') }),
    ee.Dictionary({ date: date }));
}

var plotsOut = plots.map(function (p) {
  var g = plotGeom(p);
  return ee.Dictionary({ id: p.id, treeCoverFraction: share(10, g), passes: passDates.map(function (dt) { return passSat(g, dt); }) });
});

var allPlots = ee.FeatureCollection(plots.map(function (p) { return ee.Feature(plotGeom(p)); })).geometry();
var latest = ee.Date(s2.filterBounds(allPlots).filterDate(start, end).aggregate_max('system:time_start')).format('YYYY-MM-dd');

ee.Dictionary({ latestImagery: latest, sites: sites.map(siteSat), plots: plotsOut }).evaluate(function (result, err) {
  if (err) print('Error: ' + err);
  else print(JSON.stringify(result, null, 1));
});
