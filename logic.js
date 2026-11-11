// Core rules of Shajar Ledger. Plain script (no modules) so it runs from file:// and in Node tests.
(function (root) {
  const RULES = {
    // shortcut: rough bounding box, so points in Iran/Afghanistan/India pass it; the Earth Engine
    // export adds the real border check (sat.inPakistan). Replace with a border polygon if time allows.
    pakistanBbox: { latMin: 23.6, latMax: 37.1, lonMin: 60.8, lonMax: 77.9 },
    // tCO2 per unit of fuel, approximate IPCC 2006 / US EPA defaults. Verify before pitching.
    fuelFactors: {
      reported_t: { label: 't CO2e a year, Climate TRACE 2025 estimate', tco2: 1 },
      coal_t: { label: 'tonnes of coal a year, declared', tco2: 2.42 },
      furnace_oil_t: { label: 'tonnes of furnace oil a year, declared', tco2: 3.13 },
      gas_mmbtu: { label: 'MMBtu of natural gas a year, declared', tco2: 0.053 },
      diesel_l: { label: 'litres of diesel a year, declared', tco2: 0.00268 },
    },
    // IPCC 2019 Refinement, Vol 4 Ch 4: plantation growth 6 t d.m./ha/yr (Table 4.10, subtropical steppe, Asia;
    // range 1-12), root:shoot 0.44 (Table 4.4, subtropical dry, Asia), carbon fraction 0.47 (2006 Table 4.3).
    // 6 x 1.44 x 0.47 x 44/12 = 14.9 t CO2/ha/yr = 6.03 t CO2/acre/yr.
    tco2PerAcreYear: 6.03,
    maxTreesPerAcre: 1000,     // above this a farmer's claim is rejected (~2 m spacing)
    typicalTreesPerAcre: 500,  // planting density assumed when turning the per-acre figure into trees
    ndviAlive: 0.35,           // plot NDVI at or above this counts as living trees
    maxCloud: 0.3,             // more cloud than this over the plot = no decision
    maxWaterFraction: 0.5,
    minBuiltUpFraction: 0.05,  // built-up share within 1 km; below this there is probably no factory
    pricePerTreeYear: 400,     // PKR, demo pricing
    plantingCostPerTree: 250,  // PKR, demo pricing
    passesPerYear: 4,
    farmerShare: 0.6,          // the rest goes to whoever financed planting (investor or bank)
  };

  RULES.kgCo2PerTreeYear = (RULES.tco2PerAcreYear * 1000) / RULES.typicalTreesPerAcre; // ~12 kg

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  // Values no real factory or sensor can produce: reject before any estimate is made.
  function validateSiteInput(site) {
    const issues = [];
    if (!finite(site.lat) || !finite(site.lon) || Math.abs(site.lat) > 90 || Math.abs(site.lon) > 180) {
      issues.push({ level: 'reject', msg: `Coordinates ${site.lat}, ${site.lon} are not a place on Earth.` });
    }
    if (!RULES.fuelFactors[site.fuel]) issues.push({ level: 'reject', msg: `Unknown fuel type "${site.fuel}".` });
    if (!finite(site.amount) || site.amount <= 0) issues.push({ level: 'reject', msg: `Fuel use cannot be zero or below. The factory sent ${site.amount}.` });
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
    if (inBox && 'inPakistan' in s && !s.inPakistan) issues.push({ level: 'reject', msg: 'This point is outside Pakistan on the official border map.' });
    if (s.waterFraction > RULES.maxWaterFraction) issues.push({ level: 'reject', msg: 'This point is in the sea, not on land. Check the location.' });
    else if (s.builtUpFraction < RULES.minBuiltUpFraction) issues.push({ level: 'flag', msg: 'The satellite shows almost no buildings within 1 km, so there may be no factory here.' });
    // TROPOMI columns can dip below zero from retrieval noise, so this is a flag, not a rejection.
    if (!(s.no2Site > 0) || !(s.no2Background > 0)) issues.push({ level: 'flag', msg: 'The air reading is zero or below zero, which happens with sensor noise, so the satellite cannot back up the estimate.' });
    if (site.traceConfidence === 'very low' || site.traceConfidence === 'low') {
      issues.push({ level: 'flag', msg: `Climate TRACE rates its own estimate for this facility "${site.traceConfidence}" confidence. Ask the factory for fuel records before signing.` });
    }
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
    if (!finite(plot.treesPlanned) || plot.treesPlanned <= 0) return [{ level: 'reject', msg: 'The number of trees must be more than zero.' }];
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

  // A farmer's offer or funding request as typed into a form (a trust boundary: anything can arrive).
  function validateOffer(o) {
    const issues = [];
    if (typeof o.farmer !== 'string' || !o.farmer.trim()) issues.push({ level: 'reject', msg: "Enter the farmer's name." });
    if (typeof o.village !== 'string' || !o.village.trim()) issues.push({ level: 'reject', msg: 'Enter where the land is.' });
    if ('canalKm' in o && (!finite(o.canalKm) || o.canalKm < 0)) issues.push({ level: 'reject', msg: 'Distance to water cannot be below zero.' });
    return issues.concat(checkPlot(o));
  }

  const fundingNeeded = (trees) => trees * RULES.plantingCostPerTree;

  // Accepting ties the land to one contract and withdraws its other open offers, so no tree is counted twice.
  function acceptOffer(offer, plot, offers, remaining, since) {
    if (offer.status !== 'open' || plot.contract || !(remaining > 0) || checkPlot(plot).length) return 0;
    const trees = Math.min(plot.treesPlanned, remaining);
    plot.contract = { since, trees, siteId: offer.siteId, fromMarket: true };
    offer.status = 'accepted';
    for (const o of offers) if (o !== offer && o.plotId === plot.id && o.status === 'open') o.status = 'withdrawn';
    return trees;
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

  // ---- C12: declared claims (numbers and free text) checked against independent sources ----

  const SCALE = { k: 1e3, thousand: 1e3, lakh: 1e5, million: 1e6 };
  const NUM = '(\\d+(?:\\.\\d+)?)\\s*(k|thousand|lakh|million)?\\s*';
  const toNum = (n, unit) => Number(n) * (SCALE[unit] || 1);
  const pctText = (v) => (v > 0 ? '+' : '') + (Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)) + '%';
  const round = (v) => Math.round(v).toLocaleString('en-US');

  // Pulls checkable claims out of a written statement. Pattern rules, not an AI model, so results are predictable.
  function parseClaims(text) {
    const t = String(text || '').toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1');
    const c = {};
    let m;
    if ((m = t.match(/(?:cut|reduc\w*|lower\w*|decreas\w*|fell|dropp?\w*)\D{0,40}?(\d+(?:\.\d+)?)\s*(?:%|percent)/))) c.changePct = -Number(m[1]);
    else if ((m = t.match(/(?:increas\w*|rose|grew|went up)\D{0,40}?(\d+(?:\.\d+)?)\s*(?:%|percent)/))) c.changePct = Number(m[1]);
    if ((m = t.match(new RegExp(NUM + '(?:tonnes|tons|t)\\b')))) c.tonnes = toNum(m[1], m[2]);
    if ((m = t.match(new RegExp(NUM + '(?:trees|saplings)\\b')))) c.trees = toNum(m[1], m[2]);
    if (/zero[- ]emission|carbon[- ]neutral|net[- ]zero|100\s*%\s*(?:renewable|solar|clean)|burns? no (?:fuel|coal|gas|oil)|no (?:fuel|coal|gas|oil) (?:is )?burn/.test(t)) c.noBurning = true;
    if (/\b(?:alive|healthy|thriving|growing well|green)\b/.test(t)) c.saysAlive = true;
    if (/\bplanted\b/.test(t)) c.saysPlanted = true;
    if (/\b(?:no trees|bare|empty|barren|fallow|cleared)\b/.test(t)) c.saysBare = true;
    return c;
  }

  const finding = (verdict, source, msg) => ({ verdict, source, msg });

  // report: { declaredTonnes?, statement? }. site needs the Climate TRACE amount (2025) and tracePrev (2024).
  function crossCheckFactory(report, site) {
    const c = parseClaims(report.statement);
    const out = [];
    const ref = site.fuel === 'reported_t' ? site.amount : null;
    const declared = finite(report.declaredTonnes) ? report.declaredTonnes : c.tonnes;
    if (finite(declared) && ref) {
      const diff = ((declared - ref) / ref) * 100;
      if (declared < ref * 0.75) out.push(finding('contradiction', 'Climate TRACE 2025', `Declares ${round(declared)} t a year, but the independent estimate is ${round(ref)} t: ${Math.round(-diff)}% lower than what Climate TRACE sees.`));
      else if (declared > ref * 1.33) out.push(finding('contradiction', 'Climate TRACE 2025', `Declares ${round(declared)} t a year, ${Math.round(diff)}% above the independent estimate of ${round(ref)} t. Check the units.`));
      else out.push(finding('consistent', 'Climate TRACE 2025', `Declares ${round(declared)} t a year, within 25% of the independent estimate of ${round(ref)} t.`));
    }
    if (finite(c.changePct) && ref && site.tracePrev) {
      const actual = ((ref - site.tracePrev) / site.tracePrev) * 100;
      const verdict = Math.abs(c.changePct - actual) > 10 ? 'contradiction' : 'consistent';
      out.push(finding(verdict, 'Climate TRACE 2024 to 2025', `Claims a change of ${pctText(c.changePct)}; Climate TRACE shows ${pctText(actual)} (${round(site.tracePrev)} t to ${round(ref)} t).`));
    }
    if (c.noBurning) {
      const e = estimateEmissions(site);
      if (e.signal === 'strong') out.push(finding('contradiction', 'Sentinel-5P satellite', `Claims no fuel is burned, but the air over the site has ${e.ratio.toFixed(1)} times more nitrogen dioxide than the area around it, a sign of burning.`));
      else if (e.signal === 'weak') out.push(finding('unverifiable', 'Sentinel-5P satellite', `Claims no fuel is burned; the satellite sees a weak burning signal (${e.ratio.toFixed(1)} times the surroundings), so this needs a site visit.`));
      else out.push(finding('consistent', 'Sentinel-5P satellite', 'Claims no fuel is burned, and the satellite sees no extra nitrogen dioxide over the site.'));
    }
    if (!out.length) out.push(finding('unverifiable', 'none', 'No figure or checkable claim was found, so nothing could be compared.'));
    return out;
  }

  // claim: { declaredTrees?, statement? }. Compares with the plot's satellite greenness and land-cover tree share.
  function crossCheckPlot(claim, plot, latestImagery) {
    const c = parseClaims(claim.statement);
    const out = [];
    const trees = finite(claim.declaredTrees) ? claim.declaredTrees : c.trees;
    const seen = (plot.passes || []).filter((p) => ['verified', 'failed'].includes(verifyPass(p, latestImagery)));
    const last = seen[seen.length - 1];
    if (finite(trees) && plot.acres > 0) {
      const perAcre = trees / plot.acres;
      out.push(perAcre > RULES.maxTreesPerAcre
        ? finding('contradiction', 'Physical limit', `Claims ${round(trees)} trees on ${plot.acres} acres, which is ${round(perAcre)} per acre. More than ${round(RULES.maxTreesPerAcre)} per acre cannot grow.`)
        : finding('consistent', 'Physical limit', `${round(trees)} trees on ${plot.acres} acres (${round(perAcre)} per acre) is possible.`));
    }
    if (c.saysAlive || c.saysPlanted) {
      if (!last) out.push(finding('unverifiable', 'Sentinel-2 satellite', 'Says trees are planted, but there is no clear satellite photo of this plot yet.'));
      else if (last.ndvi < RULES.ndviAlive) out.push(finding('contradiction', 'Sentinel-2 satellite', `Says trees are planted and healthy, but the latest photo (${last.date}) gives a greenness score of ${last.ndvi.toFixed(2)}, which is bare soil or crops.`));
      else out.push(finding('consistent', 'Sentinel-2 satellite', `Says trees are planted, and the latest photo (${last.date}) gives a greenness score of ${last.ndvi.toFixed(2)}, which fits living trees.`));
    }
    if (c.saysBare) {
      const tc = finite(plot.treeCoverFraction) ? plot.treeCoverFraction : null;
      if (tc === null && !last) out.push(finding('unverifiable', 'ESA WorldCover', 'Says the land has no trees, but there is no land-cover or satellite reading for it.'));
      else if ((tc !== null && tc > 0.3) || (last && last.ndvi >= 0.5)) out.push(finding('contradiction', 'ESA WorldCover and Sentinel-2', `Says the land has no trees, but the land-cover map shows ${Math.round((tc || 0) * 100)}% tree cover${last ? ` and the latest greenness score is ${last.ndvi.toFixed(2)}` : ''}. Trees already there cannot count as new.`));
      else out.push(finding('consistent', 'ESA WorldCover and Sentinel-2', `Says the land has no trees, and the land-cover map shows ${Math.round((tc || 0) * 100)}% tree cover${last ? ` with a greenness score of ${last.ndvi.toFixed(2)}` : ''}.`));
    }
    if (!out.length) out.push(finding('unverifiable', 'none', 'No tree count or checkable claim was found, so nothing could be compared.'));
    return out;
  }

  const passIssues = (st) => ({
    invalid: [{ level: 'reject', msg: 'A greenness score can only be between -1 and 1, and cloud cover between 0% and 100%, so this reading comes from a faulty sensor. No payment is made on it.' }],
    cloudy: [{ level: 'flag', msg: 'Clouds hide the plot, so nobody can tell if the trees are alive. The payment waits for the next clear photo.' }],
    'no-imagery': [{ level: 'flag', msg: 'No satellite photo exists for this date yet. Nothing is paid or held back.' }],
  }[st] || []);

  // C04: five out-of-bounds inputs injected into the same functions the app uses.
  const C04_CASES = [
    { name: 'Impossible location', input: 'A factory at latitude 124.5 (no such place exists)',
      run: () => checkSite({ lat: 124.5, lon: 67.1, fuel: 'coal_t', amount: 5000 }) },
    { name: 'Negative fuel', input: 'A factory says it burned -6,000 tonnes of coal',
      run: () => checkSite({ lat: 24.83, lon: 67.13, fuel: 'coal_t', amount: -6000 }) },
    { name: 'More than 100% covered', input: 'A factory asks to cover 200% of its pollution with trees',
      run: () => validateShare(2) },
    { name: 'Broken greenness sensor', input: 'The satellite reports a greenness score of 1.8 (the highest possible is 1)',
      run: () => passIssues(verifyPass({ date: '2026-08-10', ndvi: 1.8, cloud: 0 }, '2026-11-10')) },
    { name: 'Cloudy photo', input: 'A satellite photo with 90% of the plot under cloud',
      run: () => passIssues(verifyPass({ date: '2026-08-10', ndvi: 0.6, cloud: 0.9 }, '2026-11-10')) },
  ];

  const api = { RULES, C04_CASES, validateSiteInput, validateShare, checkSite, estimateEmissions, treesNeeded, checkPlot, scorePlot, validateOffer, fundingNeeded, acceptOffer, verifyPass, payout, parseClaims, crossCheckFactory, crossCheckPlot };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
