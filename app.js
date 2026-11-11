// Overview page: the whole story in one scroll. Shared pieces live in ui.js, saved data in store.js.
const $ = (s) => document.querySelector(s);

if (!window.DATA || !window.Logic || !window.Store || !window.UI) {
  $('#main').innerHTML = '<p class="callout reject"><b>The demo did not load.</b>Check that logic.js, data.js, store.js and ui.js sit next to index.html, then reload the page.</p>';
  throw new Error('Shajar Ledger: a script is missing');
}

const D = window.DATA;
const R = Logic.RULES;
const { num, pkr, esc, callouts } = UI;
const state = { siteId: D.sites[0].id };

function renderMeasure(site, issues, est) {
  const fuel = R.fuelFactors[site.fuel];
  const source = site.fuel === 'reported_t'
    ? `Estimate from Climate TRACE, 2025. Climate TRACE rates its own estimate "${site.traceConfidence}" confidence.`
    : `Worked out from the ${fuel.label.replace(' a year, declared', '')} the factory says it burns each year.`;
  const air = {
    strong: `The air above this site has ${est.ratio?.toFixed(1)} times more nitrogen dioxide than the area around it. Nitrogen dioxide comes from burning fuel, so the satellite backs up the estimate.`,
    weak: `The air above this site has only ${est.ratio?.toFixed(1)} times more nitrogen dioxide than the area around it, so the satellite only weakly backs up the estimate.`,
    none: 'The satellite sees no more nitrogen dioxide here than in the area around it, so it cannot back up the estimate.',
  }[est.signal];
  const blocked = issues.some((i) => i.level === 'reject');
  $('#measure-out').innerHTML = `
    ${callouts(issues)}
    ${blocked ? '' : `
      <div class="answer"><strong>${num(est.tco2)} tonnes</strong>
        <span>of carbon dioxide a year, likely between ${num(est.low)} and ${num(est.high)}</span></div>
      <p class="muted small">${source}</p>
      <p><b>Satellite check:</b> ${air}</p>`}`;
}

function renderSize(site, est) {
  const needed = UI.neededFor(site);
  $('#size-out').innerHTML = `
    <div class="answer"><strong>${num(needed)} trees</strong>
      <span>to absorb ${num(est.high * Store.shareFor(site.id))} tonnes of carbon dioxide a year</span></div>
    <p>Trees absorb slowly, so they can only cover a small share of a factory's pollution. The factory still has to cut what it burns. One acre of new trees takes in about ${R.tco2PerAcreYear} tonnes a year, and we plant ${R.typicalTreesPerAcre} trees per acre.</p>
    <p class="muted small">We count from the top of the likely range, so the trees are never credited with more than they can do.</p>`;
}

function renderMarket(site) {
  const others = UI.realSites.filter((s) => s.id !== site.id)
    .map((s) => `<button type="button" class="btn-link" data-site="${s.id}">${esc(s.name)}: ${num(Math.max(0, UI.neededFor(s) - UI.coveredFor(s.id)))} trees still needed</button>`).join('');
  $('#match-out').innerHTML = `
    <h3>Factory requirement</h3>
    ${UI.requirement(site)}
    <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>
    <h4 class="sub">Offers from farmers</h4>
    ${UI.offersTable(site)}
    <h4 class="sub">Offer your land to ${esc(site.name)}</h4>
    ${UI.offerForm({ siteId: site.id })}
    ${others ? `<p class="small others"><b>Other factories looking for farmers:</b></p><div class="others-list">${others}</div>` : ''}
    <h3 id="funding">Farmers asking for funding</h3>
    <p>Planting costs money before the factory pays anything. Farmers who need it ask here, and an investor or a bank pays for the saplings. In return the investor gets ${100 - R.farmerShare * 100}% of the payments, or the bank is repaid from them.</p>
    ${UI.fundingList(Store.state.funding)}`;
}

function renderVerify(site) {
  const running = Store.state.plots.filter(UI.isRunning).map((p) => UI.plotCard(p, { showFactory: true })).join('');
  const fresh = Store.state.plots.filter((p) => p.contract && p.contract.fromMarket && p.contract.siteId === site.id).map((p) => UI.plotCard(p)).join('');
  $('#verify-out').innerHTML = `
    <h3>Contracts already running</h3>
    ${running || '<p class="muted">No contracts are running yet. They appear here after the first planting.</p>'}
    <p class="muted small">A plot counts as alive at a score of ${R.ndviAlive} or more. Each paid check sends ${R.farmerShare * 100}% to the farmer and the rest to whoever paid for planting. Latest satellite photo: ${new Date(D.latestImagery).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    <h3>New contracts for ${esc(site.name)}</h3>
    ${fresh || '<p class="muted">None yet. Accept a farmer\'s offer in step 3 and the contract appears here.</p>'}`;
}

function renderFinance() {
  const t = UI.totals();
  $('#finance-out').innerHTML = `
    <div><h3>Investors</h3><dl>
      <dt>Paid for planting</dt><dd>${pkr(t.investor.invested)}</dd>
      <dt>Received so far</dt><dd>${pkr(t.investor.received)}</dd>
      <dt>Waiting on trees to be seen</dt><dd>${pkr(t.investor.held)}</dd></dl></div>
    <div><h3>Banks</h3><dl>
      <dt>Lent to farmers</dt><dd>${pkr(t.bank.lent)}</dd>
      <dt>Repaid so far</dt><dd>${pkr(t.bank.repaid)}</dd>
      <dt>Still owed</dt><dd>${pkr(Math.max(0, t.bank.lent - t.bank.repaid))}</dd></dl></div>
    <div><h3>Farmers</h3><dl>
      <dt>Earned so far</dt><dd>${pkr(t.farmers)}</dd></dl></div>`;
}

function render() {
  const site = UI.siteById(state.siteId);
  const issues = Logic.checkSite(site);
  const est = Logic.estimateEmissions(site);
  const share = Store.shareFor(site.id);
  $('#share').value = (share * 100).toFixed(1);
  $('#share-out').textContent = (share * 100).toFixed(1) + '%';
  renderMeasure(site, issues, est);
  if (issues.some((i) => i.level === 'reject')) {
    const msg = '<p class="muted">This input was rejected in step 1, so nothing is worked out from it. Pick a real factory to continue.</p>';
    ['#size-out', '#match-out', '#verify-out', '#finance-out'].forEach((id) => { $(id).innerHTML = msg; });
    return;
  }
  renderSize(site, est);
  renderMarket(site);
  renderVerify(site);
  renderFinance();
}

UI.topNav('index.html');
UI.bindActions();
Store.onChange(render);

document.addEventListener('click', (e) => {
  const other = e.target.closest('[data-site]');
  if (!other) return;
  state.siteId = other.dataset.site;
  $('#site').value = state.siteId;
  render();
  $('#match-h').scrollIntoView();
});

const option = (s) => `<option value="${s.id}">${s.name.replace(/^Test case: /, '')}</option>`;
$('#site').innerHTML =
  `<optgroup label="Real factories">${D.sites.filter((s) => !UI.isTestSite(s)).map(option).join('')}</optgroup>` +
  `<optgroup label="Bad inputs (should be stopped)">${D.sites.filter(UI.isTestSite).map(option).join('')}</optgroup>`;
$('#site').addEventListener('change', (e) => { state.siteId = e.target.value; render(); });
$('#share').addEventListener('change', (e) => Store.setShare(state.siteId, e.target.value / 100));
$('#share').addEventListener('input', (e) => { $('#share-out').textContent = Number(e.target.value).toFixed(1) + '%'; });
if (D.satSource === 'placeholder') {
  const note = $('#source-note');
  note.hidden = false;
  note.textContent = 'The satellite numbers on this page are placeholders. Run gee/export_data.js in Earth Engine and paste the results into data.js before showing it.';
}
render();

$('#c04-out').innerHTML = `<div class="table-wrap"><table class="stack">
  <thead><tr><th scope="col">What went wrong</th><th scope="col">Input sent in</th><th scope="col">What the system did</th></tr></thead>
  <tbody>${Logic.C04_CASES.map((c) => {
    const issues = c.run();
    const result = issues.length ? callouts(issues) : '<p class="callout reject"><b>Not caught</b>This input was accepted.</p>';
    return `<tr><th scope="row">${c.name}</th><td data-label="Input sent in">${c.input}</td><td data-label="What the system did">${result}</td></tr>`;
  }).join('')}</tbody></table></div>
  <p class="muted small">The same checks run in the steps above. Try the bad inputs in the factory list in step 1, see Rafiq Chandio's offer of 2,500 trees per acre rejected in step 3, or type an impossible offer into the form yourself. Developers can run <code>node --test</code> to check every case.</p>`;

// C07: model vs simple rules. Numbers come from c07/results.js, written by c07/score.js.
(function renderC07() {
  const c = window.C07;
  const out = $('#c07-out');
  if (!c) {
    out.innerHTML = '<p class="callout flag"><b>Not run yet</b>The benchmark results are not on this computer yet. Run gee/c07_benchmark.js and gee/c07_score.js in Earth Engine, save the output as c07/gee_output.json, then run node c07/score.js.</p>';
    return;
  }
  const f = (v) => (v == null ? 'n/a' : v.toFixed(2));
  const pct = (v) => (v == null ? 'n/a' : (v >= 0 ? '+' : '') + Math.round(v) + '%');
  const h = c.hand;
  const target = 15;
  const passTest = c.test.gainOverSinglePhotoPct >= target && c.test.gainOverYearlyAveragePct >= target;
  out.innerHTML = `
    <div class="table-wrap"><table class="stack">
      <thead><tr><th scope="col">Method</th><th scope="col" class="num">Score on ${num(c.sizes.test)} test points</th>
        <th scope="col" class="num">Score on ${h ? num(h.labelled) : 0} hand-checked points</th></tr></thead>
      <tbody>
        <tr><th scope="row">One photo, greenness above a line (best line, average of the four seasons)</th>
          <td class="num" data-label="Test points">${f(c.test.singlePhotoTuned)}</td><td class="num" data-label="Hand-checked">${f(h && h.singlePhotoTuned)}</td></tr>
        <tr><th scope="row">Average greenness over the year, above a line</th>
          <td class="num" data-label="Test points">${f(c.test.yearlyAverage.f1)}</td><td class="num" data-label="Hand-checked">${f(h && h.yearlyAverage)}</td></tr>
        <tr><th scope="row">Model using a whole year of photos (random forest)</th>
          <td class="num" data-label="Test points"><b>${f(c.test.randomForest)}</b></td><td class="num" data-label="Hand-checked"><b>${f(h && h.randomForest)}</b></td></tr>
        <tr><th scope="row">Model's gain over one photo</th>
          <td class="num" data-label="Test points">${pct(c.test.gainOverSinglePhotoPct)}</td><td class="num" data-label="Hand-checked">${pct(h && h.gainOverSinglePhotoPct)}</td></tr>
        <tr><th scope="row">Model's gain over the yearly average</th>
          <td class="num" data-label="Test points">${pct(c.test.gainOverYearlyAveragePct)}</td><td class="num" data-label="Hand-checked">${pct(h && h.gainOverYearlyAveragePct)}</td></tr>
      </tbody></table></div>
    <p class="callout ${passTest ? 'ok' : 'flag'}"><b>${passTest ? `Passes the ${target}% bar` : `Below the ${target}% bar`}</b>${passTest
      ? `On the test points the model scores at least ${target}% higher than both simple rules.`
      : `On the test points the model does not beat both simple rules by ${target}%. We report the real result instead of tuning until it passes.`}</p>
    <p class="muted small">The score is F1: 1 means every tree found with no false alarms, 0 means none found. The simple rules get the line that worked best on the training points, so they are not set up to lose. ${c.sizes.train} points trained the model; the test points were never seen during training.</p>
    <p class="muted small"><b>Limits.</b> The answer key is ESA WorldCover 2021, a published map that is itself about 77% accurate worldwide. ${h ? `The ${h.labelled} hand-checked points were labelled by Claude (an AI assistant) looking at sharp Esri satellite photos, without seeing any method's answer, and WorldCover agreed with those labels ${Math.round(h.worldCoverAgreement * 100)}% of the time. Your team can check the same points at c07/label.html.` : 'Hand-checked points have not been labelled yet.'}</p>`;
})();
