// Factory dashboard: one factory's pollution, tree requirement, offers to accept, and contracts.
const { $, num, pkr, esc, callouts } = UI;
const R = Logic.RULES;
const PICK = 'shajar_factory';
let siteId;
try { siteId = localStorage.getItem(PICK); } catch (e) { /* storage blocked */ }
if (!UI.siteById(siteId) || UI.isTestSite(UI.siteById(siteId))) siteId = UI.realSites[0].id;

function render() {
  const site = UI.siteById(siteId);
  const est = Logic.estimateEmissions(site);
  const issues = Logic.checkSite(site);
  const mine = (p) => p.contract && p.contract.siteId === siteId;
  const t = UI.totals(mine);
  const needed = UI.neededFor(site);
  const share = Store.shareFor(siteId);
  const air = est.signal === 'strong' ? `The satellite sees ${est.ratio.toFixed(1)} times more nitrogen dioxide over your site than around it, which backs up the estimate.`
    : est.signal === 'weak' ? `The satellite sees only ${est.ratio.toFixed(1)} times more nitrogen dioxide over your site than around it.`
    : 'The satellite sees no more nitrogen dioxide over your site than around it.';
  const running = Store.state.plots.filter((p) => mine(p) && UI.isRunning(p)).map((p) => UI.plotCard(p)).join('');
  const fresh = Store.state.plots.filter((p) => mine(p) && p.contract.fromMarket).map((p) => UI.plotCard(p)).join('');

  $('#main').innerHTML = `
    <section aria-labelledby="glance-h">
      <h2 id="glance-h">At a glance</h2>
      <div class="figures">
        ${UI.figure(num(est.tco2) + ' t', 'carbon dioxide a year, likely ' + num(est.low) + ' to ' + num(est.high))}
        ${UI.figure(num(needed), 'trees needed to cover ' + (share * 100).toFixed(1) + '% of it')}
        ${UI.figure(num(Math.min(UI.coveredFor(siteId), needed)), 'trees under contract')}
        ${UI.figure(pkr(t.paid), 'paid out for trees seen alive')}
        ${UI.figure(pkr(t.held), 'held back, trees not seen')}
      </div>
      ${callouts(issues)}
      <p><b>Satellite check:</b> ${air}</p>
    </section>

    ${(() => {
      const claims = (DATA.claims || []).filter((c) => c.siteId === siteId);
      return claims.length ? `<section aria-labelledby="claims-h">
        <h2 id="claims-h">Your public claims, checked</h2>
        ${claims.map((c) => `<p>"${esc(c.statement)}"${Number.isFinite(c.declaredTonnes) ? ` <span class="muted small">(declared ${num(c.declaredTonnes)} t a year)</span>` : ''}</p>${UI.claimFindings(UI.checkClaim(c))}`).join('')}
        <p class="muted small">The statement is an example written for this demo. Climate TRACE and the satellite readings are real.</p>
      </section>` : '';
    })()}

    <section aria-labelledby="req-h">
      <h2 id="req-h">Your tree requirement</h2>
      <label class="field">Share of your yearly pollution to cover with trees: <output id="share-out">${(share * 100).toFixed(1)}%</output>
        <input id="share" type="range" min="0.1" max="10" step="0.1" value="${(share * 100).toFixed(1)}"></label>
      ${UI.requirement(site)}
      <p class="muted small">One acre of new trees takes in about ${R.tco2PerAcreYear} tonnes of carbon dioxide a year. Trees only cover part of your pollution; cutting fuel use still matters most.</p>
    </section>

    <section aria-labelledby="offers-h">
      <h2 id="offers-h">Farmers offering to plant for you</h2>
      <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>
      ${UI.offersTable(site)}
    </section>

    <section aria-labelledby="contracts-h">
      <h2 id="contracts-h">Your contracts</h2>
      <p>Every three months a satellite photographs each plot. You pay only for checks where the trees are seen alive (a greenness score of ${R.ndviAlive} or more).</p>
      <h3>Planted and being checked</h3>
      ${running || '<p class="muted">No planted contracts yet.</p>'}
      <h3>Signed, not planted yet</h3>
      ${fresh || '<p class="muted">None. Accept an offer above to sign a new contract.</p>'}
    </section>`;
}

const who = $('#who');
who.innerHTML = UI.realSites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
who.value = siteId;
who.addEventListener('change', () => {
  siteId = who.value;
  try { localStorage.setItem(PICK, siteId); } catch (e) { /* storage blocked */ }
  render();
});
document.addEventListener('change', (e) => { if (e.target.id === 'share') Store.setShare(siteId, e.target.value / 100); });
document.addEventListener('input', (e) => { if (e.target.id === 'share') $('#share-out').textContent = Number(e.target.value).toFixed(1) + '%'; });

UI.topNav('factory.html');
UI.bindActions();
Store.onChange(render);
render();
