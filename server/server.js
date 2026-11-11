// Shajar Ledger backend: serves the website and a small JSON API backed by SQLite (built into Node 22.5+).
// Run:  node server/server.js            (http://localhost:8765)
//       HOST=0.0.0.0 node server/server.js   (lets phones on the same Wi-Fi open http://<this computer's IP>:8765)
// No packages to install. Data lives in server/shajar.db; delete the file or use "Reset demo data" to start again.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Logic = require('../logic.js');

const ROOT = path.join(__dirname, '..');
const MAX_BODY = 32 * 1024;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

function loadData() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'), ctx);
  return ctx.window.DATA;
}

class HttpError extends Error {
  constructor(status, message, issues) { super(message); this.status = status; this.issues = issues; }
}
const bad = (message, issues) => new HttpError(400, message, issues);
const cleanText = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isTestSite = (s) => s.name.startsWith('Test case');

// Accounts. Demo accounts share one published password so judges can sign in; new farmers choose their own.
const DEMO_PASSWORD = 'shajar2026';
const SESSION_DAYS = 7;
const hashPassword = (pw, salt) => crypto.scryptSync(pw, salt, 32);
const demoUsername = (name) => name.split(' ')[0].toLowerCase(); // "Noor Ahmed Baloch" -> "noor"
const unauthorized = () => new HttpError(401, 'Please sign in first.');
const forbidden = (msg) => new HttpError(403, msg);

function createApp({ dbFile = path.join(__dirname, 'shajar.db'), fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const DATA = loadData();
  // Bump the last part when the data model changes, so old databases are reseeded.
  const stamp = DATA.latestImagery + '|' + DATA.plots.length + '|' + (DATA.offers || []).length + '|direct-pay';
  const db = new DatabaseSync(dbFile);
  db.exec(`
    create table if not exists plots (id text primary key, body text not null);
    create table if not exists offers (id text primary key, site_id text not null, plot_id text not null, status text not null);
    create table if not exists shares (site_id text primary key, share real not null);
    create table if not exists sites_live (site_id text primary key, amount real not null, prev real, confidence text, fetched_at text not null);
    create table if not exists events (id integer primary key autoincrement, at text not null, actor text, site_id text, plot_id text, text text not null);
    create table if not exists meta (k text primary key, v text);
    create table if not exists users (username text primary key, role text not null, name text not null, site_id text, salt text not null, hash text not null);
    create table if not exists sessions (token text primary key, username text not null, expires integer not null);`);

  function addUser(username, password, role, name, siteId = null) {
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('insert or ignore into users values (?, ?, ?, ?, ?, ?)').run(username, role, name, siteId, salt, hashPassword(password, salt).toString('hex'));
  }
  for (const s of DATA.sites.filter((x) => !isTestSite(x))) addUser(s.id, DEMO_PASSWORD, 'factory', s.name, s.id);
  for (const name of new Set(DATA.plots.map((p) => p.farmer))) addUser(demoUsername(name), DEMO_PASSWORD, 'farmer', name);

  const publicUser = (u) => (u ? { username: u.username, role: u.role, name: u.name, siteId: u.site_id || undefined } : null);
  function userForToken(token) {
    if (!token) return null;
    const s = db.prepare('select username, expires from sessions where token = ?').get(token);
    if (!s || s.expires < Date.now()) return null;
    return publicUser(db.prepare('select * from users where username = ?').get(s.username));
  }
  function newSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('delete from sessions where expires < ?').run(Date.now());
    db.prepare('insert into sessions values (?, ?, ?)').run(token, username, Date.now() + SESSION_DAYS * 864e5);
    return token;
  }

  const meta = (k) => { const r = db.prepare('select v from meta where k = ?').get(k); return r ? r.v : null; };
  const setMeta = (k, v) => db.prepare('insert into meta (k, v) values (?, ?) on conflict(k) do update set v = excluded.v').run(k, String(v));
  const bump = () => setMeta('version', Number(meta('version') || 0) + 1);
  const log = (text, { actor = null, siteId = null, plotId = null } = {}) =>
    db.prepare('insert into events (at, actor, site_id, plot_id, text) values (?, ?, ?, ?, ?)').run(now().toISOString(), actor, siteId, plotId, text);

  function tx(fn) {
    db.exec('begin');
    try { const r = fn(); bump(); db.exec('commit'); return r; } catch (e) { db.exec('rollback'); throw e; }
  }

  // Factory figures, with any live Climate TRACE refresh laid over the exported ones.
  function sites() {
    const live = Object.fromEntries(db.prepare('select * from sites_live').all().map((r) => [r.site_id, r]));
    return DATA.sites.map((s) => {
      const l = live[s.id];
      return l ? { ...s, amount: l.amount, tracePrev: l.prev ?? s.tracePrev, traceConfidence: l.confidence || s.traceConfidence, traceFetchedAt: l.fetched_at } : { ...s };
    });
  }
  const siteById = (id) => sites().find((s) => s.id === id);
  const plotById = (id) => { const r = db.prepare('select body from plots where id = ?').get(id); return r ? JSON.parse(r.body) : null; };
  const savePlot = (p) => db.prepare('insert into plots (id, body) values (?, ?) on conflict(id) do update set body = excluded.body').run(p.id, JSON.stringify(p));
  const allPlots = () => db.prepare('select body from plots order by rowid').all().map((r) => JSON.parse(r.body));
  const allOffers = () => db.prepare('select id, site_id as siteId, plot_id as plotId, status from offers order by rowid').all().map((o) => ({ ...o }));
  const shareFor = (siteId) => { const r = db.prepare('select share from shares where site_id = ?').get(siteId); return r ? r.share : 0.001; };
  const neededFor = (site) => Logic.treesNeeded(Logic.estimateEmissions(site), shareFor(site.id));
  const coveredFor = (siteId) => allPlots().filter((p) => p.contract && p.contract.siteId === siteId).reduce((a, p) => a + p.contract.trees, 0);

  function seed() {
    for (const t of ['plots', 'offers', 'shares', 'events']) db.exec(`delete from ${t}`);
    for (const p of DATA.plots) savePlot(p);
    for (const o of DATA.offers || []) db.prepare('insert into offers values (?, ?, ?, ?)').run(o.id, o.siteId, o.plotId, 'open');
    setMeta('seeded', stamp);
    setMeta('nextId', 1);
    log('Demo data loaded.');
  }
  if (meta('seeded') !== stamp) tx(seed);

  function state() {
    return {
      version: Number(meta('version') || 0),
      latestImagery: DATA.latestImagery,
      sites: sites(),
      plots: allPlots(),
      offers: allOffers(),
      shares: Object.fromEntries(db.prepare('select site_id, share from shares').all().map((r) => [r.site_id, r.share])),
      events: db.prepare('select id, at, actor, site_id as siteId, plot_id as plotId, text from events order by id desc limit 200').all().map((e) => ({ ...e })),
    };
  }

  const thisMonth = () => now().toISOString().slice(0, 7);

  const actions = {
    login(b) {
      const u = db.prepare('select * from users where username = ?').get(cleanText(b.username, 40).toLowerCase());
      const given = hashPassword(String(b.password || ''), u ? u.salt : 'no-such-user'); // same work either way
      if (!u || !crypto.timingSafeEqual(given, Buffer.from(u.hash, 'hex'))) throw new HttpError(401, 'Wrong username or password.');
      if (b.role && b.role !== u.role) throw new HttpError(401, `This is a ${u.role === 'factory' ? 'industry' : 'farmer'} account. Use the other sign-in page.`);
      return { user: publicUser(u), token: newSession(u.username) };
    },

    // New farmers only: industry accounts are tied to a real facility, so they are set up by us.
    register(b) {
      const username = cleanText(b.username, 40).toLowerCase();
      const name = cleanText(b.name);
      const password = typeof b.password === 'string' ? b.password : '';
      const issues = [];
      if (!/^[a-z0-9_]{3,20}$/.test(username)) issues.push({ level: 'reject', msg: 'Username: 3 to 20 letters, numbers or _.' });
      if (password.length < 8) issues.push({ level: 'reject', msg: 'Password: at least 8 characters.' });
      if (!name) issues.push({ level: 'reject', msg: 'Enter your full name.' });
      if (issues.length) throw bad('Please fix these.', issues);
      if (db.prepare('select 1 from users where username = ?').get(username)) throw bad('That username is taken.');
      // Plots are matched to farmers by name, so two accounts must never share one.
      if (db.prepare('select 1 from users where lower(name) = lower(?)').get(name)) throw bad('An account with that name already exists. Sign in instead.');
      addUser(username, password, 'farmer', name);
      return actions.login({ username, password });
    },

    createOffer(b, user) {
      if (!user || user.role !== 'farmer') throw forbidden('Sign in as a farmer to offer land.');
      b = { ...b, farmer: user.name };
      const site = siteById(b.siteId);
      const toNum = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
      const plot = {
        farmer: cleanText(b.farmer), village: cleanText(b.village), acres: toNum(b.acres), treesPlanned: toNum(b.trees),
        canalKm: toNum(b.canalKm), floodRisk: [0.1, 0.4, 0.7].includes(Number(b.flood)) ? Number(b.flood) : 0.4, treeCoverFraction: 0, passes: [],
      };
      const issues = Logic.validateOffer(plot);
      if (!site || isTestSite(site)) issues.push({ level: 'reject', msg: 'Choose a factory to offer to.' });
      if (issues.length) throw bad('The offer did not pass the checks.', issues);
      return tx(() => {
        const n = Number(meta('nextId') || 1);
        setMeta('nextId', n + 1);
        plot.id = 'u' + n;
        savePlot(plot);
        db.prepare('insert into offers values (?, ?, ?, ?)').run('o' + plot.id, site.id, plot.id, 'open');
        log(`${plot.farmer} offered ${plot.treesPlanned.toLocaleString('en-US')} trees on ${plot.acres} acres in ${plot.village}.`,
          { actor: plot.farmer, siteId: site.id, plotId: plot.id });
        return { plot };
      });
    },

    acceptOffer(id, b, user) {
      if (!user || user.role !== 'factory') throw forbidden('Sign in as the industry to accept offers.');
      return tx(() => {
        const offers = allOffers();
        const offer = offers.find((o) => o.id === id);
        if (!offer) throw new HttpError(404, 'No such offer.');
        if (offer.siteId !== user.siteId) throw forbidden('This offer was made to a different industry.');
        const plot = plotById(offer.plotId);
        const site = siteById(offer.siteId);
        const trees = Logic.acceptOffer(offer, plot, offers, neededFor(site) - coveredFor(site.id), thisMonth());
        if (!trees) throw bad('This offer is no longer open, or the requirement is already covered.');
        const planting = Logic.plantingPayment(trees);
        plot.contract.plantingPaid = planting; // the factory pays the farmer this upfront to buy saplings
        savePlot(plot);
        for (const o of offers) db.prepare('update offers set status = ? where id = ?').run(o.status, o.id);
        log(`${site.name} accepted ${plot.farmer}'s offer for ${trees.toLocaleString('en-US')} trees in ${plot.village} and paid PKR ${planting.toLocaleString('en-US')} upfront for planting.`, { actor: user.name, siteId: site.id, plotId: plot.id });
        return { trees, planting };
      });
    },

    setShare(b, user) {
      if (!user || user.role !== 'factory') throw forbidden('Sign in as the industry to change this.');
      const site = siteById(user.siteId);
      if (!site || isTestSite(site)) throw bad('Unknown factory.');
      const share = Number(b.share);
      const issues = Logic.validateShare(share);
      if (issues.length) throw bad('Share out of range.', issues);
      return tx(() => {
        db.prepare('insert into shares values (?, ?) on conflict(site_id) do update set share = excluded.share').run(site.id, share);
        log(`${site.name} set its tree cover to ${(share * 100).toFixed(1)}% of yearly emissions.`, { actor: site.name, siteId: site.id });
        return {};
      });
    },

    checkClaim(b) {
      const statement = cleanText(b.statement, 1000);
      const declared = b.declared === '' || b.declared === null || b.declared === undefined ? undefined : Number(b.declared);
      if (declared !== undefined && !(declared >= 0)) throw bad('A declared figure cannot be below zero.');
      if (!statement && declared === undefined) throw bad('Write what they say, or enter a declared figure.');
      if (b.siteId) {
        const site = siteById(b.siteId);
        if (!site) throw new HttpError(404, 'Unknown factory.');
        return { findings: Logic.crossCheckFactory({ statement, declaredTonnes: declared }, site) };
      }
      const plot = plotById(b.plotId);
      if (!plot) throw new HttpError(404, 'Unknown plot.');
      return { findings: Logic.crossCheckPlot({ statement, declaredTrees: declared }, plot, DATA.latestImagery) };
    },

    reset() { return tx(() => { seed(); return {}; }); },

    // Pulls the latest Climate TRACE figures for the real factories. Keeps the old figure for any that fail.
    // The single-asset endpoint (/v6/assets/{id}) always answers with its latest full year, whatever year is asked,
    // so each year is read from the country list (/v6/assets?countries=PAK&year=Y), page by page, until our facilities are found.
    async refreshTrace() {
      const targets = DATA.sites.filter((x) => x.traceId);
      const readYear = async (year) => {
        const found = {};
        for (let offset = 0; offset < 4000 && Object.keys(found).length < targets.length; offset += 1000) {
          const r = await fetchImpl(`https://api.climatetrace.org/v6/assets?countries=PAK&year=${year}&limit=1000&offset=${offset}`, { signal: AbortSignal.timeout(30000) });
          if (!r.ok) throw new Error(`Climate TRACE answered ${r.status}`);
          const assets = (await r.json()).assets || [];
          for (const a of assets) {
            const s = targets.find((t) => t.traceId === a.Id);
            if (!s) continue;
            const co2e = (a.EmissionsSummary || []).find((e) => e.Gas === 'co2e_100yr');
            const conf = ((a.Confidence || []).find((c) => c[String(year)]) || {})[String(year)];
            if (co2e && co2e.EmissionsQuantity > 0) found[s.id] = { amount: co2e.EmissionsQuantity, confidence: conf && conf[0] ? conf[0].total_co2e_100yrgwp : null };
          }
          if (assets.length < 1000) break;
        }
        return found;
      };
      let cur = {}, prev = {}, failure = null;
      try { [cur, prev] = await Promise.all([readYear(2025), readYear(2024)]); } catch (e) { failure = e.message; }
      const results = targets.map((s) => (cur[s.id]
        ? { siteId: s.id, name: s.name, ok: true, amount: Math.round(cur[s.id].amount), prev: prev[s.id] ? Math.round(prev[s.id].amount) : null, confidence: cur[s.id].confidence }
        : { siteId: s.id, name: s.name, ok: false, error: failure || 'not in the Climate TRACE list for 2025' }));
      tx(() => {
        for (const r of results.filter((x) => x.ok)) {
          db.prepare('insert into sites_live values (?, ?, ?, ?, ?) on conflict(site_id) do update set amount = excluded.amount, prev = excluded.prev, confidence = excluded.confidence, fetched_at = excluded.fetched_at')
            .run(r.siteId, r.amount, r.prev, r.confidence, now().toISOString());
        }
        const ok = results.filter((x) => x.ok).length;
        log(`Climate TRACE refresh: ${ok} of ${results.length} factories updated.`);
      });
      return { results };
    },
  };

  const logout = (token) => { if (token) db.prepare('delete from sessions where token = ?').run(token); };
  return { db, state, actions, userForToken, logout, close: () => db.close() };
}

// ---- HTTP layer ----

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Request too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch (e) { reject(bad('The request was not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
}

function serveStatic(req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { return sendJson(res, 400, { error: 'Bad path.' }); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  const inside = file.startsWith(ROOT + path.sep);
  const hidden = rel.split('/').some((part) => part.startsWith('.')) || rel.startsWith('/server/') || rel.startsWith('/node_modules/');
  if (!inside || hidden || !TYPES[path.extname(file)]) return sendJson(res, 404, { error: 'Not found.' });
  fs.readFile(file, (err, buf) => {
    if (err) return sendJson(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-cache' });
    res.end(buf);
  });
}

function createServer(app) {
  const clients = new Set();
  const broadcast = () => { const msg = `data: ${JSON.stringify({ version: app.state().version })}\n\n`; for (const c of clients) c.write(msg); };
  const heartbeat = setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000);
  heartbeat.unref();

  const routes = [
    ['GET', /^\/api\/state$/, async () => app.state()],
    ['GET', /^\/api\/me$/, async (m, b, user) => ({ user })],
    ['POST', /^\/api\/login$/, async (m, b) => app.actions.login(b)],
    ['POST', /^\/api\/register$/, async (m, b) => app.actions.register(b)],
    ['POST', /^\/api\/logout$/, async (m, b, user, token) => { app.logout(token); return { user: null, token: '' }; }],
    ['POST', /^\/api\/offers$/, async (m, b, user) => app.actions.createOffer(b, user), true],
    ['POST', /^\/api\/offers\/([\w-]+)\/accept$/, async (m, b, user) => app.actions.acceptOffer(m[1], b, user), true],
    ['POST', /^\/api\/shares$/, async (m, b, user) => app.actions.setShare(b, user), true],
    ['POST', /^\/api\/claims\/check$/, async (m, b) => app.actions.checkClaim(b)],
    ['POST', /^\/api\/reset$/, async () => app.actions.reset(), true],
    ['POST', /^\/api\/refresh\/climate-trace$/, async () => app.actions.refreshTrace(), true],
  ];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
      return serveStatic(req, res);
    }
    if (url.pathname === '/api/stream' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ version: app.state().version })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    const route = routes.find(([method, re]) => method === req.method && re.test(url.pathname));
    if (!route) return sendJson(res, routes.some(([, re]) => re.test(url.pathname)) ? 405 : 404, { error: 'Not found.' });
    try {
      const body = req.method === 'POST' ? await readJson(req) : {};
      const token = (/(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '') || [])[1];
      const { token: newToken, ...result } = await route[2](url.pathname.match(route[1]), body, app.userForToken(token), token);
      // The session lives in an HttpOnly cookie, so page scripts never see it.
      // Behind an HTTPS host (Render sets x-forwarded-proto), the cookie is only ever sent encrypted.
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      if (newToken !== undefined) res.setHeader('set-cookie', `sid=${newToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${newToken ? SESSION_DAYS * 86400 : 0}${secure}`);
      if (route[3]) { broadcast(); return sendJson(res, 200, { ...result, state: app.state() }); }
      return sendJson(res, 200, result);
    } catch (e) {
      if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message, issues: e.issues });
      console.error(e);
      return sendJson(res, 500, { error: 'Something went wrong on the server.' });
    }
  });
  server.on('close', () => { clearInterval(heartbeat); for (const c of clients) c.end(); });
  return server;
}

module.exports = { createApp, createServer };

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT) || 8765;
  // Hosts like Render set PORT and need every interface; a plain local run stays private to this computer.
  const host = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  createServer(app).listen(port, host, () => console.log(`Shajar Ledger running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}
