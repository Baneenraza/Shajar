// Shared data, kept by the backend (server/server.js) so every phone and laptop sees the same thing.
// Pages call Store.ready before their first render; every change goes through the API and comes back
// as the new state. Opened without the server (e.g. by double-clicking index.html), the pages still show
// the starting data read-only, with a notice.
(function () {
  const listeners = [];
  let state = null;
  let online = false;
  let lastVersion = -1;

  function seedLocal() {
    return {
      version: 0,
      sites: DATA.sites,
      plots: DATA.plots.map((p) => JSON.parse(JSON.stringify(p))),
      offers: (DATA.offers || []).map((o) => ({ ...o, status: 'open' })),
      shares: {},
      events: [],
    };
  }

  // Live Climate TRACE figures from the server replace the exported ones everywhere on the page.
  function apply(next) {
    state = next;
    lastVersion = next.version;
    for (const s of next.sites || []) {
      const local = DATA.sites.find((x) => x.id === s.id);
      if (local) Object.assign(local, { amount: s.amount, tracePrev: s.tracePrev, traceConfidence: s.traceConfidence, traceFetchedAt: s.traceFetchedAt });
    }
    listeners.forEach((f) => f());
  }

  async function load() {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error('status ' + r.status);
      online = true;
      apply(await r.json());
    } catch (e) {
      online = false;
      if (!state) { state = seedLocal(); listeners.forEach((f) => f()); }
    }
  }

  async function post(url, body) {
    if (!online) throw Object.assign(new Error('The server is not running, so nothing can be saved. Start it with: node server/server.js'), { issues: [] });
    let r;
    try {
      r = await fetch('/api' + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    } catch (e) {
      throw Object.assign(new Error('Could not reach the server. Check that it is still running.'), { issues: [] });
    }
    const j = await r.json().catch(() => ({ error: 'The server sent an unreadable reply.' }));
    if (!r.ok) throw Object.assign(new Error(j.error || 'The request failed.'), { issues: j.issues || [] });
    if (j.state) apply(j.state);
    return j;
  }

  const ready = load().then(() => {
    if (!online || !window.EventSource) return;
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      try { if (JSON.parse(e.data).version !== lastVersion) load(); } catch (err) { /* ignore a garbled ping */ }
    };
  });

  window.Store = {
    ready,
    get state() { return state; },
    get online() { return online; },
    plotById: (id) => state.plots.find((p) => p.id === id),
    shareFor: (siteId) => state.shares[siteId] || 0.001,
    onChange(f) { listeners.push(f); },
    offer: (data) => post('/offers', data),
    accept: (id, actor) => post(`/offers/${encodeURIComponent(id)}/accept`, { actor }),
    setShare: (siteId, share) => post('/shares', { siteId, share }),
    checkClaim: (claim) => post('/claims/check', claim),
    reset: () => post('/reset'),
    // Accounts: the session is an HttpOnly cookie the server sets; pages only learn who is signed in.
    login: (role, username, password) => post('/login', { role, username, password }),
    register: (username, password, name) => post('/register', { username, password, name }),
    logout: () => post('/logout'),
    me: async () => { const r = await fetch('/api/me', { cache: 'no-store' }); return r.ok ? (await r.json()).user : null; },
    refreshTrace: () => post('/refresh/climate-trace'),
  };
})();
