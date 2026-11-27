import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ageGroupForBirthDate, ageGroupMessage } from './age-groups.js';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const authArea = document.querySelector('[data-parent-auth]');
const accountArea = document.querySelector('[data-parent-area]');
const messageBox = document.querySelector('[data-parent-message]');
const childrenList = document.querySelector('[data-parent-children]');
const childCount = document.querySelector('[data-child-count]');
const emailUpdates = document.querySelector('[data-email-updates]');
const parentProfileForm = document.querySelector('[data-parent-profile]');
const parentProfileSummary = document.querySelector('[data-parent-profile-summary]');
const registrationsList = document.querySelector('[data-parent-registrations]');
const passwordSetup = document.querySelector('[data-parent-set-password]');
const accountContent = document.querySelector('[data-parent-account-content]');
const allowedViews = new Set(['account', 'players', 'registrations']);
const activeView = new URLSearchParams(window.location.search).get('view');
const familyView = allowedViews.has(activeView) ? activeView : 'account';
const authHashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const authQueryParams = new URLSearchParams(window.location.search);
// Supabase may return invitation/recovery links as a hash (type=invite) or
// as a PKCE callback (?code=...). Keep the profile/password setup form active
// for either callback shape so invited parents cannot skip their details.
let passwordSetupRequired = ['invite', 'recovery'].includes(authHashParams.get('type'))
  || ['invite', 'recovery'].includes(authQueryParams.get('type'))
  || authQueryParams.get('invite') === '1'
  || Boolean(authQueryParams.get('code'));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

document.querySelectorAll('[data-family-view]').forEach(section => { section.hidden = section.dataset.familyView !== familyView; });
document.querySelectorAll('[data-family-view-link]').forEach(link => {
  if (link.dataset.familyViewLink === familyView) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
});

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

const parentProfileFields = ['first_name','last_name','phone','street_number','postal_code','province','second_guardian_first','second_guardian_last','second_guardian_email','second_guardian_phone','second_guardian_street_number','second_guardian_postal_code','second_guardian_province','emergency_name','emergency_relationship','emergency_phone'];

function parentProfileValues(form) {
  const values = new FormData(form);
  return Object.fromEntries(parentProfileFields.map(field => [`profile_${field}`, String(values.get(`profile_${field}`) || '').trim()]));
}

async function loadParentProfile() {
  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId || !parentProfileForm) return;
  const { data, error } = await client.from('parent_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    showMessage('Parent contact details could not be loaded. Please refresh and try again.');
    return;
  }
  parentProfileFields.forEach(field => {
    const input = parentProfileForm.elements.namedItem(`profile_${field}`);
    if (input) input.value = data?.[field] || '';
  });
  if (!data) {
    parentProfileSummary.innerHTML = '<p class="parent-empty-state">Your parent contact details have not been saved yet. Add them so they are ready when you register.</p><button class="button button-gold" data-parent-profile-edit type="button">ADD PARENT DETAILS <b>↗</b></button>';
    return;
  }
  const line = (label, value) => value ? `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>` : '';
  parentProfileSummary.innerHTML = `<div class="family-profile-summary-heading"><h2>${escapeHtml(data.first_name)} ${escapeHtml(data.last_name)}</h2><button class="button button-light" data-parent-profile-edit type="button">EDIT ACCOUNT DETAILS</button></div><dl class="family-profile-details">${line('PHONE', data.phone)}${line('STREET & NUMBER', data.street_number)}${line('POST CODE', data.postal_code)}${line('PROVINCE', data.province)}${line('SECOND PARENT / GUARDIAN', [data.second_guardian_first, data.second_guardian_last].filter(Boolean).join(' '))}${line('SECOND PARENT EMAIL', data.second_guardian_email)}${line('SECOND PARENT PHONE', data.second_guardian_phone)}${line('SECOND PARENT ADDRESS', [data.second_guardian_street_number, data.second_guardian_postal_code, data.second_guardian_province].filter(Boolean).join(', '))}${line('EMERGENCY CONTACT', data.emergency_name)}${line('RELATIONSHIP', data.emergency_relationship)}${line('EMERGENCY PHONE', data.emergency_phone)}</dl>`;
}

async function saveParentProfile(event) {
  event.preventDefault();
  const values = parentProfileValues(event.currentTarget);
  const secondFields = parentProfileFields.filter(field => field.startsWith('second_guardian_'));
  const secondValues = secondFields.map(field => values[`profile_${field}`]);
  if (secondValues.some(Boolean) && secondValues.some(value => !value)) {
    showMessage('Complete all second parent / guardian fields, or leave them all blank.');
    return;
  }
  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) { showMessage('Sign in again to save parent details.'); return; }
  const record = Object.fromEntries(parentProfileFields.map(field => [field, values[`profile_${field}`] || null]));
  Object.assign(record, { user_id: userId, updated_at: new Date().toISOString() });
  const { error } = await client.from('parent_profiles').upsert(record, { onConflict: 'user_id' });
  if (error) {
    showMessage('Parent contact details could not be saved. Check the required fields and try again.');
    return;
  }
  parentProfileForm.hidden = true;
  parentProfileSummary.hidden = false;
  await loadParentProfile();
  showMessage('Parent contact details saved for future registrations.', 'success');
}

function renderChildProfiles(children) {
  childCount.textContent = `${children.length} SAVED`;
  if (!children.length) {
    childrenList.innerHTML = '<p class="parent-empty-state">No players saved yet. Choose “Add a player” to create the first profile.</p>';
    return;
  }
  childrenList.innerHTML = children.map(child => `
    <article class="parent-child-card">
      <div class="parent-player-heading"><div><p class="eyebrow dark">SAVED PLAYER</p><h2>${escapeHtml(child.first_name)} ${escapeHtml(child.last_name)}</h2><p class="parent-age-group-label">AGE GROUP <strong>${escapeHtml(ageGroupForBirthDate(child.date_of_birth) || 'Not available')}</strong></p></div><div class="parent-player-actions"><button class="parent-text-button" data-child-details-toggle type="button" aria-expanded="false">VIEW DETAILS</button><button class="parent-text-button" data-child-edit-toggle type="button">EDIT</button><button class="parent-delete-button" type="button" data-child-delete="${escapeHtml(child.id)}">Delete</button></div></div>
      <dl class="parent-player-details" data-child-details hidden><div><dt>DATE OF BIRTH</dt><dd>${escapeHtml(child.date_of_birth)}</dd></div><div><dt>AGE GROUP</dt><dd>${escapeHtml(ageGroupForBirthDate(child.date_of_birth) || 'Not available')}</dd></div><div><dt>STREET & NUMBER</dt><dd>${escapeHtml(child.street_number)}</dd></div><div><dt>POST CODE</dt><dd>${escapeHtml(child.postal_code)}</dd></div><div><dt>PROVINCE</dt><dd>${escapeHtml(child.province)}</dd></div><div class="parent-player-medical"><dt>MEDICAL INFORMATION / ALLERGIES</dt><dd>${escapeHtml(child.medical_information || 'None provided')}</dd></div></dl>
      <form class="parent-account-form" data-child-edit="${escapeHtml(child.id)}" hidden>
        <div class="form-row"><label>First name <b>*</b><input name="first_name" maxlength="80" value="${escapeHtml(child.first_name)}" required></label><label>Last name <b>*</b><input name="last_name" maxlength="80" value="${escapeHtml(child.last_name)}" required></label></div>
        <label>Date of birth <b>*</b><input name="date_of_birth" type="date" value="${escapeHtml(child.date_of_birth)}" required></label>
        <p class="age-group-preview" data-age-group-preview>${ageGroupMessage(child.date_of_birth)}</p>
        <div class="address-fields"><label>Street &amp; number <b>*</b><input name="street_number" maxlength="300" value="${escapeHtml(child.street_number)}" required></label><div class="form-row"><label>Post code <b>*</b><input name="postal_code" maxlength="16" value="${escapeHtml(child.postal_code)}" required></label><label>Province <b>*</b><input name="province" maxlength="80" value="${escapeHtml(child.province)}" required></label></div></div>
        <label>Medical information / allergies<textarea name="medical_information" rows="3" maxlength="3000">${escapeHtml(child.medical_information)}</textarea></label>
        <div class="parent-child-actions"><button class="button button-gold" type="submit">SAVE CHANGES <b>↗</b></button><button class="parent-cancel-button" data-child-edit-cancel type="button">CANCEL</button></div>
      </form>
    </article>`).join('');
  childrenList.querySelectorAll('[data-child-edit]').forEach(form => {
    form.addEventListener('submit', saveChildProfile);
    const dateInput = form.elements.namedItem('date_of_birth');
    const preview = form.querySelector('[data-age-group-preview]');
    const updateAgeGroup = () => { preview.innerHTML = ageGroupMessage(dateInput.value); };
    dateInput.addEventListener('input', updateAgeGroup);
    dateInput.addEventListener('change', updateAgeGroup);
  });
  childrenList.querySelectorAll('[data-child-delete]').forEach(button => button.addEventListener('click', deleteChildProfile));
  childrenList.querySelectorAll('[data-child-details-toggle]').forEach(button => button.addEventListener('click', () => {
    const details = button.closest('.parent-child-card').querySelector('[data-child-details]');
    details.hidden = !details.hidden;
    button.setAttribute('aria-expanded', String(!details.hidden));
    button.textContent = details.hidden ? 'VIEW DETAILS' : 'HIDE DETAILS';
  }));
  childrenList.querySelectorAll('[data-child-edit-toggle]').forEach(button => button.addEventListener('click', () => {
    const form = button.closest('.parent-child-card').querySelector('[data-child-edit]');
    form.hidden = false;
    button.closest('.parent-child-card').querySelector('[data-child-details]').hidden = true;
    button.closest('.parent-child-card').querySelector('[data-child-details-toggle]').setAttribute('aria-expanded', 'false');
    button.closest('.parent-child-card').querySelector('[data-child-details-toggle]').textContent = 'VIEW DETAILS';
  }));
  childrenList.querySelectorAll('[data-child-edit-cancel]').forEach(button => button.addEventListener('click', () => { button.closest('[data-child-edit]').hidden = true; }));
}

function renderRegistrations(registrations) {
  if (!registrations.length) {
    registrationsList.innerHTML = '<p class="parent-empty-state">No registrations are linked to your family account yet. Sign in before submitting a registration to see it here.</p>';
    return;
  }
  const players = new Map();
  registrations.forEach(registration => {
    const key = `${registration.player_first.toLowerCase()}|${registration.player_last.toLowerCase()}|${registration.date_of_birth || ''}`;
    if (!players.has(key)) players.set(key, { first: registration.player_first, last: registration.player_last, registrations: [] });
    players.get(key).registrations.push(registration);
  });
  registrationsList.innerHTML = [...players.values()].map(player => `<section class="parent-registration-player"><h2>${escapeHtml(player.first)} ${escapeHtml(player.last)}</h2><p class="parent-age-group-label">AGE GROUP <strong>${escapeHtml(ageGroupForBirthDate(player.registrations[0]?.date_of_birth) || 'Not available')}</strong></p><ul>${player.registrations.map(registration => {
    const program = Array.isArray(registration.program) ? registration.program[0] : registration.program;
    const title = program?.title || registration.program_type;
    const sessionPrice = program?.single_session_available && Number(program?.session_count) > 0 && Number.isFinite(Number(String(program?.fee ?? '').replace(/,/g, '')))
      ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Math.round((Number(String(program.fee).replace(/,/g, '')) / Number(program.session_count) + Number.EPSILON) * 100) / 100)
      : null;
    const startDate = program?.program_start_date ? `Starts ${new Date(`${program.program_start_date}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}` : '';
    const facts = [program?.season, program?.dates, startDate, program?.session_schedule, program?.session_count ? `${program.session_count} sessions` : '', program?.single_session_available ? `Single sessions available${sessionPrice ? ` · ${sessionPrice} per session` : ' · Contact the academy for the per-session price'}` : '', program?.location, program?.age_groups, program?.fee].filter(Boolean).map(escapeHtml).join(' · ');
    const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Halifax', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const todayText = `${todayParts.find(part => part.type === 'year')?.value}-${todayParts.find(part => part.type === 'month')?.value}-${todayParts.find(part => part.type === 'day')?.value}`;
    const state = program?.is_open === false || (program?.registration_closes_on && program.registration_closes_on < todayText) ? 'Registration closed' : 'Registration open';
    return `<li><div><strong>${escapeHtml(title)}</strong><span class="parent-registration-state">${state}</span></div>${facts ? `<small>${facts}</small>` : ''}</li>`;
  }).join('')}</ul></section>`).join('');
}

async function loadRegistrations(userId) {
  registrationsList.innerHTML = '<p>Loading registrations…</p>';
  const { data, error } = await client.from('registrations')
    .select('id,program_id,program_type,player_first,player_last,date_of_birth,created_at,program:programs(title,season,is_open,dates,program_start_date,session_schedule,session_count,single_session_available,registration_closes_on,location,age_groups,fee)')
    .eq('family_user_id', userId).not('program_id', 'is', null).order('created_at', { ascending: false });
  if (error) {
    registrationsList.innerHTML = '<p class="parent-empty-state">Your registrations could not be loaded. Please refresh and try again.</p>';
    return;
  }
  renderRegistrations(data || []);
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

async function loadEmailPreferences() {
  const { data, error } = await client.from('parent_email_preferences').select('marketing_opt_in').maybeSingle();
  if (error) {
    emailUpdates.checked = false;
    emailUpdates.disabled = true;
    return;
  }
  emailUpdates.checked = data?.marketing_opt_in === true;
  emailUpdates.disabled = false;
}

async function syncSession(session) {
  authArea.hidden = Boolean(session);
  accountArea.hidden = !session;
  if (!session) {
    document.querySelector('[data-parent-email]').textContent = '';
    return;
  }
  document.querySelector('[data-parent-email]').textContent = session.user.email || '';
  passwordSetup.hidden = !passwordSetupRequired;
  accountContent.hidden = passwordSetupRequired;
  if (passwordSetupRequired) return;
  if (familyView === 'players') await loadChildren();
  if (familyView === 'account') await Promise.all([loadEmailPreferences(), loadParentProfile()]);
  if (familyView === 'registrations') await loadRegistrations(session.user.id);
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
  const profileFields = parentProfileFields.map(field => [`profile_${field}`, String(values.get(`profile_${field}`) || '').trim()]);
  const profile = Object.fromEntries(profileFields);
  const secondFields = parentProfileFields.filter(field => field.startsWith('second_guardian_'));
  const secondValues = secondFields.map(field => profile[`profile_${field}`]);
  if (secondValues.some(Boolean) && secondValues.some(value => !value)) { showMessage('Complete all second parent / guardian fields, or leave them all blank.'); return; }
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: { marketing_opt_in: values.get('marketing_opt_in') === 'true', ...profile } } });
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

document.querySelector('[data-parent-set-password]')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!client) { showMessage('Family accounts are not connected yet. Please contact the academy.'); return; }

  const form = event.currentTarget;
  const values = new FormData(form);
  const password = String(values.get('password') || '');
  if (password.length < 8) { showMessage('Use a password with at least 8 characters.'); return; }
  if (password !== String(values.get('confirm_password') || '')) { showMessage('The passwords do not match.'); return; }

  const profile = parentProfileValues(form);
  const requiredProfileFields = ['first_name', 'last_name', 'phone', 'street_number', 'postal_code', 'province', 'emergency_name', 'emergency_relationship', 'emergency_phone'];
  if (requiredProfileFields.some(field => !profile[`profile_${field}`])) {
    showMessage('Complete all required parent, address, and emergency contact fields.');
    return;
  }

  const secondFields = parentProfileFields.filter(field => field.startsWith('second_guardian_'));
  const secondValues = secondFields.map(field => profile[`profile_${field}`]);
  if (secondValues.some(Boolean) && secondValues.some(value => !value)) {
    showMessage('Complete all second parent / guardian fields, or leave them all blank.');
    return;
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (sessionError || !userId) {
    showMessage('Your invitation session has expired. Open the invitation link from your email again.');
    return;
  }

  const record = Object.fromEntries(parentProfileFields.map(field => [field, profile[`profile_${field}`] || null]));
  Object.assign(record, { user_id: userId, updated_at: new Date().toISOString() });
  const { error: profileError } = await client.from('parent_profiles').upsert(record, { onConflict: 'user_id' });
  if (profileError) {
    console.error('Invited parent profile save failed:', profileError);
    showMessage(`Your parent details could not be saved (${profileError.code || 'database error'}). Please try again or contact the academy.`);
    return;
  }

  const { error: passwordError } = await client.auth.updateUser({ password });
  if (passwordError) {
    console.error('Invited parent password update failed:', passwordError);
    showMessage('Your details were saved, but your password could not be set. Please try again.');
    return;
  }

  passwordSetupRequired = false;
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  form.reset();
  showMessage('Your family account is ready. Add your children’s profiles below.', 'success');
  const { data } = await client.auth.getSession();
  await syncSession(data.session);
});

emailUpdates?.addEventListener('change', async () => {
  const { data: sessionData } = await client.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) { emailUpdates.checked = false; return; }
  emailUpdates.disabled = true;
  const { data: existing, error: readError } = await client.from('parent_email_preferences').select('user_id,consented_at').eq('user_id', userId).maybeSingle();
  if (readError) {
    emailUpdates.disabled = false;
    showMessage('Your email preference could not be saved. Please try again.');
    await loadEmailPreferences();
    return;
  }
  const optedIn = emailUpdates.checked;
  const preference = { user_id: userId, marketing_opt_in: optedIn, updated_at: new Date().toISOString(), consented_at: optedIn ? new Date().toISOString() : existing?.consented_at || null };
  const result = existing
    ? await client.from('parent_email_preferences').update(preference).eq('user_id', userId)
    : await client.from('parent_email_preferences').insert(preference);
  emailUpdates.disabled = false;
  if (result.error) {
    showMessage('Your email preference could not be saved. Please try again.');
    await loadEmailPreferences();
    return;
  }
  showMessage(optedIn ? 'You are signed up for academy news and new-program announcements.' : 'You will not receive academy news or new-program announcements. Required updates about your registrations will still be sent.', 'success');
});

document.querySelector('[data-parent-signout]')?.addEventListener('click', async () => {
  const { error } = await client.auth.signOut();
  if (error) { showMessage('You could not be signed out right now. Please try again.'); return; }
  await syncSession(null);
  showMessage('You have been signed out.', 'success');
});

parentProfileForm?.addEventListener('submit', saveParentProfile);
parentProfileSummary?.addEventListener('click', event => {
  if (!event.target.closest('[data-parent-profile-edit]')) return;
  parentProfileSummary.hidden = true;
  parentProfileForm.hidden = false;
});
document.querySelector('[data-parent-profile-cancel]')?.addEventListener('click', () => {
  parentProfileForm.reset();
  parentProfileForm.hidden = true;
  parentProfileSummary.hidden = false;
});

const childCreateForm = document.querySelector('[data-child-create]');
const childCreateToggle = document.querySelector('[data-child-create-toggle]');
const childCreateDate = childCreateForm?.elements.namedItem('date_of_birth');
const childCreateAgeGroup = childCreateForm?.querySelector('[data-age-group-preview]');
const updateNewChildAgeGroup = () => { if (childCreateAgeGroup) childCreateAgeGroup.innerHTML = ageGroupMessage(childCreateDate?.value); };
childCreateDate?.addEventListener('input', updateNewChildAgeGroup);
childCreateDate?.addEventListener('change', updateNewChildAgeGroup);
childCreateToggle?.addEventListener('click', () => {
  childCreateForm.hidden = false;
  childCreateToggle.hidden = true;
  childCreateForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.querySelector('[data-child-create-cancel]')?.addEventListener('click', () => {
  childCreateForm.reset();
  updateNewChildAgeGroup();
  childCreateForm.hidden = true;
  childCreateToggle.hidden = false;
});

childCreateForm?.addEventListener('submit', async event => {
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
  updateNewChildAgeGroup();
  form.hidden = true;
  childCreateToggle.hidden = false;
  showMessage('Child profile saved. You can select it on a future registration form.', 'success');
  await loadChildren();
});

if (!client) {
  showMessage('Family accounts are not connected yet. Please contact the academy.');
} else {
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || authQueryParams.get('invite') === '1'
      || ['invite', 'recovery'].includes(authHashParams.get('type'))
      || ['invite', 'recovery'].includes(authQueryParams.get('type'))
      || Boolean(authQueryParams.get('code'))) {
      passwordSetupRequired = true;
    }
    setTimeout(() => { void syncSession(session); }, 0);
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) showMessage('Your sign-in could not be checked. Reload the page and try again.');
    else void syncSession(data.session);
  });
}
