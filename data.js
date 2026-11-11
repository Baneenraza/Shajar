// Demo data for Karachi / Sindh. `sat`, `passes` and `treeCoverFraction` come from gee/export_data.js run in
// Earth Engine on 2026-11-11 (project shajar-514406), rounded to 3 significant figures. Coordinates are approximate.
// Farmers, acres, water distance and flood risk are invented for the demo:
// the NDVI is real for those coordinates, but no trees have been planted there yet.
window.DATA = {
  satSource: 'earth-engine',
  latestImagery: '2026-11-10',
  sites: [
    // Real facilities: emissions and confidence from the Climate TRACE API (v6, CO2e 100-yr), fetched 2026-11-11.
    // amount = 2025 estimate, tracePrev = 2024 estimate (used by the C12 claim cross-check).
    { id: 'gulahmed', name: 'Gul Ahmed Power Project, Korangi', lat: 24.85, lon: 67.1467, fuel: 'reported_t', amount: 294460,
      traceConfidence: 'medium', traceId: 25450993, tracePrev: 295150,
      sat: { inPakistan: 1, no2Site: 5.86e-5, no2Background: 3.05e-5, builtUpFraction: 0.601, waterFraction: 0.000963 } },
    { id: 'nrl', name: 'National Refinery Limited, Korangi', lat: 24.846, lon: 67.1242, fuel: 'reported_t', amount: 225597,
      traceConfidence: 'very low', traceId: 1753720, tracePrev: 226268,
      sat: { inPakistan: 1, no2Site: 5.56e-5, no2Background: 3.02e-5, builtUpFraction: 0.764, waterFraction: 0.000846 } },
    { id: 'agha', name: 'Agha Steel Industries, Port Qasim', lat: 24.8419, lon: 67.3113, fuel: 'reported_t', amount: 120521,
      traceConfidence: 'low', traceId: 1567000, tracePrev: 119722,
      sat: { inPakistan: 1, no2Site: 6.17e-5, no2Background: 3.27e-5, builtUpFraction: 0.393, waterFraction: 0.000117 } },
    { id: 'sea', name: 'Test case: Point off the Karachi coast', lat: 24.6, lon: 66.6, fuel: 'coal_t', amount: 5000,
      sat: { inPakistan: 0, no2Site: 1.55e-5, no2Background: 1.65e-5, builtUpFraction: 0, waterFraction: 1 } },
    { id: 'jsm', name: 'Test case: Point in Jaisalmer, India', lat: 26.92, lon: 70.91, fuel: 'coal_t', amount: 5000,
      sat: { inPakistan: 0, no2Site: 2.05e-5, no2Background: 1.99e-5, builtUpFraction: 0.556, waterFraction: 0.0012 } },
    { id: 'thr', name: 'Test case: Empty Thar desert', lat: 26.0, lon: 69.5, fuel: 'coal_t', amount: 5000,
      sat: { inPakistan: 1, no2Site: 2.54e-5, no2Background: 2.45e-5, builtUpFraction: 0, waterFraction: 0 } },
  ],
  plots: [
    // Running contracts. m1 and m2 sit on real tree cover found in Earth Engine (WorldCover 83% and 100% trees),
    // standing in for plots planted under a contract signed in 2025.
    { id: 'm1', farmer: 'Noor Ahmed Baloch', village: 'Malir, Karachi', lat: 24.9291, lon: 67.2309,
      acres: 3, treesPlanned: 1200, canalKm: 1.0, floodRisk: 0.1, treeCoverFraction: 0.828, financier: 'bank',
      contract: { since: '2025-08', trees: 1200, siteId: 'gulahmed' },
      passes: [
        { date: '2026-02-10', ndvi: 0.43, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.405, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.486, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.49, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 'm2', farmer: 'Zubaida Khatoon', village: 'Mirpur Khas', lat: 25.4796, lon: 69.1744,
      acres: 3, treesPlanned: 1000, canalKm: 0.3, floodRisk: 0.2, treeCoverFraction: 1, financier: 'investor',
      contract: { since: '2025-06', trees: 1000, siteId: 'gulahmed' },
      passes: [
        { date: '2026-02-10', ndvi: 0.666, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.632, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.741, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.633, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 's1', farmer: 'Allah Dino Khoso', village: 'Memon Goth, Malir, Karachi', lat: 24.97, lon: 67.3,
      acres: 25, treesPlanned: 12500, canalKm: 1.0, floodRisk: 0.15, treeCoverFraction: 0,
      passes: [
        { date: '2026-02-10', ndvi: 0.186, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.143, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.0889, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.104, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 's2', farmer: 'Sakina Bhatti', village: 'Gharo, Thatta', lat: 24.74, lon: 67.6,
      acres: 32, treesPlanned: 16000, canalKm: 2.0, floodRisk: 0.3, treeCoverFraction: 0.00625,
      passes: [
        { date: '2026-02-10', ndvi: 0.233, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.173, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.142, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.151, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 's3', farmer: 'Hakim Ali Soomro', village: 'Kotri, Jamshoro', lat: 25.38, lon: 68.3,
      acres: 22, treesPlanned: 8000, canalKm: 0.5, floodRisk: 0.6, treeCoverFraction: 0.0082, financier: 'investor',
      // Claimed as planted in 2025; real NDVI here is green in February and bare after, so payments are held.
      contract: { since: '2025-11', trees: 8000, siteId: 'gulahmed' },
      passes: [
        { date: '2026-02-10', ndvi: 0.592, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.203, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.308, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.29, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 's4', farmer: 'Rafiq Chandio', village: 'Tando Allahyar', lat: 25.46, lon: 68.72,
      acres: 2, treesPlanned: 5000, canalKm: 0.8, floodRisk: 0.2, treeCoverFraction: 0,
      passes: [
        { date: '2026-02-10', ndvi: 0.0603, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.0395, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.0246, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.0414, cloud: 0 },
        { date: '2027-02-10' },
      ] },
  ],
  // Marketplace starting state (made up for the demo). New offers and requests typed on the page live only until reload.
  offers: [
    { id: 'o1', siteId: 'gulahmed', plotId: 's1' },
    { id: 'o2', siteId: 'gulahmed', plotId: 's2' },
    { id: 'o3', siteId: 'gulahmed', plotId: 's4' },
    { id: 'o4', siteId: 'nrl', plotId: 's1' },
  ],
  fundingRequests: [
    { id: 'f1', plotId: 's2', wants: 'bank' },
    { id: 'f2', plotId: 's1', wants: 'investor' },
  ],
};

// C12: example claims written for the demo (the declared side). The sources they are checked against are real.
window.DATA.claims = [
  { id: 'c1', siteId: 'gulahmed', declaredTonnes: 150000,
    statement: 'Our captive power plant emitted about 150,000 tonnes of CO2 last year, and we cut emissions by 30% compared to 2024.' },
  { id: 'c2', siteId: 'agha', declaredTonnes: 118000,
    statement: 'Emissions rose slightly, about 1%, as steel output grew.' },
  { id: 'c3', siteId: 'nrl',
    statement: 'The refinery is now carbon neutral and burns no fuel on site.' },
  { id: 'c4', plotId: 's3', statement: 'I planted 8,000 trees in November 2025 and they are all healthy.' },
  { id: 'c5', plotId: 'm1', statement: '1,200 trees planted in 2025, all alive and green.' },
  { id: 'c6', plotId: 's2', statement: 'My 32 acres are bare, there are no trees on the land yet.' },
  { id: 'c7', plotId: 'm2', statement: 'My land is empty and has no trees, ready for new planting.' },
];
