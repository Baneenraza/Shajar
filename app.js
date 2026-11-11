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
const state = { siteId: D.sites[0].id, share: 0.001 };

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
    strong: `The air above this site has ${est.ratio.toFixed(1)} times more nitrogen dioxide than the area around it. Nitrogen dioxide comes from burning fuel, so the satellite backs up the estimate.`,
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
  $('#share-out').textContent = (state.share * 100).toFixed(1) + '%';
  $('#size-out').innerHTML = `
    <div class="answer"><strong>${num(needed)} trees</strong>
      <span>to absorb ${num(est.high * state.share)} tonnes of carbon dioxide a year</span></div>
    <p>Trees absorb slowly, so they can only cover a small share of a factory's pollution. The factory still has to cut what it burns. One acre of new trees takes in about ${R.tco2PerAcreYear} tonnes a year, and we plant ${R.typicalTreesPerAcre} trees per acre.</p>
    <p class="muted small">We count from the top of the likely range, so the trees are never credited with more than they can do.</p>`;
  return needed;
}

function renderMatch(needed) {
  const match = Logic.matchPlots(D.plots, needed);
  const chosen = new Map(match.chosen.map((c) => [c.plot.id, c.trees]));
  const rows = D.plots.map((p) => {
    const issues = Logic.checkPlot(p);
    const trees = chosen.get(p.id);
    let result;
    if (issues.length) result = `<span class="result-reject">Rejected: ${issues[0].msg}</span>`;
    else if (p.contract) result = `<span class="result-taken">Already in a contract since ${month(p.contract.since)}, so it cannot be sold twice</span>`;
    else if (trees) result = `<span class="result-chosen">Chosen for ${num(trees)} trees</span>`;
    else result = '<span class="result-idle">Not needed this time</span>';
    const fit = issues.length || p.contract ? '' : Logic.scorePlot(p);
    return `<tr><th scope="row">${p.farmer}</th><td data-label="Place">${p.village}</td><td class="num" data-label="Land">${p.acres} acres</td>
      <td class="num" data-label="Trees offered">${num(p.treesPlanned)}</td><td class="num" data-label="Fit (of 100)">${fit || 'n/a'}</td><td data-label="Result">${result}</td></tr>`;
  }).join('');
  $('#match-out').innerHTML = `
    <div class="table-wrap"><table class="stack">
      <thead><tr><th scope="col">Farmer</th><th scope="col">Place</th><th scope="col" class="num">Land</th>
        <th scope="col" class="num">Trees offered</th><th scope="col" class="num">Fit (of 100)</th><th scope="col">Result</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="muted small">The fit score is higher when water is close, flood risk is low, and the land has no trees on it yet. The best plots are filled first.</p>
    ${match.shortfall ? `<p class="callout flag"><b>Not enough land</b>${num(match.shortfall)} more trees need a home, about ${num(Math.ceil(match.shortfall / R.typicalTreesPerAcre))} more acres. Lower the share in step 2 or add farmers.</p>` : ''}`;
  return match;
}

function renderVerify(match) {
  const totals = { investor: { invested: 0, received: 0, held: 0 }, bank: { lent: 0, repaid: 0 }, farmers: 0 };
  const fund = (plot, trees) => {
    const cost = trees * R.plantingCostPerTree;
    if (plot.financier === 'investor') totals.investor.invested += cost; else totals.bank.lent += cost;
  };
  const paidBy = (plot) => (plot.financier === 'bank' ? 'a bank loan' : 'an investor');

  const running = D.plots.filter((p) => p.contract).map((plot) => {
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
    fund(plot, trees);
    return `<article class="plot"><h4>${plot.farmer}</h4>
      <p class="muted">${num(trees)} trees in ${plot.village}, planted ${month(plot.contract.since)}. Planting paid by ${paidBy(plot)}.</p>
      <ul class="passes">${items}</ul>
      <p class="totals"><span>Paid so far: <span class="paid">${pkr(paid)}</span></span><span>Held back: <span class="${held ? 'held' : ''}">${pkr(held)}</span></span></p></article>`;
  }).join('');

  // New plots are not planted yet, so their photos show the land before planting.
  const fresh = match.chosen.map(({ plot, trees }) => {
    fund(plot, trees);
    const seen = plot.passes.filter((p) => ['verified', 'failed'].includes(Logic.verifyPass(p, D.latestImagery)));
    const last = seen[seen.length - 1];
    const before = !last ? 'There is no clear photo of this land yet.'
      : last.ndvi < R.ndviAlive
        ? `Today this land scores ${last.ndvi.toFixed(2)}, which is bare soil or crops. When the new trees grow, the score will rise, and that rise proves the trees are new.`
        : `Today this land already scores ${last.ndvi.toFixed(2)}. Check that these are new trees before any payment.`;
    return `<article class="plot"><h4>${plot.farmer}</h4>
      <p class="muted">${num(trees)} trees to plant in ${plot.village}. Planting paid by ${paidBy(plot)}.</p><p>${before}</p></article>`;
  }).join('');

  $('#verify-out').innerHTML = `
    <h3>Contracts already running</h3>
    ${running || '<p class="muted">No contracts are running yet. They appear here after the first planting.</p>'}
    <p class="muted small">A plot counts as alive at a score of ${R.ndviAlive} or more. Each paid check sends ${R.farmerShare * 100}% to the farmer and the rest to whoever paid for planting. Latest satellite photo: ${new Date(D.latestImagery).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    <h3>New contracts from this match</h3>
    ${fresh || '<p class="muted">No new land is needed for this share.</p>'}`;
  return totals;
}

function renderFinance(t) {
  $('#finance-out').innerHTML = `
    <div><h3>Investor</h3><dl>
      <dt>Paid for planting</dt><dd>${pkr(t.investor.invested)}</dd>
      <dt>Received so far</dt><dd>${pkr(t.investor.received)}</dd>
      <dt>Waiting on trees to be seen</dt><dd>${pkr(t.investor.held)}</dd></dl></div>
    <div><h3>Bank</h3><dl>
      <dt>Lent to farmers</dt><dd>${pkr(t.bank.lent)}</dd>
      <dt>Repaid so far</dt><dd>${pkr(t.bank.repaid)}</dd>
      <dt>Still owed</dt><dd>${pkr(Math.max(0, t.bank.lent - t.bank.repaid))}</dd></dl></div>
    <div><h3>Farmers</h3><dl>
      <dt>Earned so far</dt><dd>${pkr(t.farmers)}</dd></dl></div>`;
}

function render() {
  const site = D.sites.find((s) => s.id === state.siteId);
  const issues = Logic.checkSite(site);
  const est = Logic.estimateEmissions(site);
  renderMeasure(site, issues, est);
  if (issues.some((i) => i.level === 'reject')) {
    const msg = '<p class="muted">This input was rejected in step 1, so nothing is worked out from it. Pick a real factory to continue.</p>';
    ['#size-out', '#match-out', '#verify-out', '#finance-out'].forEach((id) => { $(id).innerHTML = msg; });
    $('#share-out').textContent = (state.share * 100).toFixed(1) + '%';
    return;
  }
  const needed = renderSize(est);
  const match = renderMatch(needed);
  renderFinance(renderVerify(match));
}

const option = (s) => `<option value="${s.id}">${s.name.replace(/^Test case: /, '')}</option>`;
$('#site').innerHTML =
  `<optgroup label="Real factories">${D.sites.filter((s) => !s.name.startsWith('Test case')).map(option).join('')}</optgroup>` +
  `<optgroup label="Bad inputs (should be stopped)">${D.sites.filter((s) => s.name.startsWith('Test case')).map(option).join('')}</optgroup>`;
$('#site').addEventListener('change', (e) => { state.siteId = e.target.value; render(); });
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
  <p class="muted small">The same checks run in the steps above. Try the bad inputs in the factory list in step 1, and see the farmer who claims 2,500 trees on one acre in step 3. Developers can run <code>node --test</code> to check every case.</p>`;
