// Overview page: the idea in four steps, the factories, and the three trust checks (C04, C07, C12). Shared pieces live in ui.js, saved data in store.js.
const $ = (s) => document.querySelector(s);

if (!window.DATA || !window.Logic || !window.Store || !window.UI) {
  $('#main').innerHTML = '<p class="callout reject"><b>The demo did not load.</b>Check that logic.js, data.js, store.js and ui.js sit next to index.html, then reload the page.</p>';
  throw new Error('Shajar Ledger: a script is missing');
}

const D = window.DATA;
const R = Logic.RULES;
const { num, pkr, esc, callouts } = UI;
// Factories table: Climate TRACE 2024 vs 2025, with its own confidence rating.
function renderFactories() {
  $('#factories').innerHTML = `<div class="table-wrap"><table class="stack">
    <thead><tr><th scope="col">Factory</th><th scope="col" class="num">2024 tCO2e</th><th scope="col" class="num">2025 tCO2e</th><th scope="col" class="num">Change</th><th scope="col">Confidence</th></tr></thead>
    <tbody>${UI.realSites.map((s) => { const ch = s.tracePrev ? ((s.amount - s.tracePrev) / s.tracePrev) * 100 : null; return `<tr>
      <th scope="row">${esc(s.name)}</th><td class="num" data-label="2024">${s.tracePrev ? num(s.tracePrev) : 'n/a'}</td><td class="num" data-label="2025">${num(s.amount)}</td>
      <td class="num" data-label="Change">${ch === null ? 'n/a' : (ch > 0 ? '+' : '−') + Math.abs(ch).toFixed(1) + '%'}</td><td data-label="Confidence">${esc(s.traceConfidence)}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="source">Source: Climate TRACE${UI.realSites[0].traceFetchedAt ? `, refreshed ${new Date(UI.realSites[0].traceFetchedAt).toLocaleDateString('en-GB')}` : ', export of 11 November 2026'}.</p>`;
}

$('#step-planting').textContent = `${pkr(R.plantingCostPerTree)} per tree.`;
$('#step-quarter').textContent = `${pkr(R.pricePerTreeYear / R.passesPerYear)} per tree a quarter, or held back.`;
UI.topNav();
UI.showTab(UI.currentTab(['c04', 'c07', 'c12']));
Store.onChange(() => { if (Store.state) renderFactories(); });
if (D.satSource === 'placeholder') {
  const note = $('#source-note');
  note.hidden = false;
  note.textContent = 'The satellite numbers on this page are placeholders. Run gee/export_data.js in Earth Engine and paste the results into data.js before showing it.';
}
Store.ready.then(() => { renderFactories(); renderC04(); renderC12(); });

function renderC04() {
$('#c04-out').innerHTML = `<div class="table-wrap"><table class="stack">
  <thead><tr><th scope="col">What went wrong</th><th scope="col">Input sent in</th><th scope="col">What the system did</th></tr></thead>
  <tbody>${Logic.C04_CASES.map((c) => {
    const issues = c.run();
    const result = issues.length ? callouts(issues) : '<p class="callout reject"><b>Not caught</b>This input was accepted.</p>';
    return `<tr><th scope="row">${c.name}</th><td data-label="Input sent in">${c.input}</td><td data-label="What the system did">${result}</td></tr>`;
  }).join('')}</tbody></table></div>
  <p class="muted small">The same checks run on every page and again on the server. Developers can run <code>node --test</code> to check every case.</p>`;
}

// C07: model vs simple rules. Numbers come from c07/results.js, written by c07/score.js.
(function renderC07() {
  const c = window.C07;
  const out = $('#c07-out');
  if (!c) {
    out.innerHTML = '<p class="callout flag"><b>Not run yet</b>The benchmark results are not on this computer yet. Run gee/c07_benchmark.js in the Earth Engine Code Editor, start the c07_points task, save the CSV from Google Drive as c07/c07_points.csv, then run node c07/score.js.</p>';
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

// C12: example claims and a live box, checked against independent sources (rules in logic.js).
function renderC12() {
  const claims = D.claims || [];
  $('#c12-out').innerHTML = claims.length ? `<div class="table-wrap"><table class="stack">
    <thead><tr><th scope="col">Who</th><th scope="col">What they said</th><th scope="col">What the other sources show</th></tr></thead>
    <tbody>${claims.map((c) => `<tr><th scope="row">${UI.claimWho(c)}</th>
      <td data-label="What they said">"${esc(c.statement)}"${Number.isFinite(c.declaredTonnes) ? `<br><span class="muted small">Declared figure: ${num(c.declaredTonnes)} t a year</span>` : ''}</td>
      <td data-label="What the other sources show">${UI.claimFindings(UI.checkClaim(c))}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">No example claims loaded.</p>';

  const sel = $('#claim-subject');
  const keep = sel.value;
  sel.innerHTML = `<optgroup label="Factories">${UI.realSites.map((s) => `<option value="site:${s.id}">${esc(s.name)}</option>`).join('')}</optgroup>
    <optgroup label="Farmers">${Store.state.plots.map((p) => `<option value="plot:${p.id}">${esc(p.farmer)}, ${esc(p.village)}</option>`).join('')}</optgroup>`;
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  setClaimLabel();
}

function setClaimLabel() {
  const factory = $('#claim-subject').value.startsWith('site:');
  $('#claim-number-label').firstChild.textContent = factory ? 'Declared tonnes of carbon dioxide a year (optional)' : 'Declared number of trees (optional)';
}

$('#claim-subject').addEventListener('change', setClaimLabel);
$('#claim-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const [kind, id] = String(data.get('subject')).split(':');
  const statement = String(data.get('statement')).trim();
  const raw = data.get('declared');
  const declared = raw === '' ? undefined : Number(raw);
  if (!statement && declared === undefined) {
    $('#claim-out').innerHTML = callouts([{ level: 'reject', msg: 'Write what they say, or enter a declared figure, then check.' }]);
    return;
  }
  if (declared !== undefined && !(declared >= 0)) {
    $('#claim-out').innerHTML = callouts([{ level: 'reject', msg: 'A declared figure cannot be below zero.' }]);
    return;
  }
  const claim = kind === 'site' ? { siteId: id, declaredTonnes: declared, statement } : { plotId: id, declaredTrees: declared, statement };
  $('#claim-out').innerHTML = UI.claimFindings(UI.checkClaim(claim));
});

Store.onChange(() => { if (Store.state) renderC12(); });
