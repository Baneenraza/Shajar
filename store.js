// Demo data that survives reloads: kept in this browser's localStorage and shared by every page.
// Pages open side by side stay in sync through the 'storage' event.
(function () {
  const KEY = 'shajar_state_v1';
  // A new data.js (fresh satellite export) makes old saved copies of the plots stale, so start again.
  const stamp = DATA.latestImagery + '|' + DATA.plots.length + '|' + (DATA.offers || []).length;

  function seed() {
    return {
      stamp,
      plots: DATA.plots.map((p) => JSON.parse(JSON.stringify(p))),
      offers: (DATA.offers || []).map((o) => ({ ...o, status: 'open' })),
      funding: (DATA.fundingRequests || []).map((f) => ({ ...f, status: 'open' })),
      shares: {},
      nextId: 1,
    };
  }

  function load(raw) {
    try {
      const s = JSON.parse(raw);
      if (s && s.stamp === stamp && Array.isArray(s.plots) && Array.isArray(s.offers) && Array.isArray(s.funding)) return s;
    } catch (e) { /* unreadable: fall through to fresh data */ }
    return seed();
  }

  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  let state = load(raw);
  let saved = false;
  try { localStorage.setItem(KEY, JSON.stringify(state)); saved = true; } catch (e) { /* storage blocked: demo still works until reload */ }
  const listeners = [];

  const Store = {
    get state() { return state; },
    get saved() { return saved; },
    plotById: (id) => state.plots.find((p) => p.id === id),
    shareFor: (siteId) => state.shares[siteId] || 0.001,
    setShare(siteId, share) { state.shares[siteId] = share; Store.save(); },
    newId: () => 'u' + state.nextId++,
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(state)); saved = true; } catch (e) { saved = false; }
      listeners.forEach((f) => f());
    },
    reset() { state = seed(); Store.save(); },
    onChange(f) { listeners.push(f); },
  };

  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load(e.newValue);
    listeners.forEach((f) => f());
  });

  window.Store = Store;
})();
