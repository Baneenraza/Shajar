// Demo sign-in: pick a role and a name, then open that role's dashboard.
const { $, esc } = UI;
const NEW = '__new';
const form = $('#signin');

function farmerNames() {
  const plots = Store.state ? Store.state.plots : DATA.plots;
  return [...new Set(plots.map((p) => p.farmer))].sort();
}

function renderWho() {
  const role = form.elements.role.value;
  const step = $('#who-step');
  if (!role) { step.innerHTML = ''; return; }
  if (role === 'factory') {
    step.innerHTML = `<label class="field">Which factory<select name="site">${UI.realSites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>`;
    return;
  }
  step.innerHTML = `<label class="field">Which farmer<select name="who">${farmerNames().map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}<option value="${NEW}">I am a new farmer</option></select></label>
    <label class="field" id="new-name" hidden>Your name<input name="newName" autocomplete="name"></label>`;
  const sel = step.querySelector('select[name="who"]');
  sel.addEventListener('change', () => { $('#new-name').hidden = sel.value !== NEW; if (sel.value === NEW) step.querySelector('input').focus(); });
}

form.addEventListener('change', (e) => { if (e.target.name === 'role') renderWho(); });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const role = form.elements.role.value;
  const msg = $('#signin-msg');
  if (!role) { msg.innerHTML = UI.callouts([{ level: 'reject', msg: 'Choose whether you are a factory or a farmer.' }]); return; }
  let user;
  if (role === 'factory') {
    const site = UI.siteById(form.elements.site.value);
    user = { role, name: site.name, siteId: site.id };
  } else {
    const picked = form.elements.who.value;
    const name = (picked === NEW ? String(form.elements.newName.value) : picked).trim().slice(0, 80);
    if (!name) { msg.innerHTML = UI.callouts([{ level: 'reject', msg: 'Enter your name.' }]); return; }
    user = { role, name };
  }
  UI.Session.set(user);
  location.href = UI.DASHBOARD[role];
});

Store.ready.then(() => {
  const want = new URLSearchParams(location.search).get('role');
  const current = UI.Session.get();
  const role = ['factory', 'farmer'].includes(want) ? want : current && UI.DASHBOARD[current.role] ? current.role : '';
  if (role) form.querySelector(`input[name="role"][value="${role}"]`).checked = true;
  renderWho();
});
