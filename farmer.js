// Farmer dashboard: one farmer's earnings, land and satellite checks, offers, funding requests and claims.
const { $, num, pkr, esc } = UI;
const R = Logic.RULES;
const user = UI.Session.require(['farmer']);

function offerText(o, p) {
  const issues = Logic.checkPlot(p);
  if (issues.length) return `<span class="result-reject">Rejected by the checks: ${issues[0].msg}</span>`;
  if (o.status === 'accepted') return `<span class="result-chosen">Accepted for ${num(p.contract.trees)} trees</span>`;
  if (o.status === 'withdrawn') return `<span class="result-taken">Withdrawn: this land went to ${esc(UI.siteById(p.contract.siteId).name)}</span>`;
  return '<span class="result-idle">Waiting for the factory to decide</span>';
}

function render() {
  const plots = Store.state.plots.filter((p) => p.farmer === user.name);
  const ids = new Set(plots.map((p) => p.id));
  const offers = Store.state.offers.filter((o) => ids.has(o.plotId));
  const requests = Store.state.funding.filter((f) => ids.has(f.plotId));
  const rows = UI.ledger(plots);
  const earned = rows.reduce((a, r) => a + r.farmer, 0);
  const held = rows.reduce((a, r) => a + r.held * R.farmerShare, 0);
  const trees = plots.filter((p) => p.contract).reduce((a, p) => a + p.contract.trees, 0);
  const waiting = offers.filter((o) => o.status === 'open' && !Logic.checkPlot(UI.plotById(o.plotId)).length).length;
  const claims = (DATA.claims || []).filter((c) => ids.has(c.plotId));
  const last = plots[plots.length - 1];

  UI.sectionNav([['glance', 'At a glance'], ['land', 'My land'], ['earnings', 'Earnings'], ['offers', 'My offers'],
    ['funding', 'Planting money'], ['offer-land', 'Offer land'], ['claims', 'Satellite check'], ['activity', 'Activity']]);

  $('#main').innerHTML = `
    <section id="glance" aria-labelledby="glance-h">
      <p class="eyebrow">${esc(user.name)}</p>
      <h1 id="glance-h">${plots.length ? 'Your trees and earnings' : 'Welcome. Offer your land to a factory'}</h1>
      ${plots.length ? `<div class="hero-figure"><strong>${pkr(earned)}</strong><span>earned so far from trees the satellite saw alive</span></div>
      <div class="figures">
        ${UI.figure(num(trees), 'trees under contract')}
        ${UI.figure(pkr(held), 'your share held back, trees not seen')}
        ${UI.figure(num(waiting), `offer${waiting === 1 ? '' : 's'} waiting for a factory`)}
      </div>` : `<p>Factories in Karachi pay farmers to plant and look after trees. Tell them about your land below. If a factory accepts, you are paid ${R.farmerShare * 100}% of every payment, every three months, while the satellite sees your trees alive.</p>`}
      <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>
    </section>

    ${plots.length ? `<section id="land" aria-labelledby="land-h">
      <h2 id="land-h">My land</h2>
      <p>Each square is one satellite photo of your plot. Green and ${R.ndviAlive} or above means the trees are alive and you are paid.</p>
      ${plots.map((p) => (p.contract ? UI.plotCard(p, { showFactory: true })
        : `<article class="plot"><h4>${esc(p.village)}</h4><p class="muted">${p.acres} acres, ${num(p.treesPlanned)} trees offered. Not under contract yet.</p></article>`)).join('')}
    </section>

    <section id="earnings" aria-labelledby="earn-h">
      <h2 id="earn-h">Earnings</h2>
      ${rows.length ? `<div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Check</th><th scope="col">Plot</th><th scope="col">Satellite</th>
        <th scope="col" class="num">You earned</th><th scope="col" class="num">Your share held</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><th scope="row">${UI.month(r.date)}</th><td data-label="Plot">${esc(r.plot.village)}</td>
          <td data-label="Satellite"><span class="st-${r.st}">${UI.PASS_TEXT[r.st]}</span>${Number.isFinite(r.ndvi) ? ` (${r.ndvi.toFixed(2)})` : ''}</td>
          <td class="num" data-label="You earned">${pkr(r.farmer)}</td><td class="num" data-label="Your share held">${pkr(r.held * R.farmerShare)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No payments yet. They start after your trees are planted and the first satellite check sees them.</p>'}
    </section>

    <section id="offers" aria-labelledby="offers-h">
      <h2 id="offers-h">My offers</h2>
      ${offers.length ? `<div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Factory</th><th scope="col">Land</th><th scope="col" class="num">Trees</th><th scope="col">Status</th></tr></thead><tbody>
        ${offers.map((o) => { const p = UI.plotById(o.plotId); return `<tr><th scope="row">${esc(UI.siteById(o.siteId).name)}</th><td data-label="Land">${esc(p.village)}, ${p.acres} acres</td>
          <td class="num" data-label="Trees">${num(p.treesPlanned)}</td><td data-label="Status">${offerText(o, p)}</td></tr>`; }).join('')}
        </tbody></table></div>` : '<p class="muted">No offers yet. Use "Offer land" below.</p>'}
    </section>

    <section id="funding" aria-labelledby="funding-h">
      <h2 id="funding-h">Planting money</h2>
      ${requests.length ? UI.fundingList(requests, { forms: false }) : '<p class="muted">No requests. Tick "I need money for saplings and planting" when you offer land.</p>'}
    </section>` : ''}

    <section id="offer-land" aria-labelledby="more-h">
      <h2 id="more-h">Offer land to a factory</h2>
      ${UI.offerForm({ farmer: user.name, village: last ? last.village : '' })}
    </section>

    ${plots.length ? `<section id="claims" aria-labelledby="claims-h">
      <h2 id="claims-h">Satellite check of what you tell us</h2>
      <p>What you say about your land is compared with satellite greenness and the European land-cover map.</p>
      ${claims.map((c) => `<p>"${esc(c.statement)}" <span class="muted small">(example)</span></p>${UI.claimFindings(UI.checkClaim(c))}`).join('')}
      <form class="form" id="claim-form" novalidate>
        <div class="form-grid">
          <label>Which plot<select name="plotId">${plots.map((p) => `<option value="${p.id}">${esc(p.village)}, ${p.acres} acres</option>`).join('')}</select></label>
          <label>Trees you say are planted (optional)<input name="declared" type="number" min="0" step="1" inputmode="numeric"></label>
        </div>
        <label class="field-wide">What you say about the land<textarea name="statement" rows="3" placeholder="For example: I planted 2,000 trees and they are all healthy."></textarea></label>
        <button type="submit" class="btn">Check with the satellite</button>
        <div class="form-msg" role="status"></div>
      </form>
    </section>` : ''}

    <section id="activity" aria-labelledby="act-h">
      <h2 id="act-h">Activity</h2>
      ${UI.activity((e) => e.actor === user.name || ids.has(e.plotId))}
    </section>`;
}

if (user) {
  Store.ready.then(() => {
    UI.dashBar(user, 'Farmer dashboard');
    UI.bindActions({ rerender: render, afterOffer: (plot) => { if (plot.farmer !== user.name) UI.Session.set({ ...user, name: plot.farmer }); } });
    Store.onChange(render);
    render();
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'claim-form') return;
    e.preventDefault();
    const d = new FormData(e.target);
    UI.runClaimForm(e.target, { plotId: d.get('plotId'), declared: d.get('declared'), statement: d.get('statement') });
  });
}
