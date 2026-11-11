// Farmer dashboard: one farmer's land, contracts, earnings, offers, and funding requests.
const { $, num, pkr, esc } = UI;
const R = Logic.RULES;
const PICK = 'shajar_farmer';
const NEW = '__new';
let who;
try { who = localStorage.getItem(PICK); } catch (e) { /* storage blocked */ }

const farmers = () => [...new Set(Store.state.plots.map((p) => p.farmer))].sort();

function offerText(o, p) {
  const issues = Logic.checkPlot(p);
  if (issues.length) return `<span class="result-reject">Rejected by the checks: ${issues[0].msg}</span>`;
  if (o.status === 'accepted') return `<span class="result-chosen">Accepted for ${num(p.contract.trees)} trees</span>`;
  if (o.status === 'withdrawn') return `<span class="result-taken">Withdrawn: this land went to ${esc(UI.siteById(p.contract.siteId).name)}</span>`;
  return '<span class="result-idle">Waiting for the factory to decide</span>';
}

function render() {
  const names = farmers();
  if (who !== NEW && !names.includes(who)) who = names[0];
  $('#who').innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + `<option value="${NEW}">I am a new farmer</option>`;
  $('#who').value = who;

  if (who === NEW) {
    $('#main').innerHTML = `
      <section aria-labelledby="new-h">
        <h2 id="new-h">Offer your land to a factory</h2>
        <p>Factories in Karachi need farmers to plant and look after trees. Tell them about your land. If a factory accepts, you are paid every three months while the satellite sees your trees alive. If you need money for saplings, tick the box and an investor or a bank can pay for planting.</p>
        <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>
        ${UI.offerForm()}
      </section>`;
    return;
  }

  const plots = Store.state.plots.filter((p) => p.farmer === who);
  const ids = new Set(plots.map((p) => p.id));
  let earned = 0, held = 0, trees = 0;
  for (const p of plots) {
    if (!p.contract) continue;
    trees += p.contract.trees;
    if (UI.isRunning(p)) { const k = UI.plotChecks(p); earned += k.farmer; held += k.held * R.farmerShare; }
  }
  const offers = Store.state.offers.filter((o) => ids.has(o.plotId));
  const requests = Store.state.funding.filter((f) => ids.has(f.plotId));
  const last = plots[plots.length - 1];

  const land = plots.map((p) => (p.contract ? UI.plotCard(p, { showFactory: true })
    : `<article class="plot"><h4>${esc(p.village)}</h4><p class="muted">${p.acres} acres, ${num(p.treesPlanned)} trees offered. Not under contract yet.</p></article>`)).join('');
  const offerRows = offers.map((o) => {
    const p = UI.plotById(o.plotId);
    return `<tr><th scope="row">${esc(UI.siteById(o.siteId).name)}</th><td data-label="Land">${esc(p.village)}, ${p.acres} acres</td>
      <td class="num" data-label="Trees">${num(p.treesPlanned)}</td><td data-label="Status">${offerText(o, p)}</td></tr>`;
  }).join('');

  $('#main').innerHTML = `
    <section aria-labelledby="glance-h">
      <h2 id="glance-h">At a glance</h2>
      <div class="figures">
        ${UI.figure(pkr(earned), 'earned so far')}
        ${UI.figure(pkr(held), 'your share held back, trees not seen')}
        ${UI.figure(num(trees), 'trees under contract')}
        ${UI.figure(num(offers.filter((o) => o.status === 'open' && !Logic.checkPlot(UI.plotById(o.plotId)).length).length), 'offers waiting for a factory')}
      </div>
      <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>
    </section>

    <section aria-labelledby="land-h">
      <h2 id="land-h">Your land</h2>
      <p>Each square is one satellite photo of your plot. Green and ${R.ndviAlive} or above means the trees are alive and you are paid ${R.farmerShare * 100}% of that check.</p>
      ${land || '<p class="muted">No land registered yet.</p>'}
    </section>

    <section aria-labelledby="offers-h">
      <h2 id="offers-h">Your offers to factories</h2>
      ${offerRows ? `<div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Factory</th><th scope="col">Land</th><th scope="col" class="num">Trees</th><th scope="col">Status</th></tr></thead><tbody>${offerRows}</tbody></table></div>`
        : '<p class="muted">You have not offered land to a factory yet. Use the form below.</p>'}
    </section>

    <section aria-labelledby="funding-h">
      <h2 id="funding-h">Your requests for planting money</h2>
      ${requests.length ? UI.fundingList(requests, { forms: false }) : '<p class="muted">No requests. Tick "I need money for saplings and planting" when you send an offer.</p>'}
    </section>

    <section aria-labelledby="more-h">
      <h2 id="more-h">Offer land to a factory</h2>
      ${UI.offerForm({ farmer: who, village: last ? last.village : '' })}
    </section>`;
}

$('#who').addEventListener('change', (e) => {
  who = e.target.value;
  try { localStorage.setItem(PICK, who); } catch (err) { /* storage blocked */ }
  render();
});

UI.topNav('farmer.html');
UI.bindActions({ afterOffer: (plot) => { who = plot.farmer; try { localStorage.setItem(PICK, who); } catch (e) { /* storage blocked */ } } });
Store.onChange(render);
render();
