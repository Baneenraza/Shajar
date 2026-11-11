// Shared pieces for every page: formatting, the offers table, forms, satellite tiles, totals, actions, top nav.
(function () {
  const D = window.DATA;
  const R = Logic.RULES;
  const $ = (s) => document.querySelector(s);
  const num = (n) => Math.round(n).toLocaleString('en-US');
  const pkr = (n) => 'PKR ' + num(n);
  const month = (iso) => new Date(iso.length === 7 ? iso + '-01' : iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const isTestSite = (s) => s.name.startsWith('Test case');
  const realSites = D.sites.filter((s) => !isTestSite(s));
  const siteById = (id) => D.sites.find((s) => s.id === id);
  const plotById = (id) => Store.plotById(id);
  const flash = {};

  const callouts = (issues) => issues.map((i) =>
    `<p class="callout ${i.level}"><b>${i.level === 'reject' ? 'Rejected' : 'Needs checking'}</b>${i.msg}</p>`).join('');
  const ok = (title, text) => `<p class="callout ok"><b>${title}</b>${text}</p>`;

  // Same scale as the legend: 0.1 bare soil to 0.6 dense trees.
  function greenColor(v) {
    const t = Math.min(1, Math.max(0, (v - 0.1) / 0.5));
    const mix = (a, b) => Math.round(a + (b - a) * t);
    return `rgb(${mix(139, 46)} ${mix(94, 125)} ${mix(52, 50)})`;
  }
  const PASS_TEXT = {
    verified: 'Alive, paid',
    failed: 'No trees seen, held back',
    cloudy: 'Too cloudy to see, held until next photo',
    'no-imagery': 'Photo not taken yet',
    invalid: 'Faulty reading, held back',
    planting: 'Planting paid upfront',
  };
  // What the factory paid the farmer upfront for saplings. Contracts signed before the app existed assume the standard rate.
  const plantingOf = (p) => (p.contract ? (p.contract.plantingPaid ?? Logic.plantingPayment(p.contract.trees)) : 0);

  const neededFor = (site) => Logic.treesNeeded(Logic.estimateEmissions(site), Store.shareFor(site.id));
  const coveredFor = (siteId) => Store.state.plots.filter((p) => p.contract && p.contract.siteId === siteId).reduce((a, p) => a + p.contract.trees, 0);
  const isRunning = (p) => p.contract && !p.contract.fromMarket;

  // A running contract's satellite checks, and the money each check moved.
  function plotChecks(plot) {
    const trees = plot.contract.trees;
    const r = { paid: 0, held: 0, last: null };
    const items = (plot.passes || []).map((pass) => {
      const st = Logic.verifyPass(pass, D.latestImagery);
      const pay = Logic.payout(trees, st);
      r.paid += pay.released; r.held += pay.held;
      if (st !== 'no-imagery') r.last = { st, ndvi: pass.ndvi, date: pass.date };
      const style = st === 'verified' || st === 'failed' ? ` style="background:${greenColor(pass.ndvi)}"` : '';
      const label = st === 'cloudy' ? 'Cloud' : st === 'no-imagery' ? 'Not yet' : st === 'invalid' ? 'Bad data' : pass.ndvi.toFixed(2);
      const money = pay.released ? pkr(pay.released) : pay.held ? `${pkr(pay.held)} held` : '';
      return `<li class="pass"><div class="tile ${st}"${style}>${label}</div>
        <span class="when">${month(pass.date)}</span><span class="st-${st}">${PASS_TEXT[st]}</span><span>${money}</span></li>`;
    }).join('');
    r.html = items ? `<ul class="passes">${items}</ul>` : '';
    return r;
  }

  // New contracts are not planted yet: their satellite photos show the land before planting.
  function baseline(plot) {
    const seen = (plot.passes || []).filter((p) => ['verified', 'failed'].includes(Logic.verifyPass(p, D.latestImagery)));
    const last = seen[seen.length - 1];
    if (!last) return 'There is no satellite photo of this land yet. The first check comes with the next photo after planting.';
    return last.ndvi < R.ndviAlive
      ? `Today this land scores ${last.ndvi.toFixed(2)}, which is bare soil or crops. When the new trees grow, the score will rise, and that rise proves the trees are new.`
      : `Today this land already scores ${last.ndvi.toFixed(2)}. Check that these are new trees before any payment.`;
  }

  function plotCard(plot, { showFactory = false } = {}) {
    const c = plot.contract;
    const factory = showFactory && c ? ` for ${esc(siteById(c.siteId).name)}` : '';
    const money = c ? `The factory paid ${pkr(plantingOf(plot))} upfront for planting.` : '';
    if (isRunning(plot)) {
      const k = plotChecks(plot);
      return `<article class="plot"><h4>${esc(plot.farmer)}</h4>
        <p class="muted">${num(c.trees)} trees in ${esc(plot.village)}${factory}, planted ${month(c.since)}. ${money}</p>
        ${k.html}
        <p class="totals"><span>Paid so far: <span class="paid">${pkr(k.paid)}</span></span><span>Held back: <span class="${k.held ? 'held' : ''}">${pkr(k.held)}</span></span></p></article>`;
    }
    return `<article class="plot"><h4>${esc(plot.farmer)}</h4>
      <p class="muted">${num(c.trees)} trees to plant in ${esc(plot.village)}${factory}. ${money}</p><p>${baseline(plot)}</p></article>`;
  }

  function offerStatus(o, p, remaining) {
    const issues = Logic.checkPlot(p);
    if (issues.length) return `<span class="result-reject">Rejected by the checks: ${issues[0].msg}</span>`;
    if (o.status === 'accepted') return `<span class="result-chosen">Accepted for ${num(p.contract.trees)} trees</span>`;
    if (o.status === 'withdrawn') return `<span class="result-taken">Withdrawn: this land is now under contract with ${esc(siteById(p.contract.siteId).name)}, so it cannot be sold twice</span>`;
    if (remaining <= 0) return '<span class="result-idle">This requirement is already covered</span>';
    return `<button type="button" class="btn" data-accept="${o.id}">Accept offer</button>`;
  }

  function offersTable(site) {
    const remaining = Math.max(0, neededFor(site) - coveredFor(site.id));
    const rank = (x) => (Logic.checkPlot(x.p).length ? 3 : { open: 0, accepted: 1, withdrawn: 2 }[x.o.status]);
    const list = Store.state.offers.filter((o) => o.siteId === site.id).map((o) => ({ o, p: plotById(o.plotId) }))
      .sort((a, b) => rank(a) - rank(b) || Logic.scorePlot(b.p) - Logic.scorePlot(a.p));
    if (!list.length) return '<p class="muted">No offers yet. Farmers can send one from the Farmer page or the form below.</p>';
    const best = list.find((x) => rank(x) === 0 && remaining > 0);
    const rows = list.map((x) => {
      const valid = !Logic.checkPlot(x.p).length;
      return `<tr><th scope="row">${esc(x.p.farmer)}</th><td data-label="Place">${esc(x.p.village)}</td>
        <td class="num" data-label="Land">${x.p.acres} acres</td><td class="num" data-label="Trees offered">${num(x.p.treesPlanned)}</td>
        <td class="num" data-label="Fit (of 100)">${valid ? Logic.scorePlot(x.p) : 'n/a'}${x === best ? '<span class="tag">Recommended</span>' : ''}</td>
        <td data-label="Status">${offerStatus(x.o, x.p, remaining)}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="stack">
      <thead><tr><th scope="col">Farmer</th><th scope="col">Place</th><th scope="col" class="num">Land</th>
        <th scope="col" class="num">Trees offered</th><th scope="col" class="num">Fit (of 100)</th><th scope="col">Status</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="muted small">The fit score is higher when water is close, flood risk is low, and the land has no trees on it yet. The best open offer is marked Recommended, but the factory decides.</p>`;
  }

  function requirement(site) {
    const needed = neededFor(site);
    const covered = Math.min(coveredFor(site.id), needed);
    return `<div class="requirement">
      <p class="req-title">${esc(site.name)} needs <b>${num(needed)} trees</b> planted and kept alive.</p>
      <progress max="${needed}" value="${covered}" aria-label="Trees covered by contracts"></progress>
      <p class="small">${num(covered)} trees covered by contracts. ${needed - covered > 0 ? `${num(needed - covered)} still needed.` : 'Fully covered.'}</p></div>`;
  }

  // siteId fixes the factory; without it the form asks which factory. name pre-fills a known farmer.
  function offerForm({ siteId = null, farmer = '', village = '' } = {}) {
    const which = siteId ? `<input type="hidden" name="site" value="${siteId}">`
      : `<label>Offer to factory<select name="site">${realSites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>`;
    return `<form class="form offer-form" novalidate>
      <div class="form-grid">
        ${which}
        <label>Farmer name<input name="farmer" autocomplete="name" value="${esc(farmer)}" required></label>
        <label>Place<input name="village" placeholder="Village, district" value="${esc(village)}" required></label>
        <label>Land in acres<input name="acres" type="number" min="0" step="0.5" inputmode="decimal" required></label>
        <label>Trees you can plant<input name="trees" type="number" min="0" step="1" inputmode="numeric" required></label>
        <label>Distance to water in km<input name="canalKm" type="number" min="0" step="0.1" inputmode="decimal" required></label>
        <label>Flood risk<select name="flood"><option value="0.1">Low</option><option value="0.4">Medium</option><option value="0.7">High</option></select></label>
      </div>
      <p class="muted small">At most ${num(R.maxTreesPerAcre)} trees per acre. We plan about ${R.typicalTreesPerAcre}. If a factory accepts, it pays you ${pkr(R.plantingCostPerTree)} per tree upfront for saplings and planting.</p>
      <button type="submit" class="btn">Send offer</button>
      <div class="form-msg" role="status"></div>
    </form>`;
  }

  // Money the factories paid farmers: planting upfront, plus checks where the trees were seen. filter picks which plots count.
  function totals(filter = () => true) {
    const t = { planting: 0, paid: 0, held: 0, earned: 0 };
    for (const p of Store.state.plots) {
      if (!p.contract || !filter(p)) continue;
      t.planting += plantingOf(p);
      if (isRunning(p)) { const k = plotChecks(p); t.paid += k.paid; t.held += k.held; }
    }
    t.earned = t.planting + t.paid;
    return t;
  }

  const figure = (value, label) => `<div class="figure"><strong>${value}</strong><span>${label}</span></div>`;

  // Actions are the same on every page; each page re-renders through Store.onChange.
  function bindActions(hooks = {}) {
    const failed = (err) => callouts(err.issues && err.issues.length ? err.issues : [{ level: 'reject', msg: err.message }]);
    const focusMsg = () => { const m = $('#market-msg'); if (m) m.focus(); };
    // A button stays disabled while its request is on the way, so a double click sends it once.
    const busy = (el, on) => { if (el) { el.disabled = on; el.setAttribute('aria-busy', String(on)); } };

    document.addEventListener('click', async (e) => {
      const accept = e.target.closest('[data-accept]');
      if (!accept) return;
      const offer = Store.state.offers.find((o) => o.id === accept.dataset.accept);
      const plot = plotById(offer.plotId);
      const site = siteById(offer.siteId);
      busy(accept, true);
      try {
        const r = await Store.accept(offer.id, Session.get() ? Session.get().name : '');
        flash.market = { html: ok('Offer accepted', `${esc(plot.farmer)} will plant ${num(r.trees)} trees for ${esc(site.name)}. The factory paid ${pkr(r.planting)} upfront for planting.`), until: Date.now() + 10000 };
      } catch (err) {
        flash.market = { html: `<p class="callout flag"><b>Not accepted</b>${esc(err.message)}</p>`, until: Date.now() + 10000 };
      }
      if (hooks.rerender) hooks.rerender();
      busy(accept, false);
      focusMsg();
    });

    document.addEventListener('submit', async (e) => {
      const form = e.target;
      if (!form.classList.contains('offer-form')) return;
      e.preventDefault();
      const data = new FormData(form);
      const msg = form.querySelector('.form-msg');
      const button = form.querySelector('button[type="submit"]');
      if (form.classList.contains('offer-form')) {
        const toNum = (k) => (data.get(k) === '' ? NaN : Number(data.get(k)));
        const draft = { farmer: String(data.get('farmer')).trim(), village: String(data.get('village')).trim(),
          acres: toNum('acres'), treesPlanned: toNum('trees'), canalKm: toNum('canalKm') };
        const issues = Logic.validateOffer(draft); // checked here for a quick answer, and again on the server
        if (!siteById(data.get('site'))) issues.push({ level: 'reject', msg: 'Choose a factory to offer to.' });
        if (issues.length) { msg.innerHTML = callouts(issues); return; } // keep what they typed
        busy(button, true);
        try {
          const r = await Store.offer({ siteId: data.get('site'), farmer: draft.farmer, village: draft.village, acres: draft.acres, trees: draft.treesPlanned,
            canalKm: draft.canalKm, flood: Number(data.get('flood')) });
          flash.market = { html: ok('Offer sent', `${esc(r.plot.farmer)}'s offer of ${num(r.plot.treesPlanned)} trees went to ${esc(siteById(data.get('site')).name)}.`), until: Date.now() + 10000 };
          if (hooks.afterOffer) hooks.afterOffer(r.plot);
          if (hooks.rerender) hooks.rerender();
          focusMsg();
        } catch (err) { msg.innerHTML = failed(err); busy(button, false); }
      }
    });
  }

  // Demo sign-in: who is using this browser. No passwords; it only decides which dashboard opens.
  const SESSION = 'shajar_user';
  const Session = {
    get() { try { const u = JSON.parse(localStorage.getItem(SESSION)); return u && u.name && (u.role === 'factory' || u.role === 'farmer') ? u : null; } catch (e) { return null; } },
    set(u) { try { localStorage.setItem(SESSION, JSON.stringify(u)); } catch (e) { /* storage blocked */ } },
    clear() { try { localStorage.removeItem(SESSION); } catch (e) { /* storage blocked */ } },
    // Sends anyone not signed in as this role to the sign-in page, which brings them back here.
    require(roles) {
      const u = Session.get();
      if (u && roles.includes(u.role)) return u;
      location.replace(`signin.html?role=${encodeURIComponent(roles[0])}`);
      return null;
    },
  };
  const DASHBOARD = { factory: 'factory.html', farmer: 'farmer.html' };

  // Top bar for the public overview: link to sign in (or back to your dashboard), server status, reset.
  function topNav() {
    const u = Session.get();
    const nav = document.createElement('nav');
    nav.className = 'topnav';
    nav.setAttribute('aria-label', 'Site');
    nav.innerHTML = `<span class="brand">Shajar Ledger</span>
      <ul><li><a href="index.html" aria-current="page">Overview</a></li>
        <li><a href="${u && DASHBOARD[u.role] ? DASHBOARD[u.role] : 'signin.html'}">${u && DASHBOARD[u.role] ? `My dashboard (${esc(u.name)})` : 'Sign in to a dashboard'}</a></li></ul>
      <span class="save-state" role="status"></span>
      <button type="button" class="btn-quiet" id="reset">Reset demo data</button>`;
    document.body.prepend(nav);
    wireReset(nav.querySelector('#reset'));
    serverStatus(nav.querySelector('.save-state'));
  }

  // Top bar for a dashboard: its own colour band, who is signed in, and sign out. No links to other roles.
  function dashBar(user, title) {
    const bar = document.createElement('header');
    bar.className = 'dashbar';
    bar.innerHTML = `<div class="dashbar-in"><a class="brand" href="index.html">Shajar Ledger</a>
      <span class="dash-title">${esc(title)}</span>
      <span class="who">Signed in as <b>${esc(user.name)}</b></span>
      <span class="save-state" role="status"></span>
      <button type="button" class="btn-quiet" id="signout">Sign out</button></div>`;
    document.body.prepend(bar);
    bar.querySelector('#signout').addEventListener('click', () => { Session.clear(); location.href = 'signin.html'; });
    serverStatus(bar.querySelector('.save-state'));
  }

  function serverStatus(el) {
    const show = () => { el.textContent = Store.online ? 'Saved on the server' : 'Server not running: read-only'; el.classList.toggle('offline', !Store.online); };
    Store.onChange(show);
    show();
  }

  // Asks twice so a stray click does nothing.
  function wireReset(btn) {
    let armed = false;
    btn.addEventListener('click', async () => {
      if (!armed) { armed = true; btn.textContent = 'Click again to reset'; setTimeout(() => { armed = false; btn.textContent = 'Reset demo data'; }, 4000); return; }
      armed = false; btn.textContent = 'Reset demo data';
      try { await Store.reset(); } catch (err) { flash.market = { html: callouts([{ level: 'reject', msg: err.message }]), until: Date.now() + 10000 }; }
    });
  }

  // Every satellite check on a running contract as a ledger row (date, result, money moved).
  function ledger(plots) {
    const rows = [];
    for (const p of plots) {
      if (!p.contract) continue;
      rows.push({ date: p.contract.since, plot: p, st: 'planting', ndvi: null, released: plantingOf(p), held: 0 });
      if (!isRunning(p)) continue;
      for (const pass of p.passes || []) {
        const st = Logic.verifyPass(pass, D.latestImagery);
        if (st === 'no-imagery') continue;
        const pay = Logic.payout(p.contract.trees, st);
        rows.push({ date: pass.date, plot: p, st, ndvi: pass.ndvi, released: pay.released, held: pay.held });
      }
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  // A dashboard's own section menu.
  const sectionNav = (items) => { $('#dash-nav').innerHTML = `<ul>${items.map(([id, label]) => `<li><a href="#${id}">${esc(label)}</a></li>`).join('')}</ul>`; };

  // Claim box on a dashboard: the server reads the statement and checks it against independent sources.
  async function runClaimForm(form, claim) {
    const out = form.querySelector('.form-msg');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try { out.innerHTML = claimFindings((await Store.checkClaim(claim)).findings); }
    catch (err) { out.innerHTML = callouts(err.issues && err.issues.length ? err.issues : [{ level: 'reject', msg: err.message }]); }
    button.disabled = false;
  }

  // Recent activity from the server's log, filtered to what concerns this person.
  function activity(filter, limit = 12) {
    const items = (Store.state.events || []).filter(filter).slice(0, limit);
    if (!items.length) return '<p class="muted">Nothing yet. Actions on the marketplace appear here as they happen.</p>';
    return `<ol class="activity">${items.map((e) => `<li><time datetime="${esc(e.at)}">${new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><span>${esc(e.text)}</span></li>`).join('')}</ol>`;
  }

  // A message shows for 10 seconds, so a live redraw right after an action does not wipe it.
  const takeFlash = (k) => { const f = flash[k]; if (!f) return ''; if (Date.now() > f.until) { delete flash[k]; return ''; } return f.html; };

  // C12: one claim's findings, each naming the independent source it was checked against.
  const VERDICT = { contradiction: ['reject', 'Contradiction'], consistent: ['ok', 'Consistent'], unverifiable: ['flag', 'Cannot verify'] };
  const claimFindings = (findings) => `<ul class="findings">${findings.map((f) => {
    const [cls, word] = VERDICT[f.verdict];
    return `<li class="callout ${cls}"><b>${word}${f.source !== 'none' ? `, checked against ${esc(f.source)}` : ''}</b>${f.msg}</li>`;
  }).join('')}</ul>`;
  const checkClaim = (c) => (c.siteId ? Logic.crossCheckFactory(c, siteById(c.siteId)) : Logic.crossCheckPlot(c, plotById(c.plotId), D.latestImagery));
  const claimWho = (c) => {
    if (c.siteId) return esc(siteById(c.siteId).name);
    const p = plotById(c.plotId);
    return p ? `${esc(p.farmer)}, ${esc(p.village)}` : 'Unknown plot';
  };

  window.UI = {
    $, num, pkr, month, esc, thisMonth, isTestSite, realSites, siteById, plotById, callouts, greenColor, plantingOf,
    neededFor, coveredFor, isRunning, plotChecks, baseline, plotCard, offersTable, requirement, offerForm,
    totals, figure, bindActions, topNav, dashBar, takeFlash, claimFindings, checkClaim, claimWho,
    Session, DASHBOARD, ledger, activity, PASS_TEXT, sectionNav, runClaimForm,
  };
})();
