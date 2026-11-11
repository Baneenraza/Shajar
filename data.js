// Demo data for Karachi / Sindh. `sat`, `passes` and `treeCoverFraction` come from gee/export_data.js run in
// Earth Engine on 2026-11-11 (project shajar-514406), rounded to 3 significant figures. Coordinates are approximate.
// Factory names, fuel figures, farmers, acres, water distance and flood risk are invented for the demo:
// the NDVI is real for those coordinates, but no trees have been planted there yet.
window.DATA = {
  satSource: 'earth-engine',
  latestImagery: '2026-11-10',
  sites: [
    { id: 'kia-tex', name: 'Textile mill, Korangi Industrial Area', lat: 24.835, lon: 67.125, fuel: 'gas_mmbtu', amount: 400000,
      sat: { inPakistan: 1, no2Site: 5.22e-5, no2Background: 3.02e-5, builtUpFraction: 0.891, waterFraction: 0 } },
    { id: 'kia-tan', name: 'Tannery cluster, Korangi Sector 7-A', lat: 24.826, lon: 67.15, fuel: 'furnace_oil_t', amount: 2500,
      sat: { inPakistan: 1, no2Site: 5.07e-5, no2Background: 3.06e-5, builtUpFraction: 0.832, waterFraction: 0 } },
    { id: 'lia', name: 'Steel mill, Landhi Industrial Area', lat: 24.855, lon: 67.205, fuel: 'coal_t', amount: 8000,
      sat: { inPakistan: 1, no2Site: 6.36e-5, no2Background: 3.13e-5, builtUpFraction: 0.71, waterFraction: 0.00719 } },
    { id: 'sea', name: 'Test case: point off the Karachi coast', lat: 24.6, lon: 66.6, fuel: 'coal_t', amount: 5000,
      sat: { inPakistan: 0, no2Site: 1.55e-5, no2Background: 1.65e-5, builtUpFraction: 0, waterFraction: 1 } },
    { id: 'jsm', name: 'Test case: point in Jaisalmer, India', lat: 26.92, lon: 70.91, fuel: 'coal_t', amount: 5000,
      sat: { inPakistan: 0, no2Site: 2.05e-5, no2Background: 1.99e-5, builtUpFraction: 0.556, waterFraction: 0.0012 } },
    { id: 'thr', name: 'Test case: empty Thar desert', lat: 26.0, lon: 69.5, fuel: 'coal_t', amount: 5000,
      sat: { inPakistan: 1, no2Site: 2.54e-5, no2Background: 2.45e-5, builtUpFraction: 0, waterFraction: 0 } },
  ],
  plots: [
    // Running contracts. m1 and m2 sit on real tree cover found in Earth Engine (WorldCover 83% and 100% trees),
    // standing in for plots planted under a contract signed in 2025.
    { id: 'm1', farmer: 'Noor Ahmed Baloch', village: 'Malir, Karachi', lat: 24.9291, lon: 67.2309,
      acres: 3, treesPlanned: 1200, canalKm: 1.0, floodRisk: 0.1, treeCoverFraction: 0.828, financier: 'bank',
      contract: { since: '2025-08', trees: 1200 },
      passes: [
        { date: '2026-02-10', ndvi: 0.43, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.405, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.486, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.49, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 'm2', farmer: 'Zubaida Khatoon', village: 'Mirpur Khas', lat: 25.4796, lon: 69.1744,
      acres: 3, treesPlanned: 1000, canalKm: 0.3, floodRisk: 0.2, treeCoverFraction: 1, financier: 'investor',
      contract: { since: '2025-06', trees: 1000 },
      passes: [
        { date: '2026-02-10', ndvi: 0.666, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.632, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.741, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.633, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 's1', farmer: 'Allah Dino Khoso', village: 'Memon Goth, Malir, Karachi', lat: 24.97, lon: 67.3,
      acres: 10, treesPlanned: 5000, canalKm: 1.0, floodRisk: 0.15, treeCoverFraction: 0, financier: 'investor',
      passes: [
        { date: '2026-02-10', ndvi: 0.188, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.149, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.0925, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.106, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 's2', farmer: 'Sakina Bhatti', village: 'Gharo, Thatta', lat: 24.74, lon: 67.6,
      acres: 15, treesPlanned: 7000, canalKm: 2.0, floodRisk: 0.3, treeCoverFraction: 0, financier: 'bank',
      passes: [
        { date: '2026-02-10', ndvi: 0.194, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.147, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.125, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.13, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 's3', farmer: 'Hakim Ali Soomro', village: 'Kotri, Jamshoro', lat: 25.38, lon: 68.3,
      acres: 22, treesPlanned: 8000, canalKm: 0.5, floodRisk: 0.6, treeCoverFraction: 0.00902, financier: 'investor',
      // Claimed as planted in 2025; real NDVI here is green in February and bare after, so payments are held.
      contract: { since: '2025-11', trees: 8000 },
      passes: [
        { date: '2026-02-10', ndvi: 0.598, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.196, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.302, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.289, cloud: 0 },
        { date: '2027-02-10' },
      ] },
    { id: 's4', farmer: 'Test case: Rafiq Chandio', village: 'Tando Allahyar', lat: 25.46, lon: 68.72,
      acres: 2, treesPlanned: 5000, canalKm: 0.8, floodRisk: 0.2, treeCoverFraction: 0, financier: 'bank',
      passes: [
        { date: '2026-02-10', ndvi: 0.0603, cloud: 0 },
        { date: '2026-05-12', ndvi: 0.0395, cloud: 0 },
        { date: '2026-08-10', ndvi: 0.0246, cloud: 0 },
        { date: '2026-11-03', ndvi: 0.0414, cloud: 0 },
        { date: '2027-02-10' },
      ] },
  ],
};
