// Factory dashboard: one factory's emissions, tree requirement, farmer offers, contracts, payments and claims.
const { $, num, pkr, esc, callouts } = UI;
const R = Logic.RULES;
const user = UI.Session.require(['factory']);
let refreshNote = ''; // last Climate TRACE refresh result, kept across live redraws

function emissions(site, est) {
  const prev = site.tracePrev;
  const max = Math.max(site.amount, prev || 0);
  const bar = (label, v, cls) => `<div class="bar-row"><span class="bar-label">${label}</span>
    <span class="bar-track"><span class="bar ${cls}" style="width:${(v / max) * 100}%"></span></span><span class="bar-value">${num(v)} t</span></div>`;
  const change = prev ? ((site.amount - prev) / prev) * 100 : null;
  const air = est.signal === 'strong' ? `The satellite sees ${est.ratio.toFixed(1)} times more nitrogen dioxide over your site than around it, which backs up the estimate.`
    : est.signal === 'weak' ? `The satellite sees only ${est.ratio.toFixed(1)} times more nitrogen dioxide over your site than around it.`
    : 'The satellite sees no more nitrogen dioxide over your site than around it.';
  return `<div class="bars" role="img" aria-label="Emissions ${prev ? `2024: ${num(prev)} t, ` : ''}2025: ${num(site.amount)} t">
      ${prev ? bar('2024', prev, 'old') : ''}${bar('2025', site.amount, 'new')}</div>
    <p>${change === null ? '' : `Change from 2024 to 2025: <b>${change > 0 ? '+' : ''}${change.toFixed(1)}%</b>. `}Climate TRACE rates this estimate "${esc(site.traceConfidence)}" confidence.</p>
    <p><b>Satellite check:</b> ${air}</p>
    <p class="muted small">${site.traceFetchedAt ? `Refreshed from Climate TRACE on ${new Date(site.traceFetchedAt).toLocaleString('en-GB')}.` : 'Figures from the Climate TRACE export of 11 November 2026.'}</p>
    <button type="button" class="btn-quiet" id="refresh">Refresh from Climate TRACE</button>
    <div class="form-msg" id="refresh-msg" role="status">${refreshNote}</div>`;
}

function render() {
  const site = UI.siteById(user.siteId);
  if (!site) { $('#main').innerHTML = '<p class="callout reject"><b>Unknown factory</b>Sign out and choose your factory again.</p>'; return; }
  const est = Logic.estimateEmissions(site);
  const issues = Logic.checkSite(site).filter((i) => i.level !== 'reject');
  const mine = (p) => p.contract && p.contract.siteId === site.id;
  const plots = Store.state.plots.filter(mine);
  const t = UI.totals(mine);
  const needed = UI.neededFor(site);
  const share = Store.shareFor(site.id);
  const covered = Math.min(UI.coveredFor(site.id), needed);
  const rows = UI.ledger(plots);
  const claims = (DATA.claims || []).filter((c) => c.siteId === site.id);

  UI.sectionNav([['glance', 'At a glance'], ['emissions', 'Emissions'], ['requirement', 'Tree requirement'], ['offers', 'Farmer offers'],
    ['contracts', 'Contracts'], ['payments', 'Payments'], ['claims', 'Claims check'], ['activity', 'Activity']]);

  $('#main').innerHTML = `
    <section id="glance" aria-labelledby="glance-h">
      <p class="eyebrow">${esc(site.name)}</p>
      <h1 id="glance-h">Your trees and payments</h1>
      <div class="figures">
        ${UI.figure(num(est.tco2) + ' t', 'carbon dioxide a year (Climate TRACE)')}
        ${UI.figure(num(covered) + ' of ' + num(needed), 'trees under contract')}
        ${UI.figure(pkr(t.paid), 'paid for trees seen alive')}
        ${UI.figure(pkr(t.held), 'held back, trees not seen')}
      </div>
      ${UI.callouts(issues)}
      <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>
    </section>

    <section id="emissions" aria-labelledby="em-h">
      <h2 id="em-h">Emissions</h2>
      ${emissions(site, est)}
    </section>

    <section id="requirement" aria-labelledby="req-h">
      <h2 id="req-h">Tree requirement</h2>
      <label class="field">Share of your yearly pollution to cover with trees: <output id="share-out">${(share * 100).toFixed(1)}%</output>
        <input id="share" type="range" min="0.1" max="10" step="0.1" value="${(share * 100).toFixed(1)}"></label>
      ${UI.requirement(site)}
      <p class="muted small">One acre of new trees takes in about ${R.tco2PerAcreYear} tonnes of carbon dioxide a year (IPCC). Trees only cover part of your pollution; cutting fuel use still matters most.</p>
    </section>

    <section id="offers" aria-labelledby="offers-h">
      <h2 id="offers-h">Farmers offering to plant for you</h2>
      ${UI.offersTable(site)}
    </section>

    <section id="contracts" aria-labelledby="contracts-h">
      <h2 id="contracts-h">Contracts</h2>
      <p>Every three months a satellite photographs each plot. You pay only for checks where the trees are seen alive (a greenness score of ${R.ndviAlive} or more).</p>
      ${plots.map((p) => UI.plotCard(p)).join('') || '<p class="muted">No contracts yet. Accept a farmer\'s offer above.</p>'}
    </section>

    <section id="payments" aria-labelledby="pay-h">
      <h2 id="pay-h">Payments</h2>
      ${rows.length ? `<div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Check</th><th scope="col">Farmer</th><th scope="col">Satellite</th>
        <th scope="col" class="num">Paid</th><th scope="col" class="num">Held back</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><th scope="row">${UI.month(r.date)}</th><td data-label="Farmer">${esc(r.plot.farmer)}, ${num(r.plot.contract.trees)} trees</td>
          <td data-label="Satellite"><span class="st-${r.st}">${UI.PASS_TEXT[r.st]}</span>${Number.isFinite(r.ndvi) ? ` (${r.ndvi.toFixed(2)})` : ''}</td>
          <td class="num" data-label="Paid">${pkr(r.released)}</td><td class="num" data-label="Held back">${pkr(r.held)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No satellite checks yet. Payments appear after the first check on a planted contract.</p>'}
    </section>

    <section id="claims" aria-labelledby="claims-h">
      <h2 id="claims-h">Claims check</h2>
      <p>Anything you publish about your emissions is compared with Climate TRACE and the air satellite. Test a statement before you publish it.</p>
      ${claims.map((c) => `<p>"${esc(c.statement)}"${Number.isFinite(c.declaredTonnes) ? ` <span class="muted small">(declared ${num(c.declaredTonnes)} t a year, example)</span>` : ''}</p>${UI.claimFindings(UI.checkClaim(c))}`).join('')}
      <form class="form" id="claim-form" novalidate>
        <div class="form-grid"><label>Declared tonnes of carbon dioxide a year (optional)<input name="declared" type="number" min="0" step="1" inputmode="numeric"></label></div>
        <label class="field-wide">Your statement<textarea name="statement" rows="3" placeholder="For example: We cut emissions by 20% this year."></textarea></label>
        <button type="submit" class="btn">Check this statement</button>
        <div class="form-msg" role="status"></div>
      </form>
    </section>

    <section id="activity" aria-labelledby="act-h">
      <h2 id="act-h">Activity</h2>
      ${UI.activity((e) => e.siteId === site.id)}
    </section>`;
}

if (user) {
  Store.ready.then(() => {
    UI.dashBar(user, 'Factory dashboard');
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
