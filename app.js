const D = window.DATA;
const R = Logic.RULES;
const $ = (s) => document.querySelector(s);
const num = (n) => Math.round(n).toLocaleString('en-US');
const pkr = (n) => 'PKR ' + num(n);
const state = { siteId: D.sites[0].id, share: 0.001 };

const STATUS_TEXT = {
  verified: 'Trees alive, paid',
  failed: 'Trees not found, held',
  cloudy: 'Too cloudy, held until next pass',
  'no-imagery': 'No image yet',
  invalid: 'Faulty reading, held',
};

function ndviColor(v) {
  const t = Math.min(1, Math.max(0, (v - 0.2) / 0.3));
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${mix(139, 46)}, ${mix(94, 125)}, ${mix(52, 50)})`;
}

const issuesHtml = (issues) => issues.map((i) =>
  `<p class="issue ${i.level}"><b>${i.level === 'reject' ? 'Rejected.' : 'Low confidence.'}</b>${i.msg}</p>`).join('');

function render() {
  const site = D.sites.find((s) => s.id === state.siteId);
  const siteIssues = Logic.checkSite(site);
  const blocked = siteIssues.some((i) => i.level === 'reject');
  const est = Logic.estimateEmissions(site);
  const fuel = R.fuelFactors[site.fuel];

  const signalText = {
    strong: `The satellite sees ${est.ratio?.toFixed(1)}× more NO2 here than in the surrounding area, which supports the reported emissions. Range ±15%.`,
    weak: `The satellite sees only ${est.ratio?.toFixed(1)}× more NO2 here than around it. Range ±30%.`,
    none: 'The satellite sees no clear NO2 signal above the surrounding area. Range ±50%.',
  }[est.signal];

  $('#measure-out').innerHTML = `
    <p class="muted">${site.lat.toFixed(2)}° N, ${site.lon.toFixed(2)}° E · ${num(site.amount)} ${fuel.label}${site.traceConfidence ? ` (${site.traceConfidence} confidence)` : ''}</p>
    ${issuesHtml(siteIssues)}
    ${blocked ? '' : `
      <div class="figure">
        <div><strong>${num(est.tco2)} t</strong><span>CO2e a year, estimated</span></div>
        <div><strong>${num(est.low)}–${num(est.high)} t</strong><span>likely range</span></div>
      </div>
      <p>${signalText}</p>
      <p class="muted">The satellite cannot see CO2 from one chimney. It sees NO2, a sign of burning fuel, so the reported figure is checked against the satellite, not measured by it.</p>`}`;

  $('#share-out').textContent = (state.share * 100).toFixed(1) + '%';
  const hold = (id) => { $(id).innerHTML = '<p class="muted">Choose a site that passes the checks in step 1.</p>'; };
  if (blocked) { ['#size-out', '#match-out', '#verify-out', '#finance-out'].forEach(hold); return; }

  const needed = Logic.treesNeeded(est, state.share);
  $('#size-out').innerHTML = `
    <div class="figure">
      <div><strong>${num(needed)}</strong><span>trees for one year of offset</span></div>
      <div><strong>${num(est.high * state.share)} t</strong><span>CO2 to offset</span></div>
    </div>
    <p class="muted">Sized against the top of the range so the offset is never overstated. Uses ${R.tco2PerAcreYear} t CO2 per acre per year, the IPCC 2019 default for plantations in dry subtropical Asia (range 1 to 12 t dry matter per hectare). At ${R.typicalTreesPerAcre} trees per acre that is about ${R.kgCo2PerTreeYear.toFixed(0)} kg per tree.</p>`;

  const match = Logic.matchPlots(D.plots, needed);
  const assigned = new Map(match.chosen.map((c) => [c.plot.id, c.trees]));
  const rows = D.plots.map((p) => {
    const issues = Logic.checkPlot(p);
    const trees = assigned.get(p.id);
    const cls = issues.length || p.contract ? 'rejected' : trees ? 'chosen' : '';
    const status = issues.length ? issues[0].msg
      : p.contract ? `Already under contract since ${p.contract.since}, so it cannot be sold again`
      : trees ? `Matched: ${num(trees)} trees` : 'Not needed';
    return `<tr class="${cls}"><td>${p.farmer}<br><span class="muted">${p.village}</span></td>
      <td class="num">${p.acres}</td><td class="num">${num(p.treesPlanned)}</td>
      <td class="num">${issues.length || p.contract ? '–' : Logic.scorePlot(p)}</td><td>${status}</td></tr>`;
  }).join('');
  $('#match-out').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Farmer</th><th class="num">Acres</th><th class="num">Trees offered</th><th class="num">Fit score</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="muted">Fit score: water nearby, low flood risk, and land that is not already forest. Each plot is tied to one contract, so no tree is counted twice.</p>
    ${match.shortfall ? `<p class="issue flag"><b>Short.</b>${num(match.shortfall)} trees still need land, about ${num(Math.ceil(match.shortfall / R.typicalTreesPerAcre))} more acres.</p>` : ''}`;

  const totals = { investor: { invested: 0, received: 0, held: 0 }, bank: { lent: 0, repaid: 0, held: 0 }, farmers: 0 };
  const fund = (plot, trees) => {
    const cost = trees * R.plantingCostPerTree;
    if (plot.financier === 'investor') totals.investor.invested += cost; else totals.bank.lent += cost;
  };
  const paidBy = (plot) => `planting paid by ${plot.financier === 'bank' ? 'a bank loan' : 'an investor'}`;
  const running = D.plots.filter((p) => p.contract).map((plot) => {
    const trees = plot.contract.trees;
    let released = 0, held = 0;
    const tiles = plot.passes.map((pass) => {
      const st = Logic.verifyPass(pass, D.latestImagery);
      const pay = Logic.payout(trees, st);
      released += pay.released; held += pay.held;
      totals.farmers += pay.farmer;
      if (plot.financier === 'investor') { totals.investor.received += pay.financier; totals.investor.held += pay.held * (1 - R.farmerShare); }
      else { totals.bank.repaid += pay.financier; totals.bank.held += pay.held * (1 - R.farmerShare); }
      const bg = st === 'verified' || st === 'failed' ? `style="background:${ndviColor(pass.ndvi)}"` : '';
      const label = st === 'cloudy' ? 'Cloud' : st === 'no-imagery' ? '—' : st === 'invalid' ? 'Bad data' : 'NDVI ' + pass.ndvi.toFixed(2);
      const money = pay.released ? pkr(pay.released) : pay.held ? `${pkr(pay.held)} held` : '';
      return `<div class="pass"><div class="tile ${st}" ${bg}>${label}</div>
        <span>${pass.date}</span><span class="status ${st}">${STATUS_TEXT[st]}</span><span>${money}</span></div>`;
    }).join('');
    fund(plot, trees);
    return `<div class="plot"><h4>${plot.farmer}, ${num(trees)} trees since ${plot.contract.since}</h4>
      <span class="muted">${plot.village} · ${paidBy(plot)}</span>
      <div class="strip">${tiles}</div>
      <p class="totals">Released ${pkr(released)} · held ${pkr(held)}</p></div>`;
  }).join('');

  // New plots are not planted yet, so their imagery is a baseline, not a survival check.
  const fresh = match.chosen.map(({ plot, trees }) => {
    fund(plot, trees);
    const seen = plot.passes.filter((p) => Logic.verifyPass(p, D.latestImagery) === 'verified' || Logic.verifyPass(p, D.latestImagery) === 'failed');
    const last = seen[seen.length - 1];
    const base = last
      ? `Before planting: NDVI ${last.ndvi.toFixed(2)} on ${last.date}. ${last.ndvi < R.ndviAlive
        ? 'The land is bare or under crops now, so a rise in green after planting shows the new trees.'
        : 'The land is already green; check that these trees are new before paying.'}`
      : 'No clear image of this plot yet.';
    return `<div class="plot"><h4>${plot.farmer}, ${num(trees)} trees to plant</h4>
      <span class="muted">${plot.village} · ${paidBy(plot)}</span><p>${base}</p></div>`;
  }).join('');

  $('#verify-out').innerHTML = `
    <h3 class="group">Contracts already running</h3>${running}
    <p class="muted">A pass counts as alive at NDVI ${R.ndviAlive} or higher with under ${R.maxCloud * 100}% cloud. Each paid pass splits ${R.farmerShare * 100}% to the farmer and the rest to whoever paid for planting. Latest imagery: ${D.latestImagery}.</p>
    <h3 class="group">New contracts from this match</h3>${fresh}`;

  const t = totals;
  $('#finance-out').innerHTML = `
    <div><h3>Investor</h3><dl>
      <dt>Paid for planting</dt><dd>${pkr(t.investor.invested)}</dd>
      <dt>Received so far</dt><dd>${pkr(t.investor.received)}</dd>
      <dt>Held until trees are verified</dt><dd>${pkr(t.investor.held)}</dd></dl></div>
    <div><h3>Bank</h3><dl>
      <dt>Green loans to farmers</dt><dd>${pkr(t.bank.lent)}</dd>
      <dt>Repaid from factory payments</dt><dd>${pkr(t.bank.repaid)}</dd>
      <dt>Outstanding</dt><dd>${pkr(Math.max(0, t.bank.lent - t.bank.repaid))}</dd></dl></div>
    <div><h3>Farmers</h3><dl>
      <dt>Earned so far</dt><dd>${pkr(t.farmers)}</dd></dl></div>`;
}

$('#site').innerHTML = D.sites.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
$('#site').addEventListener('change', (e) => { state.siteId = e.target.value; render(); });
$('#share').addEventListener('input', (e) => { state.share = e.target.value / 100; render(); });
if (D.satSource === 'placeholder') {
  const note = $('#source-note');
  note.hidden = false;
  note.textContent = 'Satellite values are placeholders. Run gee/export_data.js in Earth Engine and paste the results into data.js before the demo.';
}
render();

$('#c04-out').innerHTML = `<div class="table-wrap"><table>
  <thead><tr><th>Case</th><th>Injected input</th><th>What the system did</th></tr></thead>
  <tbody>${Logic.C04_CASES.map((c) => {
    const issues = c.run();
    const result = issues.length ? issuesHtml(issues) : '<p class="issue reject"><b>Not caught.</b>This input was accepted.</p>';
    return `<tr><td>${c.name}</td><td>${c.input}</td><td>${result}</td></tr>`;
  }).join('')}</tbody></table></div>
  <p class="muted">The same checks run in the steps above: points off the coast or across the border are rejected, sites with no buildings are flagged, and a farmer claiming more than ${R.maxTreesPerAcre.toLocaleString()} trees per acre is rejected. Run <code>node --test</code> to check every case.</p>`;
