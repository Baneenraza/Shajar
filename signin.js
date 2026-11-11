// Sign-in pages: signin.html?role=factory (industry) or ?role=farmer. Farmers can also create an account.
const { $, esc } = UI;
const role = new URLSearchParams(location.search).get('role') === 'factory' ? 'factory' : 'farmer';
const form = $('#signin');
let registering = false;

const COPY = {
  factory: {
    kicker: 'For industry', title: 'Offset your emissions with trees you can prove are alive.', foot: 'Emissions data: Climate TRACE',
    h1: 'Sign in as an industry', other: '<a href="signin.html?role=farmer">I’m a farmer</a>',
    demo: UI.realSites.map((s) => `<b>${esc(s.id)}</b> (${esc(s.name)})`).join(', '),
  },
  farmer: {
    kicker: 'For farmers <span lang="ur" class="ur">کسانوں کے لیے</span>', title: 'Grow trees on your land. Get paid every 3 months.',
    foot: `${UI.pkr(Logic.RULES.plantingCostPerTree)} per tree to plant · ${UI.pkr(Logic.RULES.pricePerTreeYear / Logic.RULES.passesPerYear)} per tree each quarter`,
    h1: 'Sign in as a farmer', other: '<a href="signin.html?role=factory">I’m an industry</a>',
    demo: [...new Set(DATA.plots.map((p) => p.farmer))].map((n) => `<b>${esc(n.split(' ')[0].toLowerCase())}</b> (${esc(n)})`).join(', '),
  },
}[role];

document.body.classList.add('role-' + role);
$('#side-kicker').innerHTML = COPY.kicker;
$('#side-title').textContent = COPY.title;
$('#side-foot').textContent = COPY.foot;
$('#other-role').innerHTML = COPY.other;
$('#demo-list').innerHTML = `Username: ${COPY.demo}. Password for all of them: <b>shajar2026</b>.`;

function setMode(reg) {
  registering = reg;
  $('#title').textContent = reg ? 'Create a farmer account' : COPY.h1;
  $('#name-field').hidden = !reg;
  $('#submit').textContent = reg ? 'Create account' : 'Sign in';
  form.elements.password.autocomplete = reg ? 'new-password' : 'current-password';
  $('#mode-switch').innerHTML = role !== 'farmer' ? '' : reg
    ? 'Already have an account? <a href="#" id="toggle">Sign in</a>'
    : 'New farmer? <a href="#" id="toggle">Create an account</a>';
  $('#signin-msg').innerHTML = '';
}
document.addEventListener('click', (e) => { if (e.target.id === 'toggle') { e.preventDefault(); setMode(!registering); } });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#signin-msg');
  const d = new FormData(form);
  const username = String(d.get('username')).trim();
  const password = String(d.get('password'));
  if (!username || !password) { msg.innerHTML = UI.callouts([{ level: 'reject', msg: 'Enter your username and password.' }]); return; }
  $('#submit').disabled = true;
  try {
    await Store.ready;
    const r = registering ? await Store.register(username, password, String(d.get('name')).trim()) : await Store.login(role, username, password);
    UI.Session.set(r.user);
    location.href = UI.DASHBOARD[r.user.role];
  } catch (err) {
    msg.innerHTML = UI.callouts(err.issues && err.issues.length ? err.issues : [{ level: 'reject', msg: err.message }]);
    $('#submit').disabled = false;
  }
});

setMode(false);
