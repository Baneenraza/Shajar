// Core rules of Shajar Ledger. Plain script (no modules) so it runs from file:// and in Node tests.
(function (root) {
  const RULES = {
    // shortcut: rough bounding box, so points in Iran/Afghanistan/India pass it; the Earth Engine
    // export adds the real border check (sat.inPakistan). Replace with a border polygon if time allows.
    pakistanBbox: { latMin: 23.6, latMax: 37.1, lonMin: 60.8, lonMax: 77.9 },
    // tCO2 per unit of fuel, approximate IPCC 2006 / US EPA defaults. Verify before pitching.
    fuelFactors: {
      coal_t: { label: 'tonnes of coal', tco2: 2.42 },
      furnace_oil_t: { label: 'tonnes of furnace oil', tco2: 3.13 },
      gas_mmbtu: { label: 'MMBtu of natural gas', tco2: 0.053 },
      diesel_l: { label: 'litres of diesel', tco2: 0.00268 },
    },
    kgCo2PerTreeYear: 22,      // assumption: replace with a published figure for the species you name
    maxTreesPerAcre: 1000,     // above this a farmer's claim is rejected (~2 m spacing)
    typicalTreesPerAcre: 500,  // used only to say how much more land a shortfall needs
    ndviAlive: 0.35,           // plot NDVI at or above this counts as living trees
    maxCloud: 0.3,             // more cloud than this over the plot = no decision
    maxWaterFraction: 0.5,
    minBuiltUpFraction: 0.05,  // built-up share within 1 km; below this there is probably no factory
    pricePerTreeYear: 400,     // PKR, demo pricing
    plantingCostPerTree: 250,  // PKR, demo pricing
    passesPerYear: 4,
    farmerShare: 0.6,          // the rest goes to whoever financed planting (investor or bank)
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  // Values no real factory or sensor can produce: reject before any estimate is made.
  function validateSiteInput(site) {
    const issues = [];
    if (!finite(site.lat) || !finite(site.lon) || Math.abs(site.lat) > 90 || Math.abs(site.lon) > 180) {
      issues.push({ level: 'reject', msg: `Coordinates ${site.lat}, ${site.lon} are not a place on Earth.` });
    }
    if (!RULES.fuelFactors[site.fuel]) issues.push({ level: 'reject', msg: `Unknown fuel type "${site.fuel}".` });
    if (!finite(site.amount) || site.amount <= 0) issues.push({ level: 'reject', msg: `Fuel use must be a positive number, got ${site.amount}.` });
    return issues;
  }

  function validateShare(share) {
    if (!finite(share) || share <= 0 || share > 1) {
      return [{ level: 'reject', msg: `An offset share of ${Math.round(share * 100)}% is impossible. It must be above 0% and at most 100%.` }];
    }
    return [];
  }

  function checkSite(site) {
    const invalid = validateSiteInput(site);
    if (invalid.length) return invalid;
    const issues = [];
    const b = RULES.pakistanBbox;
    const inBox = site.lat >= b.latMin && site.lat <= b.latMax && site.lon >= b.lonMin && site.lon <= b.lonMax;
    if (!inBox) issues.push({ level: 'reject', msg: 'These coordinates are outside Pakistan.' });
    const s = site.sat;
    if (!s) {
      issues.push({ level: 'flag', msg: 'There is no satellite data for this location yet. Run the Earth Engine export.' });
      return issues;
    }
    // Earth Engine returns 0/1 here, hand-written data may use false/true; a missing value is not a rejection.
    if (inBox && 'inPakistan' in s && !s.inPakistan) issues.push({ level: 'reject', msg: 'The country border check places this point outside Pakistan.' });
    if (s.waterFraction > RULES.maxWaterFraction) issues.push({ level: 'reject', msg: 'This point is on water. Check the coordinates.' });
    else if (s.builtUpFraction < RULES.minBuiltUpFraction) issues.push({ level: 'flag', msg: 'The satellite shows almost no buildings within 1 km, so there may be no factory here.' });
    // TROPOMI columns can dip below zero from retrieval noise, so this is a flag, not a rejection.
    if (!(s.no2Site > 0) || !(s.no2Background > 0)) issues.push({ level: 'flag', msg: 'The NO2 reading is zero or negative (sensor noise), so the satellite cannot back up the declared fuel use.' });
    return issues;
  }

  function estimateEmissions(site) {
    const tco2 = site.amount * RULES.fuelFactors[site.fuel].tco2;
    const s = site.sat;
    const ratio = s && s.no2Background > 0 && s.no2Site > 0 ? s.no2Site / s.no2Background : null;
    let band = 0.5, signal = 'none';
    if (ratio !== null && ratio >= 1.5) { band = 0.15; signal = 'strong'; }
    else if (ratio !== null && ratio >= 1.1) { band = 0.3; signal = 'weak'; }
    return { tco2, low: tco2 * (1 - band), high: tco2 * (1 + band), ratio, signal };
  }

  // Sized against the upper estimate so the offset is never overstated.
  function treesNeeded(estimate, share) {
    return Math.ceil((estimate.high * share * 1000) / RULES.kgCo2PerTreeYear);
  }

  function checkPlot(plot) {
    if (!finite(plot.treesPlanned) || plot.treesPlanned <= 0) return [{ level: 'reject', msg: `Tree count must be a positive number, got ${plot.treesPlanned}.` }];
    if (!(plot.acres > 0)) return [{ level: 'reject', msg: 'The plot size must be more than zero acres.' }];
    const perAcre = plot.treesPlanned / plot.acres;
    if (perAcre > RULES.maxTreesPerAcre) {
      return [{ level: 'reject', msg: `${Math.round(perAcre).toLocaleString()} trees per acre is not possible. The limit is ${RULES.maxTreesPerAcre.toLocaleString()}.` }];
    }
    return [];
  }

  // 0-100: water nearby, low flood risk, and not already forest (new trees must add something).
  function scorePlot(plot) {
    const water = clamp(1 - plot.canalKm / 5, 0, 1);
    return Math.round(100 * (0.4 * water + 0.3 * (1 - plot.floodRisk) + 0.3 * (1 - plot.treeCoverFraction)));
  }

  // Each plot goes to one contract only, so no tree is counted twice.
  function matchPlots(plots, needed) {
    const valid = plots
      .filter((p) => !checkPlot(p).some((i) => i.level === 'reject'))
      .sort((a, b) => scorePlot(b) - scorePlot(a));
    const chosen = [];
    let left = needed;
    for (const plot of valid) {
      if (left <= 0) break;
      const trees = Math.min(plot.treesPlanned, left);
      chosen.push({ plot, trees });
      left -= trees;
    }
    return { chosen, shortfall: Math.max(0, left) };
  }

  function verifyPass(pass, latestImagery) {
    if (pass.date > latestImagery || (pass.ndvi == null && pass.cloud == null)) return 'no-imagery';
    // NDVI is bounded to [-1, 1] and cloud cover to [0, 1]; anything else is a faulty reading.
    if (!finite(pass.ndvi) || Math.abs(pass.ndvi) > 1 || !finite(pass.cloud) || pass.cloud < 0 || pass.cloud > 1) return 'invalid';
    if (pass.cloud > RULES.maxCloud) return 'cloudy';
    return pass.ndvi >= RULES.ndviAlive ? 'verified' : 'failed';
  }

  function payout(trees, status) {
    const due = (trees * RULES.pricePerTreeYear) / RULES.passesPerYear;
    if (status === 'verified') return { released: due, farmer: due * RULES.farmerShare, financier: due * (1 - RULES.farmerShare), held: 0 };
    if (status === 'no-imagery') return { released: 0, farmer: 0, financier: 0, held: 0 };
    return { released: 0, farmer: 0, financier: 0, held: due };
  }

  const passIssues = (st) => ({
    invalid: [{ level: 'reject', msg: 'The reading is outside the physical range (NDVI must be between -1 and 1, cloud between 0% and 100%), so it is treated as a faulty sensor. Payment held.' }],
    cloudy: [{ level: 'flag', msg: 'Too much cloud over the plot to see the trees. No decision, payment held until the next pass.' }],
    'no-imagery': [{ level: 'flag', msg: 'No satellite image exists for this date yet. Nothing is paid or held.' }],
  }[st] || []);

  // C04: five out-of-bounds inputs injected into the same functions the app uses.
  const C04_CASES = [
    { name: 'Invalid coordinates', input: 'Factory at latitude 124.5, longitude 67.1',
      run: () => checkSite({ lat: 124.5, lon: 67.1, fuel: 'coal_t', amount: 5000 }) },
    { name: 'Negative fuel use', input: 'Factory declares -6,000 tonnes of coal a year',
      run: () => checkSite({ lat: 24.83, lon: 67.13, fuel: 'coal_t', amount: -6000 }) },
    { name: '200% carbon offset', input: 'Industry asks to offset 200% of its emissions',
      run: () => validateShare(2) },
    { name: 'Faulty vegetation sensor', input: 'Satellite pass reports NDVI 1.8 over a plot',
      run: () => passIssues(verifyPass({ date: '2026-08-10', ndvi: 1.8, cloud: 0 }, '2026-11-10')) },
    { name: 'Cloud-covered image', input: 'Satellite pass with 90% cloud over the plot',
      run: () => passIssues(verifyPass({ date: '2026-08-10', ndvi: 0.6, cloud: 0.9 }, '2026-11-10')) },
  ];

  const api = { RULES, C04_CASES, validateSiteInput, validateShare, checkSite, estimateEmissions, treesNeeded, checkPlot, scorePlot, matchPlots, verifyPass, payout };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
