const $ = (s) => document.querySelector(s);

if (!window.DATA || !window.Logic) {
  $('#main').innerHTML = '<p class="callout reject"><b>The demo data did not load.</b>Check that logic.js and data.js sit next to index.html, then reload the page.</p>';
  throw new Error('Shajar Ledger: data.js or logic.js missing');
}

const D = window.DATA;
const R = Logic.RULES;
const num = (n) => Math.round(n).toLocaleString('en-US');
const pkr = (n) => 'PKR ' + num(n);
const month = (iso) => new Date(iso.length === 7 ? iso + '-01' : iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const thisMonth = new Date().toISOString().slice(0, 7);
const state = { siteId: D.sites[0].id, share: 0.001 };

// Marketplace state lives in memory only, so every reload starts the demo clean.
const plots = D.plots.map((p) => ({ ...p }));
const offers = (D.offers || []).map((o) => ({ ...o, status: 'open' }));
const funding = (D.fundingRequests || []).map((f) => ({ ...f, status: 'open' }));
const flash = {};
let nextId = 1;
const plotById = (id) => plots.find((p) => p.id === id);
const siteById = (id) => D.sites.find((s) => s.id === id);
const isTestSite = (s) => s.name.startsWith('Test case');
const neededFor = (site) => Logic.treesNeeded(Logic.estimateEmissions(site), state.share);
const coveredFor = (siteId) => plots.filter((p) => p.contract && p.contract.siteId === siteId).reduce((a, p) => a + p.contract.trees, 0);

// Same scale as the legend in index.html: 0.1 bare soil to 0.6 dense trees.
function greenColor(v) {
  const t = Math.min(1, Math.max(0, (v - 0.1) / 0.5));
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${mix(139, 46)} ${mix(94, 125)} ${mix(52, 50)})`;
}

const callouts = (issues) => issues.map((i) =>
  `<p class="callout ${i.level}"><b>${i.level === 'reject' ? 'Rejected' : 'Needs checking'}</b>${i.msg}</p>`).join('');

const PASS_TEXT = {
  verified: 'Alive, paid',
  failed: 'No trees seen, held back',
  cloudy: 'Too cloudy to see, held until next photo',
  'no-imagery': 'Photo not taken yet',
  invalid: 'Faulty reading, held back',
};

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

function renderSize(est) {
  const needed = Logic.treesNeeded(est, state.share);
  $('#size-out').innerHTML = `
    <div class="answer"><strong>${num(needed)} trees</strong>
      <span>to absorb ${num(est.high * state.share)} tonnes of carbon dioxide a year</span></div>
    <p>Trees absorb slowly, so they can only cover a small share of a factory's pollution. The factory still has to cut what it burns. One acre of new trees takes in about ${R.tco2PerAcreYear} tonnes a year, and we plant ${R.typicalTreesPerAcre} trees per acre.</p>
    <p class="muted small">We count from the top of the likely range, so the trees are never credited with more than they can do.</p>`;
  return needed;
}

function offerStatus(o, p, remaining) {
  const issues = Logic.checkPlot(p);
  if (issues.length) return `<span class="result-reject">Rejected by the checks: ${issues[0].msg}</span>`;
  if (o.status === 'accepted') return `<span class="result-chosen">Accepted for ${num(p.contract.trees)} trees</span>`;
  if (o.status === 'withdrawn') return `<span class="result-taken">Withdrawn: this land is now under contract with ${esc(siteById(p.contract.siteId).name)}, so it cannot be sold twice</span>`;
  if (remaining <= 0) return '<span class="result-idle">This requirement is already covered</span>';
  return `<button type="button" class="btn" data-accept="${o.id}">Accept offer</button>`;
}

function renderMarket(site, needed) {
  const covered = coveredFor(site.id);
  const remaining = Math.max(0, needed - covered);
  const rank = (x) => (Logic.checkPlot(x.p).length ? 3 : { open: 0, accepted: 1, withdrawn: 2 }[x.o.status]);
  const list = offers.filter((o) => o.siteId === site.id).map((o) => ({ o, p: plotById(o.plotId) }))
    .sort((a, b) => rank(a) - rank(b) || Logic.scorePlot(b.p) - Logic.scorePlot(a.p));
  const best = list.find((x) => rank(x) === 0 && remaining > 0);
  const rows = list.map((x) => {
    const valid = !Logic.checkPlot(x.p).length;
    return `<tr><th scope="row">${esc(x.p.farmer)}</th><td data-label="Place">${esc(x.p.village)}</td>
      <td class="num" data-label="Land">${x.p.acres} acres</td><td class="num" data-label="Trees offered">${num(x.p.treesPlanned)}</td>
      <td class="num" data-label="Fit (of 100)">${valid ? Logic.scorePlot(x.p) : 'n/a'}${x === best ? '<span class="tag">Recommended</span>' : ''}</td>
      <td data-label="Status">${offerStatus(x.o, x.p, remaining)}</td></tr>`;
  }).join('');
  const others = D.sites.filter((s) => s.id !== site.id && !isTestSite(s))
    .map((s) => `<button type="button" class="btn-link" data-site="${s.id}">${esc(s.name)}: ${num(Math.max(0, neededFor(s) - coveredFor(s.id)))} trees still needed</button>`).join('');

  $('#match-out').innerHTML = `
    <h3>Factory requirement</h3>
    <div class="requirement">
      <p class="req-title">${esc(site.name)} needs <b>${num(needed)} trees</b> planted and kept alive.</p>
      <progress max="${needed}" value="${Math.min(covered, needed)}" aria-label="Trees covered by accepted offers"></progress>
      <p class="small">${num(Math.min(covered, needed))} trees covered by accepted offers. ${remaining ? `${num(remaining)} still needed.` : 'Fully covered.'}</p>
    </div>
    <div class="form-msg" id="market-msg" role="status" tabindex="-1">${flash.market || ''}</div>
    <h4 class="sub">Offers from farmers</h4>
    ${rows ? `<div class="table-wrap"><table class="stack">
      <thead><tr><th scope="col">Farmer</th><th scope="col">Place</th><th scope="col" class="num">Land</th>
        <th scope="col" class="num">Trees offered</th><th scope="col" class="num">Fit (of 100)</th><th scope="col">Status</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="muted small">The fit score is higher when water is close, flood risk is low, and the land has no trees on it yet. The best open offer is marked Recommended, but the factory decides.</p>`
    : '<p class="muted">No offers yet. Farmers can send one with the form below.</p>'}

    <form id="offer-form" class="form" novalidate>
      <h4 class="sub">Offer your land to ${esc(site.name)}</h4>
      <div class="form-grid">
        <label>Farmer name<input name="farmer" autocomplete="name" required></label>
        <label>Place<input name="village" placeholder="Village, district" required></label>
        <label>Land in acres<input name="acres" type="number" min="0" step="0.5" inputmode="decimal" required></label>
        <label>Trees you can plant<input name="trees" type="number" min="0" step="1" inputmode="numeric" required></label>
        <label>Distance to water in km<input name="canalKm" type="number" min="0" step="0.1" inputmode="decimal" required></label>
        <label>Flood risk<select name="flood"><option value="0.1">Low</option><option value="0.4">Medium</option><option value="0.7">High</option></select></label>
      </div>
      <label class="check"><input type="checkbox" name="needFunding"> I need money for saplings and planting</label>
      <label class="field-inline">Ask for it from<select name="wants"><option value="investor">An investor</option><option value="bank">A bank loan</option></select></label>
      <p class="muted small">At most ${num(R.maxTreesPerAcre)} trees per acre. We plan about ${R.typicalTreesPerAcre}. Planting costs about ${pkr(R.plantingCostPerTree)} per tree.</p>
      <button type="submit" class="btn">Send offer</button>
      <div class="form-msg" id="offer-msg" role="status"></div>
    </form>
    ${others ? `<p class="small others"><b>Other factories looking for farmers:</b></p><div class="others-list">${others}</div>` : ''}

    <h3 id="funding">Farmers asking for funding</h3>
    <p>Planting costs money before the factory pays anything. Farmers who need it ask here, and an investor or a bank pays for the saplings. In return the investor gets ${100 - R.farmerShare * 100}% of the payments, or the bank is repaid from them.</p>
    ${renderFunding()}`;
}

function renderFunding() {
  if (!funding.length) return '<p class="muted">No funding requests yet. A farmer can ask for funding when sending an offer above.</p>';
  return funding.map((f) => {
    const p = plotById(f.plotId);
    const amount = Logic.fundingNeeded(p.treesPlanned);
    const deal = p.contract ? `Under contract with ${esc(siteById(p.contract.siteId)?.name || 'a factory')} since ${month(p.contract.since)}.`
      : 'Offered to a factory, not accepted yet.';
    const body = f.status === 'funded'
      ? `<p class="result-chosen">Funded by ${esc(p.funderName)} (${p.financier === 'bank' ? 'bank loan' : 'investor'}).</p>`
      : `<form class="fund-form" data-fund="${f.id}" novalidate>
          <label>Your name or bank<input name="funder" required></label>
          <label>Fund as<select name="type">
            <option value="investor"${f.wants === 'investor' ? ' selected' : ''}>Investor</option>
            <option value="bank"${f.wants === 'bank' ? ' selected' : ''}>Bank</option></select></label>
          <button type="submit" class="btn">Fund ${pkr(amount)}</button>
          <div class="form-msg" role="status">${flash['fund-' + f.id] || ''}</div>
        </form>`;
    return `<article class="request"><h4>${esc(p.farmer)}, ${esc(p.village)}</h4>
      <p>${p.acres} acres, ${num(p.treesPlanned)} trees. Needs <b>${pkr(amount)}</b> for saplings and planting, and is asking for ${f.wants === 'bank' ? 'a bank loan' : 'an investor'}. ${deal}</p>
      ${body}</article>`;
  }).join('');
}

function renderVerify(site) {
  const totals = { investor: { invested: 0, received: 0, held: 0 }, bank: { lent: 0, repaid: 0 }, farmers: 0 };
  const commit = (type, amount) => { if (type === 'investor') totals.investor.invested += amount; else if (type === 'bank') totals.bank.lent += amount; };
  const paidBy = (plot) => (plot.financier === 'bank' ? 'a bank loan' : 'an investor');

  const running = plots.filter((p) => p.contract && !p.contract.fromMarket).map((plot) => {
    const trees = plot.contract.trees;
    let paid = 0, held = 0;
    const items = plot.passes.map((pass) => {
      const st = Logic.verifyPass(pass, D.latestImagery);
      const pay = Logic.payout(trees, st);
      paid += pay.released; held += pay.held;
      totals.farmers += pay.farmer;
      if (plot.financier === 'investor') { totals.investor.received += pay.financier; totals.investor.held += pay.held * (1 - R.farmerShare); }
      else totals.bank.repaid += pay.financier;
      const style = st === 'verified' || st === 'failed' ? ` style="background:${greenColor(pass.ndvi)}"` : '';
      const label = st === 'cloudy' ? 'Cloud' : st === 'no-imagery' ? 'Not yet' : st === 'invalid' ? 'Bad data' : pass.ndvi.toFixed(2);
      const money = pay.released ? pkr(pay.released) : pay.held ? `${pkr(pay.held)} held` : '';
      return `<li class="pass"><div class="tile ${st}"${style}>${label}</div>
        <span class="when">${month(pass.date)}</span><span class="st-${st}">${PASS_TEXT[st]}</span><span>${money}</span></li>`;
    }).join('');
    commit(plot.financier, trees * R.plantingCostPerTree);
    return `<article class="plot"><h4>${esc(plot.farmer)}</h4>
      <p class="muted">${num(trees)} trees in ${esc(plot.village)}, planted ${month(plot.contract.since)}. Planting paid by ${paidBy(plot)}.</p>
      <ul class="passes">${items}</ul>
      <p class="totals"><span>Paid so far: <span class="paid">${pkr(paid)}</span></span><span>Held back: <span class="${held ? 'held' : ''}">${pkr(held)}</span></span></p></article>`;
  }).join('');

  for (const f of funding) if (f.status === 'funded') { const p = plotById(f.plotId); commit(p.financier, Logic.fundingNeeded(p.treesPlanned)); }

  // New contracts are not planted yet, so their photos show the land before planting.
  const fresh = plots.filter((p) => p.contract && p.contract.fromMarket && p.contract.siteId === site.id).map((plot) => {
    const seen = (plot.passes || []).filter((p) => ['verified', 'failed'].includes(Logic.verifyPass(p, D.latestImagery)));
    const last = seen[seen.length - 1];
    const before = !last ? 'There is no satellite photo of this land yet. The first check comes with the next photo after planting.'
      : last.ndvi < R.ndviAlive
        ? `Today this land scores ${last.ndvi.toFixed(2)}, which is bare soil or crops. When the new trees grow, the score will rise, and that rise proves the trees are new.`
        : `Today this land already scores ${last.ndvi.toFixed(2)}. Check that these are new trees before any payment.`;
    const money = plot.financier ? `Planting paid by ${esc(plot.funderName)} (${plot.financier === 'bank' ? 'bank loan' : 'investor'}).`
      : 'Planting is not funded yet. The farmer can ask for funding in step 3.';
    return `<article class="plot"><h4>${esc(plot.farmer)}</h4>
      <p class="muted">${num(plot.contract.trees)} trees to plant in ${esc(plot.village)}. ${money}</p><p>${before}</p></article>`;
  }).join('');

  $('#verify-out').innerHTML = `
    <h3>Contracts already running</h3>
    ${running || '<p class="muted">No contracts are running yet. They appear here after the first planting.</p>'}
    <p class="muted small">A plot counts as alive at a score of ${R.ndviAlive} or more. Each paid check sends ${R.farmerShare * 100}% to the farmer and the rest to whoever paid for planting. Latest satellite photo: ${new Date(D.latestImagery).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    <h3>New contracts for ${esc(site.name)}</h3>
    ${fresh || '<p class="muted">None yet. Accept a farmer\'s offer in step 3 and the contract appears here.</p>'}`;
  return totals;
}

function renderFinance(t) {
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
  const site = siteById(state.siteId);
  const issues = Logic.checkSite(site);
  const est = Logic.estimateEmissions(site);
  $('#share-out').textContent = (state.share * 100).toFixed(1) + '%';
  renderMeasure(site, issues, est);
  if (issues.some((i) => i.level === 'reject')) {
    const msg = '<p class="muted">This input was rejected in step 1, so nothing is worked out from it. Pick a real factory to continue.</p>';
    ['#size-out', '#match-out', '#verify-out', '#finance-out'].forEach((id) => { $(id).innerHTML = msg; });
    return;
  }
  renderMarket(site, renderSize(est));
  renderFinance(renderVerify(site));
  for (const k of Object.keys(flash)) delete flash[k];
}

function selectSite(id) {
  state.siteId = id;
  $('#site').value = id;
  render();
}

document.addEventListener('click', (e) => {
  const accept = e.target.closest('[data-accept]');
  if (accept) {
    const offer = offers.find((o) => o.id === accept.dataset.accept);
    const plot = plotById(offer.plotId);
    const site = siteById(offer.siteId);
    const trees = Logic.acceptOffer(offer, plot, offers, neededFor(site) - coveredFor(site.id), thisMonth);
    flash.market = trees
      ? `<p class="callout ok"><b>Offer accepted</b>${esc(plot.farmer)} will plant ${num(trees)} trees for ${esc(site.name)}. The contract now shows in step 4.</p>`
      : '<p class="callout flag"><b>Not accepted</b>This offer is no longer open, or the requirement is already covered.</p>';
    render();
    $('#market-msg').focus();
    return;
  }
  const other = e.target.closest('[data-site]');
  if (other) { selectSite(other.dataset.site); $('#match-h').scrollIntoView(); }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  const msg = form.querySelector('.form-msg');
  if (form.id === 'offer-form') {
    const toNum = (k) => (data.get(k) === '' ? NaN : Number(data.get(k)));
    const plot = {
      id: 'u' + nextId++, farmer: String(data.get('farmer')).trim(), village: String(data.get('village')).trim(),
      acres: toNum('acres'), treesPlanned: toNum('trees'), canalKm: toNum('canalKm'),
      floodRisk: Number(data.get('flood')), treeCoverFraction: 0, passes: [],
    };
    const issues = Logic.validateOffer(plot);
    if (issues.length) { msg.innerHTML = callouts(issues); return; } // keep what they typed
    plots.push(plot);
    offers.push({ id: 'o' + plot.id, siteId: state.siteId, plotId: plot.id, status: 'open' });
    if (data.get('needFunding')) funding.push({ id: 'f' + plot.id, plotId: plot.id, wants: data.get('wants'), status: 'open' });
    flash.market = `<p class="callout ok"><b>Offer sent</b>${esc(plot.farmer)}'s offer of ${num(plot.treesPlanned)} trees is now in the list${data.get('needFunding') ? ', and the funding request is under "Farmers asking for funding"' : ''}.</p>`;
    render();
    $('#market-msg').focus();
  } else if (form.dataset.fund) {
    const f = funding.find((x) => x.id === form.dataset.fund);
    const name = String(data.get('funder')).trim();
    if (!name) { msg.innerHTML = callouts([{ level: 'reject', msg: 'Enter your name, or your bank\'s name.' }]); return; }
    const p = plotById(f.plotId);
    p.financier = data.get('type') === 'bank' ? 'bank' : 'investor';
    p.funderName = name;
    f.status = 'funded';
    render();
    $('#funding').scrollIntoView();
  }
});

const option = (s) => `<option value="${s.id}">${s.name.replace(/^Test case: /, '')}</option>`;
$('#site').innerHTML =
  `<optgroup label="Real factories">${D.sites.filter((s) => !isTestSite(s)).map(option).join('')}</optgroup>` +
  `<optgroup label="Bad inputs (should be stopped)">${D.sites.filter(isTestSite).map(option).join('')}</optgroup>`;
$('#site').addEventListener('change', (e) => selectSite(e.target.value));
$('#share').addEventListener('input', (e) => { state.share = e.target.value / 100; render(); });
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
