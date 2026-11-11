// Investor and bank dashboard: funding opportunities, this funder's portfolio, returns and activity.
const { $, num, pkr, esc } = UI;
const R = Logic.RULES;
const user = UI.Session.require(['investor', 'bank']);

function treeStatus(p) {
  if (!p.contract) return '<span class="result-idle">Waiting for a factory to accept</span>';
  if (p.contract.fromMarket) return `<span class="result-idle">Signed with ${esc(UI.siteById(p.contract.siteId).name)}, not planted yet</span>`;
  const k = UI.plotChecks(p);
  if (!k.last) return '<span class="result-idle">No satellite check yet</span>';
  return k.last.st === 'verified' ? `<span class="result-chosen">Alive at the last check (${k.last.ndvi.toFixed(2)})</span>`
    : '<span class="result-reject">Not seen at the last check</span>';
}

function render() {
  const bank = user.role === 'bank';
  const mine = (p) => p.financier === user.role && p.funderName === user.name;
  const portfolio = Store.state.plots.filter(mine);
  const rows = UI.ledger(portfolio);
  const putIn = portfolio.reduce((a, p) => a + (p.contract && !p.contract.fromMarket ? p.contract.trees * R.plantingCostPerTree : Logic.fundingNeeded(p.treesPlanned)), 0);
  const back = rows.reduce((a, r) => a + r.funder, 0);
  const waitingAmt = rows.reduce((a, r) => a + r.held * (1 - R.farmerShare), 0);
  const open = Store.state.funding.filter((f) => f.status === 'open');
  const forMe = open.filter((f) => f.wants === user.role);
  const others = open.filter((f) => f.wants !== user.role);
  const ids = new Set(portfolio.map((p) => p.id));

  UI.sectionNav([['glance', 'At a glance'], ['opportunities', 'Requests to fund'], ['portfolio', 'My portfolio'], ['returns', bank ? 'Repayments' : 'Returns'], ['activity', 'Activity']]);

  $('#main').innerHTML = `
    <section id="glance" aria-labelledby="glance-h">
      <p class="eyebrow">${esc(user.name)}, ${bank ? 'bank' : 'investor'}</p>
      <h1 id="glance-h">${bank ? 'Your green loans' : 'Your tree investments'}</h1>
      <div class="figures">
        ${UI.figure(pkr(putIn), bank ? 'lent to farmers' : 'paid for planting')}
        ${UI.figure(pkr(back), bank ? 'repaid so far' : 'received so far')}
        ${bank ? UI.figure(pkr(Math.max(0, putIn - back)), 'still owed') : UI.figure(pkr(waitingAmt), 'held back, trees not seen')}
        ${UI.figure(num(forMe.length), `open request${forMe.length === 1 ? '' : 's'} for ${bank ? 'a loan' : 'an investor'}`)}
      </div>
      <p>${bank ? "You lend farmers the money for saplings and planting. The loan is repaid out of the factory's payments, which only arrive while the satellite sees the trees alive."
        : `You pay for saplings and planting, and receive ${100 - R.farmerShare * 100}% of every payment the factory makes while the satellite sees the trees alive.`}</p>
      <div class="form-msg" id="market-msg" role="status" tabindex="-1">${UI.takeFlash('market')}</div>
    </section>

    <section id="opportunities" aria-labelledby="opp-h">
      <h2 id="opp-h">Farmers asking for ${bank ? 'a bank loan' : 'an investor'}</h2>
      ${UI.fundingList(forMe, { funder: user.name, type: user.role })}
      ${others.length ? `<details class="more"><summary>${others.length} more ${others.length === 1 ? 'request is' : 'requests are'} asking for ${bank ? 'an investor' : 'a bank loan'}</summary>
        ${UI.fundingList(others, { funder: user.name, type: user.role })}</details>` : ''}
    </section>

    <section id="portfolio" aria-labelledby="port-h">
      <h2 id="port-h">My portfolio</h2>
      ${portfolio.length ? `<div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Farmer</th><th scope="col">Place</th><th scope="col" class="num">${bank ? 'Lent' : 'Invested'}</th><th scope="col">Trees</th></tr></thead><tbody>
        ${portfolio.map((p) => `<tr><th scope="row">${esc(p.farmer)}</th><td data-label="Place">${esc(p.village)}</td>
          <td class="num" data-label="${bank ? 'Lent' : 'Invested'}">${pkr(p.contract && !p.contract.fromMarket ? p.contract.trees * R.plantingCostPerTree : Logic.fundingNeeded(p.treesPlanned))}</td>
          <td data-label="Trees">${treeStatus(p)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Nothing funded yet. Fund a request above and it appears here.</p>'}
    </section>

    <section id="returns" aria-labelledby="ret-h">
      <h2 id="ret-h">${bank ? 'Repayments' : 'Returns'}</h2>
      ${rows.length ? `<div class="table-wrap"><table class="stack"><thead><tr><th scope="col">Check</th><th scope="col">Plot</th><th scope="col">Satellite</th>
        <th scope="col" class="num">${bank ? 'Repaid' : 'Received'}</th><th scope="col" class="num">Held back</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><th scope="row">${UI.month(r.date)}</th><td data-label="Plot">${esc(r.plot.farmer)}, ${esc(r.plot.village)}</td>
          <td data-label="Satellite"><span class="st-${r.st}">${UI.PASS_TEXT[r.st]}</span></td>
          <td class="num" data-label="${bank ? 'Repaid' : 'Received'}">${pkr(r.funder)}</td><td class="num" data-label="Held back">${pkr(r.held * (1 - R.farmerShare))}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No money back yet. It starts after a funded plot is planted and a satellite check sees the trees.</p>'}
    </section>

    <section id="activity" aria-labelledby="act-h">
      <h2 id="act-h">Activity</h2>
      ${UI.activity((e) => e.actor === user.name || ids.has(e.plotId))}
    </section>`;
}

if (user) {
  Store.ready.then(() => {
    UI.dashBar(user, user.role === 'bank' ? 'Bank dashboard' : 'Investor dashboard');
    UI.bindActions({ rerender: render });
    Store.onChange(render);
    render();
  });
}
