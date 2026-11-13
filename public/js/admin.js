import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const login = document.querySelector('[data-admin-login]');
const dashboard = document.querySelector('[data-admin-dashboard]');
const notice = document.querySelector('[data-admin-message]');
const setMessage = text => { notice.textContent = text; notice.hidden = !text; };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function showSession() {
  if (!client) { setMessage('Admin sign-in will work after the site is connected to Supabase.'); return; }
  const { data: { session } } = await client.auth.getSession();
  login.hidden = !!session; dashboard.hidden = !session;
  if (session) { document.querySelector('[data-admin-email]').textContent = session.user.email; await loadRows(); }
}
async function loadRows() {
  const { data, error } = await client.from('registrations').select('*').order('created_at', { ascending: false });
  if (error) { setMessage('This account is not approved to see registrations. Contact the site administrator.'); return; }
  setMessage('');
  const tbody = document.querySelector('[data-registration-rows]');
  tbody.innerHTML = data.map(row => `<tr><td>${esc(new Date(row.created_at).toLocaleString())}</td><td>${esc(row.program_type)}</td><td>${esc(row.player_first)} ${esc(row.player_last)}</td><td>${esc(row.birth_year)}</td><td>${esc(row.guardian_name)}<br><small>${esc(row.town)}</small></td><td><a href="mailto:${esc(row.email)}">${esc(row.email)}</a><br>${esc(row.phone)}</td><td>${esc(row.experience)}<br><small>${esc(row.notes)}</small></td><td><button class="admin-delete-button" data-delete="${esc(row.id)}" type="button">Delete</button></td></tr>`).join('');
  document.querySelector('[data-registration-count]').textContent = `${data.length} submission${data.length === 1 ? '' : 's'} received`;
  tbody.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this registration inquiry? This cannot be undone.')) return;
    const { error: deleteError } = await client.from('registrations').delete().eq('id', button.dataset.delete);
    if (deleteError) { setMessage('This inquiry could not be deleted.'); return; }
    await loadRows();
  }));
}

login?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) { setMessage('Admin sign-in will work after the site is connected to Supabase.'); return; }
  const { error } = await client.auth.signInWithPassword({ email: login.elements.email.value, password: login.elements.password.value });
  if (error) { setMessage('The email or password did not match.'); return; }
  login.reset(); await showSession();
});
document.querySelector('[data-admin-logout]')?.addEventListener('click', async () => { await client.auth.signOut(); await showSession(); });
document.querySelector('[data-admin-export]')?.addEventListener('click', async () => {
  const { data, error } = await client.from('registrations').select('*').order('created_at', { ascending: false });
  if (error) { setMessage('The CSV file could not be created.'); return; }
  const columns = ['id','program_type','player_first','player_last','birth_year','guardian_name','email','phone','town','experience','notes','created_at'];
  const csv = [columns, ...data.map(row => columns.map(key => row[key] ?? ''))].map(row => row.map(value => {
    const safe = String(value).replace(/^[=+\-@]/, "'$&").replaceAll('"','""');
    return `"${safe}"`;
  }).join(',')).join('\r\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `kha-registrations-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
});
if (client) client.auth.onAuthStateChange(() => showSession());
showSession();
