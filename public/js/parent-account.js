import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const authArea = document.querySelector('[data-parent-auth]');
const accountArea = document.querySelector('[data-parent-area]');
const messageBox = document.querySelector('[data-parent-message]');
const childrenList = document.querySelector('[data-parent-children]');
const childCount = document.querySelector('[data-child-count]');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function showMessage(text, kind = 'error') {
  messageBox.textContent = text;
  messageBox.className = `alert ${kind}`;
  messageBox.hidden = !text;
}

function showAuthMode(mode) {
  document.querySelector('[data-parent-signin]').hidden = mode !== 'signin';
  document.querySelector('[data-parent-signup]').hidden = mode !== 'signup';
  showMessage('');
}

function validateBirthDate(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  const now = new Date();
  const earliest = new Date(now.getFullYear() - 25, now.getMonth(), now.getDate());
  return !Number.isNaN(date.getTime()) && date <= now && date >= earliest;
}

function profileValues(form) {
  const values = new FormData(form);
  return {
    first_name: String(values.get('first_name') || '').trim(),
    last_name: String(values.get('last_name') || '').trim(),
    date_of_birth: String(values.get('date_of_birth') || ''),
    street_number: String(values.get('street_number') || '').trim(),
    postal_code: String(values.get('postal_code') || '').trim(),
    province: String(values.get('province') || '').trim(),
    medical_information: String(values.get('medical_information') || '').trim()
  };
}

function renderChildProfiles(children) {
  childCount.textContent = `${children.length} SAVED`;
  if (!children.length) {
    childrenList.innerHTML = '<p class="parent-empty-state">No child profiles yet. Add your first child below.</p>';
    return;
  }
  childrenList.innerHTML = children.map(child => `
    <article class="parent-child-card">
      <form class="parent-account-form" data-child-edit="${escapeHtml(child.id)}">
        <div class="form-title"><span>${escapeHtml(child.first_name)} ${escapeHtml(child.last_name)}</span><span>SAVED PROFILE</span></div>
        <div class="form-row"><label>First name <b>*</b><input name="first_name" maxlength="80" value="${escapeHtml(child.first_name)}" required></label><label>Last name <b>*</b><input name="last_name" maxlength="80" value="${escapeHtml(child.last_name)}" required></label></div>
        <label>Date of birth <b>*</b><input name="date_of_birth" type="date" value="${escapeHtml(child.date_of_birth)}" required></label>
        <div class="address-fields"><label>Street &amp; number <b>*</b><input name="street_number" maxlength="300" value="${escapeHtml(child.street_number)}" required></label><div class="form-row"><label>Post code <b>*</b><input name="postal_code" maxlength="16" value="${escapeHtml(child.postal_code)}" required></label><label>Province <b>*</b><input name="province" maxlength="80" value="${escapeHtml(child.province)}" required></label></div></div>
        <label>Medical information / allergies<textarea name="medical_information" rows="3" maxlength="3000">${escapeHtml(child.medical_information)}</textarea></label>
        <div class="parent-child-actions"><button class="button button-gold" type="submit">SAVE CHANGES <b>↗</b></button><button class="parent-delete-button" type="button" data-child-delete="${escapeHtml(child.id)}">Delete profile</button></div>
      </form>
    </article>`).join('');
  childrenList.querySelectorAll('[data-child-edit]').forEach(form => form.addEventListener('submit', saveChildProfile));
  childrenList.querySelectorAll('[data-child-delete]').forEach(button => button.addEventListener('click', deleteChildProfile));
}

async function loadChildren() {
  childrenList.innerHTML = '<p>Loading profiles…</p>';
  const { data, error } = await client.from('parent_children').select('id,first_name,last_name,date_of_birth,street_number,postal_code,province,medical_information').order('created_at', { ascending: true });
  if (error) {
    childrenList.innerHTML = '<p class="parent-empty-state">Child profiles are not available yet. Please try again later.</p>';
    childCount.textContent = 'NOT READY';
    return;
  }
  renderChildProfiles(data || []);
}

async function syncSession(session) {
  authArea.hidden = Boolean(session);
  accountArea.hidden = !session;
  if (!session) {
    document.querySelector('[data-parent-email]').textContent = '';
    return;
  }
  document.querySelector('[data-parent-email]').textContent = session.user.email || '';
  await loadChildren();
}

async function saveChildProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = profileValues(form);
  if (!validateBirthDate(values.date_of_birth)) {
    showMessage('Enter a valid date of birth. Child profiles can include players up to 25 years old.');
    return;
  }
  const { error } = await client.from('parent_children').update({ ...values, updated_at: new Date().toISOString() }).eq('id', form.dataset.childEdit);
  if (error) {
    showMessage('That child profile could not be updated. Please try again.');
    return;
  }
  showMessage('Child profile updated.', 'success');
  await loadChildren();
}

async function deleteChildProfile(event) {
  const button = event.currentTarget;
  if (!confirm('Delete this child profile? It will no longer appear as a saved option on registration forms.')) return;
  const { error } = await client.from('parent_children').delete().eq('id', button.dataset.childDelete);
  if (error) {
    showMessage('That child profile could not be deleted. Please try again.');
    return;
  }
  showMessage('Child profile deleted.', 'success');
  await loadChildren();
}

document.querySelector('[data-show-signup]')?.addEventListener('click', () => showAuthMode('signup'));
document.querySelector('[data-show-signin]')?.addEventListener('click', () => showAuthMode('signin'));

document.querySelector('[data-parent-signin]')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) { showMessage('Family accounts are not connected yet. Please contact the academy.'); return; }
  const values = new FormData(event.currentTarget);
  const { data, error } = await client.auth.signInWithPassword({ email: String(values.get('email')).trim(), password: String(values.get('password')) });
  if (error) { showMessage('We could not sign you in. Check your email and password, then try again.'); return; }
  showMessage('');
  await syncSession(data.session);
});

document.querySelector('[data-parent-signup]')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) { showMessage('Family accounts are not connected yet. Please contact the academy.'); return; }
  const values = new FormData(event.currentTarget);
  const password = String(values.get('password'));
  if (password !== String(values.get('confirm_password'))) { showMessage('The passwords do not match.'); return; }
  const email = String(values.get('email') || '').trim();
  const redirectTo = new URL('parent-account.html', window.location.href).toString();
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
  if (error) { showMessage(error.message || 'Your family account could not be created. Please try again.'); return; }
  if (data.session) {
    showMessage('Your family account is ready. Add your children’s profiles below.', 'success');
    await syncSession(data.session);
  } else {
    event.currentTarget.reset();
    showAuthMode('signin');
    showMessage('Check your email for a confirmation link. After confirming, return here to add your children’s profiles.', 'success');
  }
});

document.querySelector('[data-parent-signout]')?.addEventListener('click', async () => {
  const { error } = await client.auth.signOut();
  if (error) { showMessage('You could not be signed out right now. Please try again.'); return; }
  await syncSession(null);
  showMessage('You have been signed out.', 'success');
});

document.querySelector('[data-child-create]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = profileValues(form);
  if (!validateBirthDate(values.date_of_birth)) {
    showMessage('Enter a valid date of birth. Child profiles can include players up to 25 years old.');
    return;
  }
  const { error } = await client.from('parent_children').insert(values);
  if (error) {
    showMessage('That child profile could not be saved. Please try again.');
    return;
  }
  form.reset();
  showMessage('Child profile saved. You can select it on a future registration form.', 'success');
  await loadChildren();
});

if (!client) {
  showMessage('Family accounts are not connected yet. Please contact the academy.');
} else {
  client.auth.onAuthStateChange((_event, session) => setTimeout(() => { void syncSession(session); }, 0));
  client.auth.getSession().then(({ data, error }) => {
    if (error) showMessage('Your sign-in could not be checked. Reload the page and try again.');
    else void syncSession(data.session);
  });
}
