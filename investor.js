// Investor and bank dashboard: requests to fund, and how funded plots are doing.
const { $, num, pkr, esc } = UI;
const PICK = 'shajar_funder';
let kind;
try { kind = localStorage.getItem(PICK); } catch (e) { /* storage blocked */ }
if (kind !== 'bank') kind = 'investor';

function status(p) {
  if (!p.contract) return '<span class="result-idle">Waiting for a factory to accept the offer</span>';
  if (p.contract.fromMarket) return `<span class="result-idle">Signed with ${esc(UI.siteById(p.contract.siteId).name)}, not planted yet</span>`;
  const k = UI.plotChecks(p);
  if (!k.last) return '<span class="result-idle">No satellite check yet</span>';
  return k.last.st === 'verified' ? `<span class="result-chosen">Trees alive at the last check (${k.last.ndvi.toFixed(2)})</span>`
    : `<span class="result-reject">Trees not seen at the last check</span>`;
}

function render() {
  document.querySelectorAll('input[name="kind"]').forEach((r) => { r.checked = r.value === kind; });
  const bank = kind === 'bank';
  const mine = (p) => p.financier === kind;
  const t = UI.totals(mine);
  const open = Store.state.funding.filter((f) => f.status === 'open');
  const forMe = open.filter((f) => f.wants === kind);
  const others = open.length - forMe.length;
  const portfolio = Store.state.plots.filter(mine);

  const rows = portfolio.map((p) => {
    const amount = p.contract && !p.contract.fromMarket ? p.contract.trees * Logic.RULES.plantingCostPerTree : Logic.fundingNeeded(p.treesPlanned);
    const k = UI.isRunning(p) ? UI.plotChecks(p) : { funder: 0, funderHeld: 0 };
    return `<tr><th scope="row">${esc(p.farmer)}</th><td data-label="Place">${esc(p.village)}</td>
      <td data-label="Funded by">${p.funderName ? esc(p.funderName) : bank ? 'Bank (demo)' : 'Investor (demo)'}</td>
      <td class="num" data-label="${bank ? 'Lent' : 'Invested'}">${pkr(amount)}</td>
      <td class="num" data-label="${bank ? 'Repaid' : 'Received'}">${pkr(k.funder)}</td>
      <td class="num" data-label="Waiting">${pkr(k.funderHeld)}</td>
      <td data-label="Trees">${status(p)}</td></tr>`;
  }).join('');

  $('#main').innerHTML = `
    <section aria-labelledby="glance-h">
      <h2 id="glance-h">At a glance</h2>
      <div class="figures">
        ${bank ? UI.figure(pkr(t.bank.lent), 'lent to farmers') : UI.figure(pkr(t.investor.invested), 'paid for planting')}
        ${bank ? UI.figure(pkr(t.bank.repaid), 'repaid from factory payments') : UI.figure(pkr(t.investor.received), 'received so far')}
        ${bank ? UI.figure(pkr(Math.max(0, t.bank.lent - t.bank.repaid)), 'still owed') : UI.figure(pkr(t.investor.held), 'waiting on trees to be seen')}
        ${UI.figure(num(forMe.length), `open request${forMe.length === 1 ? '' : 's'} for ${bank ? 'a bank loan' : 'an investor'}`)}
      </div>
      <p>${bank ? 'Banks lend farmers the money for saplings and planting. The loan is repaid out of the factory\'s payments, which only arrive while the satellite sees the trees alive.'
        : `Investors pay for saplings and planting, and receive ${100 - Logic.RULES.farmerShare * 100}% of every payment the factory makes while the satellite sees the trees alive.`}</p>
      <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>
    </section>

    <section aria-labelledby="requests-h">
      <h2 id="requests-h">Farmers asking for ${bank ? 'a bank loan' : 'an investor'}</h2>
      ${UI.fundingList(forMe)}
      ${others ? `<p class="muted small">${others} more ${others === 1 ? 'request is' : 'requests are'} asking for ${bank ? 'an investor' : 'a bank loan'}. Switch "You are" at the top to see ${others === 1 ? 'it' : 'them'}.</p>` : ''}
    </section>

    <section aria-labelledby="portfolio-h">
      <h2 id="portfolio-h">Plots funded by ${bank ? 'banks' : 'investors'}</h2>
      ${rows ? `<div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Farmer</th><th scope="col">Place</th><th scope="col">Funded by</th>
        <th scope="col" class="num">${bank ? 'Lent' : 'Invested'}</th><th scope="col" class="num">${bank ? 'Repaid' : 'Received'}</th><th scope="col" class="num">Waiting</th><th scope="col">Trees</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        <p class="muted small">"Waiting" is your share of money held back at checks where the trees were not seen.</p>`
        : '<p class="muted">Nothing funded yet. Fund a request above and it appears here.</p>'}
    </section>`;
}

document.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', () => {
  kind = r.value;
  try { localStorage.setItem(PICK, kind); } catch (e) { /* storage blocked */ }
  render();
}));

UI.topNav('investor.html');
UI.bindActions();
Store.onChange(render);
render();
