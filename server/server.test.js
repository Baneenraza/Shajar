// Backend tests: each test gets a fresh database in the temp folder and a server on a free port.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, createServer } = require('./server.js');

async function start(t, opts = {}) {
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shajar-')), 'test.db');
  const app = createApp({ dbFile, now: () => new Date('2026-11-11T10:00:00Z'), ...opts });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, body: await r.json(), setCookie: set };
  };
  const login = (username, role) => call('POST', '/api/login', { username, password: 'shajar2026', role });
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(() => { app.close(); r(); }); }));
  return { call, base, login };
}

const offer = { siteId: 'gulahmed', farmer: 'Test Farmer', village: 'Badin', acres: 10, trees: 5000, canalKm: 1, flood: 0.1 };

test('state is seeded from data.js', async (t) => {
  const s = await start(t);
  const { status, body } = await s.call('GET', '/api/state');
  assert.strictEqual(status, 200);
  assert.ok(body.plots.length >= 6);
  assert.ok(body.offers.some((o) => o.id === 'o1' && o.status === 'open'));
  assert.ok(body.sites.find((x) => x.id === 'gulahmed').amount > 0);
});

test('a valid offer is stored; an impossible one is rejected with the reason', async (t) => {
  const s = await start(t);
  assert.strictEqual((await s.call('POST', '/api/offers', offer)).status, 403); // not signed in
  await s.login('noor', 'farmer');
  const ok = await s.call('POST', '/api/offers', offer);
  assert.strictEqual(ok.body.plot.farmer, 'Noor Ahmed Baloch'); // the name comes from the account, not the form
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.body.state.offers.some((o) => o.plotId === ok.body.plot.id));
  const badOne = await s.call('POST', '/api/offers', { ...offer, acres: 1, trees: 2500 });
  assert.strictEqual(badOne.status, 400);
  assert.match(badOne.body.issues[0].msg, /per acre/);
  const testSite = await s.call('POST', '/api/offers', { ...offer, siteId: 'sea' });
  assert.strictEqual(testSite.status, 400);
});

test('accepting an offer signs one contract and withdraws the same land elsewhere', async (t) => {
  const s = await start(t);
  await s.login('nrl', 'factory');
  assert.strictEqual((await s.call('POST', '/api/offers/o1/accept', {})).status, 403); // o1 was made to Gul Ahmed
  await s.login('gulahmed', 'factory');
  const r = await s.call('POST', '/api/offers/o1/accept', {});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.trees, 12500);
  assert.strictEqual(r.body.planting, 12500 * 250); // planting cost paid upfront by the factory
  const st = r.body.state;
  assert.strictEqual(st.offers.find((o) => o.id === 'o1').status, 'accepted');
  assert.strictEqual(st.offers.find((o) => o.id === 'o4').status, 'withdrawn');
  assert.strictEqual(st.plots.find((p) => p.id === 's1').contract.since, '2026-11');
  assert.strictEqual(st.plots.find((p) => p.id === 's1').contract.plantingPaid, 3125000);
  await s.login('nrl', 'factory');
  assert.strictEqual((await s.call('POST', '/api/offers/o4/accept', {})).status, 400); // withdrawn
  assert.strictEqual((await s.call('POST', '/api/offers/nope/accept', {})).status, 404);
});

test('share, claim check, reset and bad requests', async (t) => {
  const s = await start(t);
  await s.login('gulahmed', 'factory');
  assert.strictEqual((await s.call('POST', '/api/shares', { siteId: 'gulahmed', share: 2 })).status, 400);
  assert.strictEqual((await s.call('POST', '/api/shares', { siteId: 'gulahmed', share: 0.02 })).body.state.shares.gulahmed, 0.02);
  const claim = await s.call('POST', '/api/claims/check', { siteId: 'gulahmed', declared: 150000, statement: 'we cut emissions by 30%' });
  assert.deepStrictEqual(claim.body.findings.map((f) => f.verdict), ['contradiction', 'contradiction']);
  assert.strictEqual((await s.call('POST', '/api/claims/check', { siteId: 'gulahmed' })).status, 400);
  await s.call('POST', '/api/offers/o1/accept', {});
  const reset = await s.call('POST', '/api/reset', {});
  assert.strictEqual(reset.body.state.offers.find((o) => o.id === 'o1').status, 'open');
  const r = await fetch(s.base + '/api/offers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await fetch(s.base + '/server/server.js')).status, 404); // backend source is not served
  assert.strictEqual((await fetch(s.base + '/%2e%2e/secret.txt')).status, 404);
  assert.strictEqual((await fetch(s.base + '/index.html')).status, 200);
});

test('Climate TRACE refresh updates figures and keeps old ones when a call fails', async (t) => {
  // Fake country list: Gul Ahmed and Agha Steel are in it, National Refinery is missing.
  const fake = async (url) => {
    const year = url.includes('year=2024') ? 2024 : 2025;
    const asset = (Id, q) => ({ Id, EmissionsSummary: [{ Gas: 'co2e_100yr', EmissionsQuantity: q }], Confidence: [{ [year]: [{ total_co2e_100yrgwp: 'high' }] }] });
    const assets = url.includes('offset=0') ? [asset(25450993, year === 2025 ? 300000 : 280000), asset(1567000, 121000)] : [];
    return { ok: true, json: async () => ({ assets }) };
  };
  const s = await start(t, { fetchImpl: fake });
  const r = await s.call('POST', '/api/refresh/climate-trace', {});
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.results.filter((x) => x.ok).length, 2);
  const g = r.body.state.sites.find((x) => x.id === 'gulahmed');
  assert.deepStrictEqual([g.amount, g.tracePrev, g.traceConfidence], [300000, 280000, 'high']);
  assert.strictEqual(r.body.state.sites.find((x) => x.id === 'nrl').amount, 225597);
});

test('accounts: login, wrong password, wrong page, register, logout', async (t) => {
  const s = await start(t);
  assert.deepStrictEqual((await s.call('GET', '/api/me')).body, { user: null });
  assert.strictEqual((await s.call('POST', '/api/login', { username: 'noor', password: 'nope' })).status, 401);
  assert.strictEqual((await s.login('noor', 'factory')).status, 401); // farmer account on the industry page
  const ok = await s.login('noor', 'farmer');
  assert.strictEqual(ok.status, 200);
  assert.match(ok.setCookie, /HttpOnly/);
  assert.strictEqual(ok.body.token, undefined); // the session token only travels in the cookie
  assert.strictEqual((await s.call('GET', '/api/me')).body.user.name, 'Noor Ahmed Baloch');
  await s.call('POST', '/api/logout', {});
  assert.deepStrictEqual((await s.call('GET', '/api/me')).body, { user: null });

  const reg = (b) => s.call('POST', '/api/register', b);
  assert.strictEqual((await reg({ username: 'x', password: 'short', name: '' })).body.issues.length, 3);
  assert.strictEqual((await reg({ username: 'zara', password: 'longenough', name: 'Noor Ahmed Baloch' })).status, 400); // name taken
  assert.strictEqual((await reg({ username: 'noor', password: 'longenough', name: 'New Person' })).status, 400); // username taken
  const made = await reg({ username: 'zara', password: 'longenough', name: 'Zara Memon' });
  assert.strictEqual(made.body.user.role, 'farmer');
  assert.strictEqual((await s.call('GET', '/api/me')).body.user.username, 'zara');
});
