// Run: node --test
const test = require('node:test');
const assert = require('node:assert');
const L = require('./logic.js');

const site = (over) => ({ lat: 31.4, lon: 73.1, fuel: 'coal_t', amount: 1000,
  sat: { inPakistan: true, waterFraction: 0, builtUpFraction: 0.5, no2Site: 2, no2Background: 1 }, ...over });
const levels = (issues) => issues.map((i) => i.level);

test('C04-1: point outside Pakistan or in the sea is rejected', () => {
  assert.deepStrictEqual(levels(L.checkSite(site({ lat: 10 }))), ['reject']);
  assert.deepStrictEqual(levels(L.checkSite(site({ sat: { ...site().sat, inPakistan: false } }))), ['reject']);
  assert.deepStrictEqual(levels(L.checkSite(site({ sat: { ...site().sat, inPakistan: 0 } }))), ['reject']); // Earth Engine form
  assert.deepStrictEqual(levels(L.checkSite(site({ sat: { ...site().sat, waterFraction: 0.9 } }))), ['reject']);
});

test('C04-2: cloud-covered image gives no decision', () => {
  assert.strictEqual(L.verifyPass({ date: '2026-01-01', ndvi: 0.6, cloud: 0.8 }, '2026-06-01'), 'cloudy');
  assert.strictEqual(L.payout(100, 'cloudy').released, 0);
});

test('C04-3: site with no buildings is flagged', () => {
  assert.deepStrictEqual(levels(L.checkSite(site({ sat: { ...site().sat, builtUpFraction: 0.01 } }))), ['flag']);
});

test('C04-4: impossible tree count per acre is rejected and can never be accepted', () => {
  const bad = { id: 'x', acres: 2, treesPlanned: 5000, canalKm: 0, floodRisk: 0, treeCoverFraction: 0 };
  assert.deepStrictEqual(levels(L.checkPlot(bad)), ['reject']);
  const offer = { id: 'o', siteId: 's', plotId: 'x', status: 'open' };
  assert.strictEqual(L.acceptOffer(offer, bad, [offer], 1000, '2026-11'), 0);
  assert.strictEqual(bad.contract, undefined);
});

test('C04-5: date with no imagery yet is pending, not paid or held', () => {
  assert.strictEqual(L.verifyPass({ date: '2026-12-01', ndvi: 0.6, cloud: 0 }, '2026-11-05'), 'no-imagery');
  assert.deepStrictEqual(L.payout(100, 'no-imagery'), { released: 0, farmer: 0, financier: 0, held: 0 });
});

test('C04 bench: every injected case is rejected or flagged, never passed', () => {
  assert.strictEqual(L.C04_CASES.length, 5);
  const got = L.C04_CASES.map((c) => levels(c.run()));
  assert.deepStrictEqual(got, [['reject'], ['reject'], ['reject'], ['reject'], ['flag']]);
});

test('other impossible values: bad NDVI/cloud, negative NO2, zero trees', () => {
  assert.strictEqual(L.verifyPass({ date: '2026-01-01', ndvi: -3, cloud: 0 }, '2026-06-01'), 'invalid');
  assert.strictEqual(L.verifyPass({ date: '2026-01-01', ndvi: 0.5, cloud: 1.5 }, '2026-06-01'), 'invalid');
  assert.strictEqual(L.payout(100, 'invalid').released, 0);
  assert.deepStrictEqual(levels(L.checkSite(site({ sat: { ...site().sat, no2Site: -1e-6 } }))), ['flag']);
  assert.strictEqual(L.estimateEmissions(site({ sat: { ...site().sat, no2Site: -1e-6 } })).signal, 'none');
  assert.deepStrictEqual(levels(L.checkPlot({ acres: 5, treesPlanned: 0 })), ['reject']);
  assert.deepStrictEqual(levels(L.validateShare(0.02)), []);
  assert.deepStrictEqual(levels(L.checkSite(site({ traceConfidence: 'very low' }))), ['flag']);
  assert.deepStrictEqual(levels(L.checkSite(site({ traceConfidence: 'medium' }))), []);
});

test('emissions band narrows with a strong NO2 signal and sizing uses the upper bound', () => {
  const e = L.estimateEmissions(site());
  assert.strictEqual(e.signal, 'strong');
  assert.ok(Math.abs(e.high - 2420 * 1.15) < 1e-6);
  assert.ok(Math.abs(L.RULES.kgCo2PerTreeYear - 12.06) < 1e-9);
  assert.strictEqual(L.treesNeeded(e, 1), Math.ceil((2420 * 1.15 * 1000) / 12.06));
});

test('accepting an offer: one contract per plot, other offers withdrawn, capped at what is still needed', () => {
  const plot = { id: 'a', acres: 10, treesPlanned: 100, canalKm: 0, floodRisk: 0, treeCoverFraction: 0 };
  const o1 = { id: 'o1', siteId: 'f1', plotId: 'a', status: 'open' };
  const o2 = { id: 'o2', siteId: 'f2', plotId: 'a', status: 'open' };
  assert.strictEqual(L.acceptOffer(o1, plot, [o1, o2], 60, '2026-11'), 60);
  assert.deepStrictEqual(plot.contract, { since: '2026-11', trees: 60, siteId: 'f1', fromMarket: true });
  assert.strictEqual(o2.status, 'withdrawn'); // no double-counting
  assert.strictEqual(L.acceptOffer(o2, plot, [o1, o2], 100, '2026-11'), 0);
  const p2 = { id: 'b', acres: 10, treesPlanned: 100 };
  const o3 = { id: 'o3', siteId: 'f1', plotId: 'b', status: 'open' };
  assert.strictEqual(L.acceptOffer(o3, p2, [o3], 0, '2026-11'), 0); // requirement already covered
});

test('offer form input is checked before it is shown', () => {
  const ok = { farmer: 'A', village: 'B', acres: 5, treesPlanned: 2500, canalKm: 1 };
  assert.deepStrictEqual(levels(L.validateOffer(ok)), []);
  assert.deepStrictEqual(levels(L.validateOffer({ ...ok, farmer: '  ' })), ['reject']);
  assert.deepStrictEqual(levels(L.validateOffer({ ...ok, canalKm: -2 })), ['reject']);
  assert.deepStrictEqual(levels(L.validateOffer({ ...ok, treesPlanned: 2500, acres: 1 })), ['reject']);
  assert.deepStrictEqual(levels(L.validateOffer({ farmer: 'A', village: 'B', acres: NaN, treesPlanned: 10 })), ['reject']);
  assert.strictEqual(L.fundingNeeded(16000), 4000000);
});

test('verified pass releases money split between farmer and financier', () => {
  const p = L.payout(400, 'verified');
  assert.strictEqual(p.released, 40000);
  assert.strictEqual(p.farmer + p.financier, p.released);
  assert.strictEqual(L.verifyPass({ date: '2026-01-01', ndvi: 0.2, cloud: 0 }, '2026-06-01'), 'failed');
});

test('C12: claims are read from free text', () => {
  assert.deepStrictEqual(L.parseClaims('We emitted about 150,000 tonnes and cut emissions by 30% vs 2024.'), { changePct: -30, tonnes: 150000 });
  assert.strictEqual(L.parseClaims('Emissions rose slightly, about 1%').changePct, 1);
  assert.strictEqual(L.parseClaims('roughly 1.2 lakh tons a year').tonnes, 120000);
  assert.strictEqual(L.parseClaims('The refinery is now carbon neutral').noBurning, true);
  assert.deepStrictEqual(L.parseClaims('I planted 8,000 trees, all healthy'), { trees: 8000, saysAlive: true, saysPlanted: true });
  assert.strictEqual(L.parseClaims('My land is bare').saysBare, true);
  assert.deepStrictEqual(L.parseClaims('Hello'), {});
});

const verdicts = (f) => f.map((x) => x.verdict);
const factory = { fuel: 'reported_t', amount: 294460, tracePrev: 295150, sat: { no2Site: 2, no2Background: 1 } };

test('C12: factory figures and statements are checked against Climate TRACE and the air satellite', () => {
  assert.deepStrictEqual(verdicts(L.crossCheckFactory({ declaredTonnes: 150000, statement: 'we cut emissions by 30%' }, factory)), ['contradiction', 'contradiction']);
  assert.deepStrictEqual(verdicts(L.crossCheckFactory({ declaredTonnes: 290000, statement: 'emissions fell 1%' }, factory)), ['consistent', 'consistent']);
  assert.deepStrictEqual(verdicts(L.crossCheckFactory({ statement: 'We are carbon neutral' }, factory)), ['contradiction']);
  assert.deepStrictEqual(verdicts(L.crossCheckFactory({ statement: 'We are carbon neutral' }, { ...factory, sat: { no2Site: 1, no2Background: 1 } })), ['consistent']);
  assert.deepStrictEqual(verdicts(L.crossCheckFactory({ statement: 'We care about the planet' }, factory)), ['unverifiable']);
});

test('C12: farmer claims are checked against satellite greenness, land cover and the per-acre limit', () => {
  const bare = { acres: 10, treeCoverFraction: 0, passes: [{ date: '2026-11-03', ndvi: 0.12, cloud: 0 }] };
  const trees = { acres: 3, treeCoverFraction: 0.9, passes: [{ date: '2026-11-03', ndvi: 0.6, cloud: 0 }] };
  assert.deepStrictEqual(verdicts(L.crossCheckPlot({ statement: 'I planted 5,000 trees, all healthy' }, bare, '2026-11-10')), ['consistent', 'contradiction']);
  assert.deepStrictEqual(verdicts(L.crossCheckPlot({ statement: '1,200 trees planted, all alive' }, trees, '2026-11-10')), ['consistent', 'consistent']);
  assert.deepStrictEqual(verdicts(L.crossCheckPlot({ statement: 'my land is bare' }, trees, '2026-11-10')), ['contradiction']);
  assert.deepStrictEqual(verdicts(L.crossCheckPlot({ statement: 'my land is bare' }, bare, '2026-11-10')), ['consistent']);
  assert.deepStrictEqual(verdicts(L.crossCheckPlot({ declaredTrees: 5000, statement: '' }, { acres: 2, passes: [] }, '2026-11-10')), ['contradiction']);
  assert.deepStrictEqual(verdicts(L.crossCheckPlot({ statement: 'planted trees' }, { acres: 2, passes: [] }, '2026-11-10')), ['unverifiable']);
});
