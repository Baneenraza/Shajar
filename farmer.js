// Farmer dashboard, in three tabs: my money, my land, offer land. Phone first, with Urdu labels.
const { $, num, pkr, esc } = UI;
const R = Logic.RULES;
const user = UI.Session.require(['farmer']);
const TABS = ['money', 'land', 'offer'];

function offerText(o, p) {
  const issues = Logic.checkPlot(p);
  if (issues.length) return `<span class="result-reject">Rejected by the checks: ${issues[0].msg}</span>`;
  if (o.status === 'accepted') return `<span class="result-chosen">Accepted for ${num(p.contract.trees)} trees</span>`;
  if (o.status === 'withdrawn') return `<span class="result-taken">Withdrawn: this land went to ${esc(UI.siteById(p.contract.siteId).name)}</span>`;
  return '<span class="result-idle">Waiting for the industry to decide</span>';
}

const monthName = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'long' });
// One plain sentence per payment, so a farmer knows why money came or did not.
function why(r) {
  const need = `greenness ${Number.isFinite(r.ndvi) ? r.ndvi.toFixed(2) : '?'}, needs ${R.ndviAlive}`;
  if (r.st === 'planting') return [`Planting money for ${num(r.plot.contract.trees)} saplings.`, UI.siteById(r.plot.contract.siteId).name];
  if (r.st === 'verified') return [`Your trees were seen alive in ${monthName(r.date)}.`, 'Sentinel-2 satellite'];
  if (r.st === 'failed') return [`The satellite saw too little green on your plot in ${monthName(r.date)}.`, need];
  if (r.st === 'cloudy') return [`Too cloudy to see your plot in ${monthName(r.date)}. It waits for the next photo.`, 'Sentinel-2 satellite'];
  return [`Faulty satellite reading in ${monthName(r.date)}. Held back until checked.`, 'Sentinel-2 satellite'];
}

function render() {
  const plots = Store.state.plots.filter((p) => p.farmer === user.name);
  const ids = new Set(plots.map((p) => p.id));
  const offers = Store.state.offers.filter((o) => ids.has(o.plotId));
  const rows = UI.ledger(plots);
  const earned = rows.reduce((a, r) => a + r.released, 0);
  const held = rows.reduce((a, r) => a + r.held, 0);
  const last = plots[plots.length - 1];
  // Start of the current run of failed checks (rows are newest first; cloudy checks do not break the run).
  let lastFailed = null;
  for (const r of rows) { if (r.st === 'failed') lastFailed = r; else if (r.st !== 'cloudy') break; }
  const nextPass = plots.flatMap((p) => p.passes || []).map((p) => p.date).filter((d) => d > DATA.latestImagery).sort()[0];

  $('#dash-nav').innerHTML = UI.tabButtons([['money', 'My money', '', 'میری کمائی'], ['land', 'My land', '', 'میری زمین'], ['offer', 'Offer land', '', 'زمین پیش کریں']]);

  $('#main').innerHTML = `
    <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>

    <section data-panel="money" aria-label="My money">
      ${rows.length ? `
      <div class="money paid"><span>Paid to you <span class="ur" lang="ur">آپ کو ادا شدہ</span></span><strong>${pkr(earned)}</strong></div>
      ${held ? `<div class="money held"><span>! Held back <span class="ur" lang="ur">روکی گئی رقم</span></span><strong>${pkr(held)}</strong>
        ${lastFailed ? `<p>The satellite has not seen enough trees on your plot since ${monthName(lastFailed.date)}.${nextPass ? ` Next check: ${UI.month(nextPass)}.` : ''} Replant the missing saplings so the next check pays you.</p>` : ''}</div>` : ''}
      <h2>Every payment</h2>
      <ul class="pay-list">${rows.map((r) => { const [text, sub] = why(r); const ok = r.released > 0; return `<li class="${ok ? 'ok' : 'held'}">
        <span class="pay-icon" aria-hidden="true">${ok ? '✓' : '!'}</span>
        <span class="pay-why"><b>${text}</b><span>${UI.month(r.date)} · ${esc(sub)}</span></span>
        <span class="pay-amt"><b>${pkr(ok ? r.released : r.held)}</b><span>${ok ? 'Paid' : 'Held back'}</span></span></li>`; }).join('')}</ul>`
      : `<h1>Welcome, ${esc(user.name)}</h1>
      <p>Industries in Karachi pay farmers to plant and look after trees. If one accepts your offer, it pays you ${pkr(R.plantingCostPerTree)} per tree upfront to plant, then every three months while the satellite sees your trees alive.</p>
      <p><a href="#offer" data-tab="offer" class="btn">Offer my land</a></p>`}
    </section>

    <section data-panel="land" aria-labelledby="land-h">
      <h2 id="land-h">My land</h2>
      <p class="muted">Each square is one satellite photo of your plot. Green and ${R.ndviAlive} or above means the trees are alive and you are paid.</p>
      ${plots.map((p) => (p.contract ? UI.plotCard(p, { showFactory: true })
        : `<article class="plot"><h4>${esc(p.village)}</h4><p class="muted">${p.acres} acres, ${num(p.treesPlanned)} trees offered. Not under contract yet.</p></article>`)).join('') || '<p class="muted">No land yet.</p>'}
      ${offers.length ? `<h3>My offers</h3><div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Industry</th><th scope="col">Land</th><th scope="col" class="num">Trees</th><th scope="col">Status</th></tr></thead><tbody>
        ${offers.map((o) => { const p = UI.plotById(o.plotId); return `<tr><th scope="row">${esc(UI.siteById(o.siteId).name)}</th><td data-label="Land">${esc(p.village)}, ${p.acres} acres</td>
          <td class="num" data-label="Trees">${num(p.treesPlanned)}</td><td data-label="Status">${offerText(o, p)}</td></tr>`; }).join('')}
        </tbody></table></div>` : ''}
    </section>

    <section data-panel="offer" aria-labelledby="offer-h">
      <h2 id="offer-h">Offer my land</h2>
      <p class="muted">An industry may pay you to grow trees: planting money first, then money every 3 months while the trees live.</p>
      <h3>Industries looking for trees</h3>
      <ul class="needs">${UI.realSites.map((s) => {
        const left = Math.max(0, UI.neededFor(s) - UI.coveredFor(s.id));
        return `<li><span><b>${esc(s.name)}</b><span class="muted small">Needs ${num(UI.neededFor(s))} trees · ${num(UI.coveredFor(s.id))} already contracted</span></span>
          ${left ? `<span class="needs-left"><b>${num(left)}</b> still needed</span><button type="button" class="btn" data-offer-to="${s.id}">Send offer</button>`
            : '<span class="needs-left">Fully covered</span>'}</li>`; }).join('')}</ul>
      ${UI.offerForm({ farmer: user.name, village: last ? last.village : '' })}
    </section>`;
  UI.showTab(UI.currentTab(TABS));
}

if (user) {
  Store.ready.then(() => {
    UI.dashBar(user, 'Farmer dashboard');
    UI.bindActions({ rerender: render });
    Store.onChange(render);
    render();
  });
  // "Send offer" next to an industry picks it in the form below and moves the farmer there.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-offer-to]');
    if (!b) return;
    const form = document.querySelector('.offer-form');
    form.elements.site.value = b.dataset.offerTo;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.acres.focus({ preventScroll: true });
  });
}
