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

test('C04-4: impossible tree count per acre is rejected and never matched', () => {
  const bad = { id: 'x', acres: 2, treesPlanned: 5000, canalKm: 0, floodRisk: 0, treeCoverFraction: 0 };
  assert.deepStrictEqual(levels(L.checkPlot(bad)), ['reject']);
  assert.strictEqual(L.matchPlots([bad], 10).chosen.length, 0);
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
});

test('emissions band narrows with a strong NO2 signal and sizing uses the upper bound', () => {
  const e = L.estimateEmissions(site());
  assert.strictEqual(e.signal, 'strong');
  assert.ok(Math.abs(e.high - 2420 * 1.15) < 1e-6);
  assert.strictEqual(L.treesNeeded(e, 1), Math.ceil((2420 * 1.15 * 1000) / 22));
});

test('matching fills best plots first, one contract per plot, and reports shortfall', () => {
  const a = { id: 'a', acres: 10, treesPlanned: 100, canalKm: 0, floodRisk: 0, treeCoverFraction: 0 };
  const b = { id: 'b', acres: 10, treesPlanned: 100, canalKm: 4, floodRisk: 0.8, treeCoverFraction: 0 };
  const m = L.matchPlots([b, a], 150);
  assert.deepStrictEqual(m.chosen.map((c) => [c.plot.id, c.trees]), [['a', 100], ['b', 50]]);
  assert.strictEqual(L.matchPlots([a], 250).shortfall, 150);
  assert.strictEqual(L.matchPlots([{ ...a, contract: { since: '2025-01', trees: 100 } }], 50).chosen.length, 0); // no double-counting
});

test('verified pass releases money split between farmer and financier', () => {
  const p = L.payout(400, 'verified');
  assert.strictEqual(p.released, 40000);
  assert.strictEqual(p.farmer + p.financier, p.released);
  assert.strictEqual(L.verifyPass({ date: '2026-01-01', ndvi: 0.2, cloud: 0 }, '2026-06-01'), 'failed');
});
