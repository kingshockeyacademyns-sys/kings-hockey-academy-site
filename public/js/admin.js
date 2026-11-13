import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const adminPage = document.body.dataset.adminPage || 'login';
const isDashboardPage = adminPage === 'dashboard';
const isProgramsPage = adminPage === 'programs';
const isLoginPage = adminPage === 'login';
const isAuthenticatedAdminPage = isDashboardPage || isProgramsPage;
const login = document.querySelector('[data-admin-login]');
const notice = document.querySelector('[data-admin-message]');
const setMessage = text => {
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = !text;
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadRows() {
  const { data, error } = await client.from('registrations').select('*, programs(title, questions)').order('created_at', { ascending: false });
  if (error) {
    setMessage('This account is not approved to see registrations. Contact the site administrator.');
    return;
  }

  setMessage('');
  const tbody = document.querySelector('[data-registration-rows]');
  tbody.innerHTML = data.map(row => {
    const questions = row.programs?.questions || [];
    const answers = Object.entries(row.custom_answers || {}).map(([index, answer]) => {
      const question = questions[Number(index)] || `Extra question ${Number(index) + 1}`;
      return `<br><small><strong>${esc(question)}</strong>: ${esc(answer)}</small>`;
    }).join('');
    return `<tr><td>${esc(new Date(row.created_at).toLocaleString())}</td><td>${esc(row.program_type)}</td><td>${esc(row.player_first)} ${esc(row.player_last)}</td><td>${esc(row.birth_year)}</td><td>${esc(row.guardian_name)}<br><small>${esc(row.town)}</small></td><td><a href="mailto:${esc(row.email)}">${esc(row.email)}</a><br>${esc(row.phone)}</td><td>${esc(row.experience)}<br><small>${esc(row.notes)}</small>${answers}</td><td><button class="admin-delete-button" data-delete="${esc(row.id)}" type="button">Delete</button></td></tr>`;
  }).join('');
  document.querySelector('[data-registration-count]').textContent = `${data.length} submission${data.length === 1 ? '' : 's'} received`;
  tbody.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this registration inquiry? This cannot be undone.')) return;
    const { error: deleteError } = await client.from('registrations').delete().eq('id', button.dataset.delete);
    if (deleteError) {
      setMessage('This inquiry could not be deleted.');
      return;
    }
    await loadRows();
  }));
}

async function loadPrograms() {
  const list = document.querySelector('[data-program-list]');
  if (!list) return;
  const { data, error } = await client.from('programs').select('*').order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = '<p class="admin-program-empty">Program management is ready after the dynamic programs database update is applied.</p>';
    return;
  }

  if (!data.length) {
    list.innerHTML = '<p class="admin-program-empty">No custom programs yet. Create one above to publish a registration form.</p>';
    return;
  }

  list.innerHTML = data.map(program => `<article class="admin-program-card"><div><span class="admin-program-status ${program.is_open ? 'is-open' : ''}">${program.is_open ? 'OPEN' : 'CLOSED'}</span><h3>${esc(program.title)}</h3><p>${esc(program.season || 'Program')}${program.dates ? ` · ${esc(program.dates)}` : ''}</p>${program.questions?.length ? `<small>${program.questions.length} extra question${program.questions.length === 1 ? '' : 's'} on the form</small>` : ''}</div><div class="admin-program-actions"><a href="program-registration.html?id=${encodeURIComponent(program.id)}" target="_blank" rel="noopener">Preview form ↗</a><button class="admin-delete-button" type="button" data-program-toggle="${esc(program.id)}" data-next-state="${program.is_open ? 'false' : 'true'}">${program.is_open ? 'Close registration' : 'Open registration'}</button></div></article>`).join('');
  list.querySelectorAll('[data-program-toggle]').forEach(button => button.addEventListener('click', async () => {
    const { error: updateError } = await client.from('programs').update({ is_open: button.dataset.nextState === 'true' }).eq('id', button.dataset.programToggle);
    if (updateError) {
      setProgramMessage('The program status could not be changed.', 'error');
      return;
    }
    setProgramMessage('Program registration status updated.');
    await loadPrograms();
  }));
}

function setProgramMessage(text, kind = 'success') {
  const box = document.querySelector('[data-program-message]');
  if (!box) return;
  box.textContent = text;
  box.className = `alert ${text ? kind : ''}`;
  box.hidden = !text;
}

async function initializePage() {
  if (!client) {
    setMessage('Admin sign-in is not connected to Supabase yet.');
    return;
  }

  const { data: { session }, error } = await client.auth.getSession();
  if (error) {
    setMessage('Could not verify your sign-in. Please reload and try again.');
    return;
  }

  if (isLoginPage) {
    if (session) window.location.replace('admin-dashboard.html');
    return;
  }

  if (!isAuthenticatedAdminPage || !session) {
    window.location.replace('admin.html');
    return;
  }

  document.querySelector('[data-admin-email]').textContent = session.user.email;
  if (isProgramsPage) await loadPrograms();
  if (isDashboardPage) await loadRows();
}

document.querySelector('[data-program-form]')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const questions = values.questions.split('\n').map(question => question.trim()).filter(Boolean);
  if (questions.length > 12) {
    setProgramMessage('Add no more than 12 extra questions.', 'error');
    return;
  }
  const { error } = await client.from('programs').insert({
    title: values.title.trim(), season: values.season.trim() || null, description: values.description.trim() || null,
    dates: values.dates.trim() || null, location: values.location.trim() || null,
    age_groups: values.age_groups.trim() || null, fee: values.fee.trim() || null, questions, is_open: true
  });
  if (error) {
    setProgramMessage('The program could not be saved. Confirm the dynamic programs database update has been applied.', 'error');
    return;
  }
  form.reset();
  setProgramMessage('Program created. Its registration form is now open on the Camps & Programs page.');
  await loadPrograms();
});

login?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) {
    setMessage('Admin sign-in is not connected to Supabase yet.');
    return;
  }

  const { error } = await client.auth.signInWithPassword({
    email: login.elements.email.value,
    password: login.elements.password.value
  });
  if (error) {
    setMessage('The email or password did not match.');
    return;
  }

  window.location.assign('admin-dashboard.html');
});

document.querySelector('[data-admin-logout]')?.addEventListener('click', async () => {
  await client.auth.signOut();
  window.location.replace('admin.html');
});

document.querySelector('[data-admin-export]')?.addEventListener('click', async () => {
  const { data, error } = await client.from('registrations').select('*').order('created_at', { ascending: false });
  if (error) {
    setMessage('The CSV file could not be created.');
    return;
  }

  const columns = ['id','program_id','program_type','custom_answers','player_first','player_last','birth_year','guardian_name','email','phone','town','experience','notes','created_at'];
  const csv = [columns, ...data.map(row => columns.map(key => row[key] ?? ''))].map(row => row.map(value => {
    const safe = String(value).replace(/^[=+\-@]/, "'$&").replaceAll('"','""');
    return `"${safe}"`;
  }).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `kha-registrations-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

if (client) {
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT' && isAuthenticatedAdminPage) window.location.replace('admin.html');
    if (event === 'SIGNED_IN' && isLoginPage) window.location.replace('admin-dashboard.html');
  });
}

initializePage();
