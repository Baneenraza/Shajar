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
  };
  const fundedBy = (p) => (p.financier ? `${p.funderName ? esc(p.funderName) + ', ' : ''}${p.financier === 'bank' ? 'bank loan' : 'investor'}` : '');

  const neededFor = (site) => Logic.treesNeeded(Logic.estimateEmissions(site), Store.shareFor(site.id));
  const coveredFor = (siteId) => Store.state.plots.filter((p) => p.contract && p.contract.siteId === siteId).reduce((a, p) => a + p.contract.trees, 0);
  const isRunning = (p) => p.contract && !p.contract.fromMarket;

  // A running contract's satellite checks, and the money each check moved.
  function plotChecks(plot) {
    const trees = plot.contract.trees;
    const r = { paid: 0, held: 0, farmer: 0, funder: 0, funderHeld: 0, last: null };
    const items = (plot.passes || []).map((pass) => {
      const st = Logic.verifyPass(pass, D.latestImagery);
      const pay = Logic.payout(trees, st);
      r.paid += pay.released; r.held += pay.held; r.farmer += pay.farmer; r.funder += pay.financier;
      r.funderHeld += pay.held * (1 - R.farmerShare);
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
    const money = plot.financier ? `Planting paid by ${fundedBy(plot)}.` : c && c.fromMarket ? 'Planting is not funded yet.' : '';
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
      <label class="check"><input type="checkbox" name="needFunding"> I need money for saplings and planting</label>
      <label class="field-inline">Ask for it from<select name="wants"><option value="investor">An investor</option><option value="bank">A bank loan</option></select></label>
      <p class="muted small">At most ${num(R.maxTreesPerAcre)} trees per acre. We plan about ${R.typicalTreesPerAcre}. Planting costs about ${pkr(R.plantingCostPerTree)} per tree.</p>
      <button type="submit" class="btn">Send offer</button>
      <div class="form-msg" role="status"></div>
    </form>`;
  }

  function fundingList(requests, { forms = true } = {}) {
    if (!requests.length) return '<p class="muted">No funding requests here yet. A farmer can ask for funding when sending an offer.</p>';
    return requests.map((f) => {
      const p = plotById(f.plotId);
      const amount = Logic.fundingNeeded(p.treesPlanned);
      const deal = p.contract ? `Under contract with ${esc(siteById(p.contract.siteId).name)} since ${month(p.contract.since)}.` : 'Offered to a factory, not accepted yet.';
      const body = f.status === 'funded'
        ? `<p class="result-chosen">Funded by ${fundedBy(p)}.</p>`
        : forms ? `<form class="fund-form" data-fund="${f.id}" novalidate>
            <label>Your name or bank<input name="funder" required></label>
            <label>Fund as<select name="type">
              <option value="investor"${f.wants === 'investor' ? ' selected' : ''}>Investor</option>
              <option value="bank"${f.wants === 'bank' ? ' selected' : ''}>Bank</option></select></label>
            <button type="submit" class="btn">Fund ${pkr(amount)}</button>
            <div class="form-msg" role="status"></div></form>`
          : '<p class="muted">Waiting for an investor or a bank.</p>';
      return `<article class="request"><h4>${esc(p.farmer)}, ${esc(p.village)}</h4>
        <p>${p.acres} acres, ${num(p.treesPlanned)} trees. Needs <b>${pkr(amount)}</b> for saplings and planting, and is asking for ${f.wants === 'bank' ? 'a bank loan' : 'an investor'}. ${deal}</p>
        ${body}</article>`;
    }).join('');
  }

  // Money moved by running contracts, plus funding committed on the marketplace. filter picks which plots count.
  function totals(filter = () => true) {
    const t = { investor: { invested: 0, received: 0, held: 0 }, bank: { lent: 0, repaid: 0, held: 0 }, farmers: 0, paid: 0, held: 0 };
    for (const p of Store.state.plots) {
      if (!isRunning(p) || !filter(p)) continue;
      const k = plotChecks(p);
      t.farmers += k.farmer; t.paid += k.paid; t.held += k.held;
      const cost = p.contract.trees * R.plantingCostPerTree;
      if (p.financier === 'investor') { t.investor.invested += cost; t.investor.received += k.funder; t.investor.held += k.funderHeld; }
      else if (p.financier === 'bank') { t.bank.lent += cost; t.bank.repaid += k.funder; t.bank.held += k.funderHeld; }
    }
    for (const f of Store.state.funding) {
      const p = plotById(f.plotId);
      if (f.status !== 'funded' || !filter(p)) continue;
      if (p.financier === 'investor') t.investor.invested += Logic.fundingNeeded(p.treesPlanned);
      else t.bank.lent += Logic.fundingNeeded(p.treesPlanned);
    }
    return t;
  }

  const figure = (value, label) => `<div class="figure"><strong>${value}</strong><span>${label}</span></div>`;

  // Actions are the same on every page; each page re-renders through Store.onChange.
  function bindActions(hooks = {}) {
    document.addEventListener('click', (e) => {
      const accept = e.target.closest('[data-accept]');
      if (!accept) return;
      const offer = Store.state.offers.find((o) => o.id === accept.dataset.accept);
      const plot = plotById(offer.plotId);
      const site = siteById(offer.siteId);
      const trees = Logic.acceptOffer(offer, plot, Store.state.offers, neededFor(site) - coveredFor(site.id), thisMonth);
      flash.market = trees ? ok('Offer accepted', `${esc(plot.farmer)} will plant ${num(trees)} trees for ${esc(site.name)}.`)
        : '<p class="callout flag"><b>Not accepted</b>This offer is no longer open, or the requirement is already covered.</p>';
      Store.save();
      const m = $('#market-msg'); if (m) m.focus();
    });

    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (!form.classList.contains('offer-form') && !form.dataset.fund) return;
      e.preventDefault();
      const data = new FormData(form);
      const msg = form.querySelector('.form-msg');
      if (form.classList.contains('offer-form')) {
        const toNum = (k) => (data.get(k) === '' ? NaN : Number(data.get(k)));
        const plot = {
          id: Store.newId(), farmer: String(data.get('farmer')).trim(), village: String(data.get('village')).trim(),
          acres: toNum('acres'), treesPlanned: toNum('trees'), canalKm: toNum('canalKm'),
          floodRisk: Number(data.get('flood')), treeCoverFraction: 0, passes: [],
        };
        const issues = Logic.validateOffer(plot);
        if (!siteById(data.get('site'))) issues.push({ level: 'reject', msg: 'Choose a factory to offer to.' });
        if (issues.length) { msg.innerHTML = callouts(issues); return; } // keep what they typed
        Store.state.plots.push(plot);
        Store.state.offers.push({ id: 'o' + plot.id, siteId: data.get('site'), plotId: plot.id, status: 'open' });
        if (data.get('needFunding')) Store.state.funding.push({ id: 'f' + plot.id, plotId: plot.id, wants: data.get('wants'), status: 'open' });
        flash.market = ok('Offer sent', `${esc(plot.farmer)}'s offer of ${num(plot.treesPlanned)} trees went to ${esc(siteById(data.get('site')).name)}${data.get('needFunding') ? ', with a request for funding' : ''}.`);
        if (hooks.afterOffer) hooks.afterOffer(plot);
        Store.save();
        const m = $('#market-msg'); if (m) m.focus();
      } else {
        const f = Store.state.funding.find((x) => x.id === form.dataset.fund);
        const name = String(data.get('funder')).trim();
        if (!name) { msg.innerHTML = callouts([{ level: 'reject', msg: "Enter your name or your bank's name." }]); return; }
        const p = plotById(f.plotId);
        p.financier = data.get('type') === 'bank' ? 'bank' : 'investor';
        p.funderName = name;
        f.status = 'funded';
        flash.market = ok('Funded', `${esc(name)} is paying ${pkr(Logic.fundingNeeded(p.treesPlanned))} for ${esc(p.farmer)}'s planting.`);
        Store.save();
      }
    });
  }

  // Top navigation shared by all pages, with the reset button (asks twice so a stray click does nothing).
  function topNav(active) {
    const links = [['index.html', 'Overview'], ['factory.html', 'Factory'], ['farmer.html', 'Farmer'], ['investor.html', 'Investor and bank']];
    const nav = document.createElement('nav');
    nav.className = 'topnav';
    nav.setAttribute('aria-label', 'Dashboards');
    nav.innerHTML = `<span class="brand">Shajar Ledger</span>
      <ul>${links.map(([href, label]) => `<li><a href="${href}"${href === active ? ' aria-current="page"' : ''}>${label}</a></li>`).join('')}</ul>
      <span class="save-state" role="status"></span>
      <button type="button" class="btn-quiet" id="reset">Reset demo data</button>`;
    document.body.prepend(nav);
    const btn = nav.querySelector('#reset');
    let armed = false;
    btn.addEventListener('click', () => {
      if (!armed) { armed = true; btn.textContent = 'Click again to reset'; setTimeout(() => { armed = false; btn.textContent = 'Reset demo data'; }, 4000); return; }
      armed = false; btn.textContent = 'Reset demo data';
      Store.reset();
    });
    const showSaved = () => { nav.querySelector('.save-state').textContent = Store.saved ? 'Saved in this browser' : 'Not saved: this browser blocks storage'; };
    Store.onChange(showSaved);
    showSaved();
  }

  const takeFlash = (k) => { const v = flash[k] || ''; delete flash[k]; return v; };

  window.UI = {
    $, num, pkr, month, esc, thisMonth, isTestSite, realSites, siteById, plotById, callouts, greenColor, fundedBy,
    neededFor, coveredFor, isRunning, plotChecks, baseline, plotCard, offersTable, requirement, offerForm,
    fundingList, totals, figure, bindActions, topNav, takeFlash,
  };
})();
