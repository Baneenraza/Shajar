// Industry dashboard, in tabs: overview (emissions, trees, money, what needs attention), offers, contracts, payments, claims.
const { $, num, pkr, esc, callouts } = UI;
const R = Logic.RULES;
const user = UI.Session.require(['factory']);
const TABS = ['home', 'offers', 'contracts', 'payments', 'claims'];
let refreshNote = ''; // last Climate TRACE refresh result, kept across live redraws

function render() {
  const site = UI.siteById(user.siteId);
  if (!site) { $('#main').innerHTML = '<p class="callout reject"><b>Unknown industry</b>Sign out and sign in again.</p>'; return; }
  const est = Logic.estimateEmissions(site);
  const issues = Logic.checkSite(site).filter((i) => i.level !== 'reject');
  const mine = (p) => p.contract && p.contract.siteId === site.id;
  const plots = Store.state.plots.filter(mine);
  const t = UI.totals(mine);
  const needed = UI.neededFor(site);
  const share = Store.shareFor(site.id);
  const contracted = UI.coveredFor(site.id);
  const rows = UI.ledger(plots);
  const claims = (DATA.claims || []).filter((c) => c.siteId === site.id);
  const open = Store.state.offers.filter((o) => o.siteId === site.id && o.status === 'open' && !Logic.checkPlot(UI.plotById(o.plotId)).length);
  const lastCheck = (p) => UI.plotChecks(p).last;
  const running = plots.filter(UI.isRunning);
  const alive = running.filter((p) => (lastCheck(p) || {}).st === 'verified').reduce((a, p) => a + p.contract.trees, 0);
  const failing = running.filter((p) => (lastCheck(p) || {}).st === 'failed');
  const contradicted = claims.filter((c) => UI.checkClaim(c).some((f) => f.verdict === 'contradiction'));
  const change = site.tracePrev ? ((site.amount - site.tracePrev) / site.tracePrev) * 100 : null;

  $('#dash-nav').innerHTML = UI.tabButtons([['home', 'Overview'], ['offers', 'Offers', open.length || ''], ['contracts', 'Contracts'], ['payments', 'Payments'], ['claims', 'Claims check']]);

  const attention = [
    ...open.map((o) => { const p = UI.plotById(o.plotId); return ['', `New offer from ${esc(p.farmer)}: ${num(p.treesPlanned)} trees in ${esc(p.village)}`, 'offers', 'Review']; }),
    ...failing.map((p) => ['flag', `${esc(p.farmer)}: trees not seen at the last satellite check`, 'contracts', 'View']),
    ...contradicted.map((c) => ['reject', `Report claim "${esc(c.statement)}" is contradicted`, 'claims', 'View']),
    ...issues.map((i) => ['flag', i.msg, null, '']),
  ];

  $('#main').innerHTML = `
    <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>

    <section data-panel="home" aria-label="Overview">
      <h1>${esc(site.name)}</h1>
      <div class="cards">
        <div class="card">
          <span class="card-label">Emissions 2025</span>
          <strong>${num(est.tco2)} tCO2e</strong>
          ${change === null ? '' : `<span class="${change > 0 ? 'up' : 'down'}">${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs 2024 (${num(site.tracePrev)})</span>`}
          <span class="source">Climate TRACE, "${esc(site.traceConfidence)}" confidence · ${site.traceFetchedAt ? new Date(site.traceFetchedAt).toLocaleDateString('en-GB') : 'export of 11 Nov 2026'}</span>
          <button type="button" class="btn-quiet" id="refresh">↻ Refresh</button>
          <div class="form-msg" id="refresh-msg" role="status">${refreshNote}</div>
        </div>
        <div class="card">
          <span class="card-label">Trees seen alive</span>
          <strong>${num(alive)} of ${num(contracted)}</strong>
          <span>${plots.length} contract${plots.length === 1 ? '' : 's'}</span>
          <span class="source">Sentinel-2 · ${UI.month(DATA.latestImagery)}</span>
        </div>
        <div class="card">
          <span class="card-label">Paid to farmers</span>
          <strong>${pkr(t.planting + t.paid)}</strong>
          ${t.held ? `<span class="held">${pkr(t.held)} held back</span>` : ''}
          <span class="source">Planting upfront, plus checks where trees were alive</span>
        </div>
      </div>

      <div class="panel">
        <label class="field"><span class="panel-title">How many trees do you need? <output id="share-out">${(share * 100).toFixed(1)}%</output></span>
          <span class="muted small">Share of your yearly emissions to offset with trees</span>
          <input id="share" type="range" min="0.1" max="10" step="0.1" value="${(share * 100).toFixed(1)}"></label>
        <div class="trio">
          <div><span>Needed</span><b>${num(needed)}</b></div>
          <div><span>Contracted</span><b>${num(contracted)}</b></div>
          <div><span>Gap</span><b>${num(Math.max(0, needed - contracted))}</b></div>
        </div>
        <progress max="${needed}" value="${Math.min(contracted, needed)}" aria-label="Trees contracted"></progress>
        <p class="source">About ${R.tco2PerAcreYear} t of carbon dioxide per acre of trees a year (IPCC 2019). Trees cover only part of your emissions; cutting fuel still matters most.</p>
      </div>

      <div class="panel">
        <p class="panel-title">Needs your attention</p>
        ${attention.length ? `<ul class="attention">${attention.map(([lvl, text, tab, cta]) =>
          `<li class="${lvl}"><span>${text}</span>${tab ? `<a href="#${tab}" data-tab="${tab}">${cta} →</a>` : ''}</li>`).join('')}</ul>`
          : '<p class="muted">Nothing right now.</p>'}
      </div>
    </section>

    <section data-panel="offers" aria-labelledby="offers-h">
      <h2 id="offers-h">Farmer offers</h2>
      <p class="muted">Accepting pays the farmer ${pkr(R.plantingCostPerTree)} per tree upfront for planting.</p>
      ${UI.offersTable(site)}
    </section>

    <section data-panel="contracts" aria-labelledby="contracts-h">
      <h2 id="contracts-h">Contracts</h2>
      <p class="muted">A satellite checks every plot every 3 months. Alive means greenness ${R.ndviAlive} or more, and only then is the farmer paid.</p>
      ${plots.map((p) => UI.plotCard(p)).join('') || '<p class="muted">No contracts yet. Accept a farmer\'s offer first.</p>'}
    </section>

    <section data-panel="payments" aria-labelledby="pay-h">
      <h2 id="pay-h">Payments</h2>
      ${rows.length ? `<div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Date</th><th scope="col">Farmer</th><th scope="col">Type</th>
        <th scope="col" class="num">Paid</th><th scope="col" class="num">Held back</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><th scope="row">${UI.month(r.date)}</th><td data-label="Farmer">${esc(r.plot.farmer)}, ${num(r.plot.contract.trees)} trees</td>
          <td data-label="Type"><span class="st-${r.st}">${UI.PASS_TEXT[r.st]}</span>${Number.isFinite(r.ndvi) ? ` (${r.ndvi.toFixed(2)})` : ''}</td>
          <td class="num" data-label="Paid">${pkr(r.released)}</td><td class="num" data-label="Held back">${pkr(r.held)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No payments yet.</p>'}
    </section>

    <section data-panel="claims" aria-labelledby="claims-h">
      <h2 id="claims-h">Claims check</h2>
      <p class="muted">What you publish about your emissions is checked against Climate TRACE and the air satellite. Test a statement before you publish it.</p>
      ${claims.map((c) => `<p>"${esc(c.statement)}"${Number.isFinite(c.declaredTonnes) ? ` <span class="muted small">(declared ${num(c.declaredTonnes)} t a year, example)</span>` : ''}</p>${UI.claimFindings(UI.checkClaim(c))}`).join('')}
      <form class="form" id="claim-form" novalidate>
        <div class="form-grid"><label>Declared tonnes of carbon dioxide a year (optional)<input name="declared" type="number" min="0" step="1" inputmode="numeric"></label></div>
        <label class="field-wide">Your statement<textarea name="statement" rows="3" placeholder="For example: We cut emissions by 20% this year."></textarea></label>
        <button type="submit" class="btn">Check this statement</button>
        <div class="form-msg" role="status"></div>
      </form>
    </section>`;
  UI.showTab(UI.currentTab(TABS));
}

if (user) {
  Store.ready.then(() => {
    UI.dashBar(user, 'Industry dashboard');
    UI.bindActions({ rerender: render });
    Store.onChange(render);
    render();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'share') return;
    Store.setShare(user.siteId, e.target.value / 100).catch((err) => { $('#market-msg').innerHTML = callouts([{ level: 'reject', msg: err.message }]); });
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'share') $('#share-out').textContent = Number(e.target.value).toFixed(1) + '%'; });
  document.addEventListener('click', async (e) => {
    if (e.target.id !== 'refresh') return;
    e.target.disabled = true;
    refreshNote = '<p class="muted">Asking Climate TRACE...</p>';
    $('#refresh-msg').innerHTML = refreshNote;
    try {
      const r = await Store.refreshTrace();
      const mineR = r.results.find((x) => x.siteId === user.siteId);
      refreshNote = mineR && mineR.ok
        ? `<p class="callout ok"><b>Updated</b>Climate TRACE now shows ${num(mineR.amount)} t for 2025 and ${num(mineR.prev)} t for 2024.</p>`
        : callouts([{ level: 'flag', msg: `Climate TRACE could not be reached for your factory (${esc(mineR ? mineR.error : 'no reply')}). The earlier figure is kept.` }]);
    } catch (err) {
      refreshNote = callouts([{ level: 'reject', msg: err.message }]);
    }
    if ($('#refresh-msg')) $('#refresh-msg').innerHTML = refreshNote;
    const b = $('#refresh'); if (b) b.disabled = false;
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'claim-form') return;
    e.preventDefault();
    const d = new FormData(e.target);
    UI.runClaimForm(e.target, { siteId: user.siteId, declared: d.get('declared'), statement: d.get('statement') });
  });
}
