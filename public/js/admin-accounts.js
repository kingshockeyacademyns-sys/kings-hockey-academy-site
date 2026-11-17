import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const notice = document.querySelector('[data-account-message]');
const feedback = document.querySelector('[data-account-feedback]');
const adminMain = document.querySelector('.account-admin-main');
const list = document.querySelector('[data-account-list]');
const search = document.querySelector('[data-account-search]');
const programSelect = document.querySelector('[data-admin-program]');
const campaignType = document.querySelector('[data-campaign-type]');
const campaignProgram = document.querySelector('[data-campaign-program]');
const campaignProgramWrap = document.querySelector('[data-campaign-program-wrap]');
const waiverRoot = document.querySelector('[data-admin-waivers]');
const programSpecific = document.querySelector('[data-admin-program-specific]');
const teamAccessList = document.querySelector('[data-team-access-list]');
const teamAccessAccount = document.querySelector('[data-team-access-account]');
let accounts = [];
let programs = [];
let waivers = [];
let teamAccess = [];
let adminUser = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = value => value ? new Date(value).toLocaleDateString() : 'Never';
const teamNames = { 'nova-scotia-kings': 'Nova Scotia Kings', 'nova-scotia-vipers': 'Nova Scotia Vipers', 'quebec-predators': 'Quebec Predators', 'montreal-sentinels': 'Montreal Sentinels' };

function show(box, text, kind = 'error') {
  if (!box) return;
  box.textContent = text;
  box.className = `alert ${kind}`;
  box.hidden = !text;
}

function renderAccounts() {
  const term = String(search?.value || '').trim().toLowerCase();
  const visible = accounts.filter(account => account.email.toLowerCase().includes(term));
  const eligible = accounts.filter(account => account.news_opt_in && account.email_confirmed && !account.disabled && !account.is_admin);
  document.querySelector('[data-account-total]').textContent = `${visible.length} of ${accounts.length} account${accounts.length === 1 ? '' : 's'}`;
  document.querySelector('[data-email-audience]').textContent = String(eligible.length);
  const statCards = document.querySelectorAll('[data-account-stats] article strong');
  if (statCards.length === 3) {
    statCards[0].textContent = String(accounts.length);
    statCards[1].textContent = String(accounts.filter(a => !a.disabled && !a.is_admin && a.email_confirmed).length);
    statCards[2].textContent = String(eligible.length);
  }
  list.innerHTML = visible.length ? visible.map(account => {
    const status = account.is_admin ? 'ADMINISTRATOR' : account.disabled ? 'DISABLED' : account.email_confirmed ? 'ACTIVE' : 'EMAIL NOT CONFIRMED';
    const actionButtons = account.is_admin
      ? '<span class="account-protected-label">Protected</span>'
      : `<button type="button" class="account-action-button" data-account-status="${account.disabled ? 'enable' : 'disable'}" data-account-id="${esc(account.id)}">${account.disabled ? 'Enable' : 'Disable'}</button><button type="button" class="account-delete-button" data-account-delete="${esc(account.id)}" data-account-email="${esc(account.email)}">Delete</button>`;
    const profile = account.parent_profile;
    const contact = profile ? `<strong>${esc(profile.first_name)} ${esc(profile.last_name)}</strong><small>${esc(profile.phone)}<br>${esc([profile.street_number, profile.postal_code, profile.province].filter(Boolean).join(', '))}</small><details><summary>More details</summary><small>${profile.second_guardian_first ? `Second parent: ${esc([profile.second_guardian_first, profile.second_guardian_last].filter(Boolean).join(' '))}<br>${esc(profile.second_guardian_email)} · ${esc(profile.second_guardian_phone)}<br>${esc([profile.second_guardian_street_number, profile.second_guardian_postal_code, profile.second_guardian_province].filter(Boolean).join(', '))}<br>` : ''}Emergency contact: ${esc(profile.emergency_name)} (${esc(profile.emergency_relationship)})<br>${esc(profile.emergency_phone)}</small></details>` : '<span class="account-status is-disabled">Details missing</span>';
    return `<tr><td><strong>${esc(account.email || 'No email')}</strong>${account.id === adminUser?.id ? '<small>Signed in account</small>' : ''}</td><td>${contact}</td><td><span class="account-status ${account.disabled ? 'is-disabled' : account.is_admin ? 'is-admin' : ''}">${status}</span></td><td>${account.child_count} saved</td><td>${account.news_opt_in ? 'Opted in' : 'Not opted in'}</td><td>${esc(dateText(account.created_at))}</td><td>${esc(dateText(account.last_sign_in_at))}</td><td><div class="account-row-actions">${actionButtons}</div></td></tr>`;
  }).join('') : `<tr><td colspan="8">${accounts.length ? 'No accounts match that email.' : 'No accounts found.'}</td></tr>`;
  list.querySelectorAll('[data-account-status]').forEach(button => button.addEventListener('click', changeStatus));
  list.querySelectorAll('[data-account-delete]').forEach(button => button.addEventListener('click', removeAccount));
}

async function accountAction(payload) {
  const { data, error } = await client.functions.invoke('manage-family-accounts', { body: payload });
  if (error) {
    let detail = data?.error;
    if (!detail && error.context?.clone) {
      try { detail = (await error.context.clone().json())?.error; } catch { /* Keep the readable fallback. */ }
    }
    throw new Error(detail || 'The account action could not be completed.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadAccounts() {
  list.innerHTML = '<tr><td colspan="8">Loading family accounts…</td></tr>';
  try {
    const data = await accountAction({ action: 'list' });
    accounts = data.users || [];
    renderAccounts();
    renderTeamAccessAccounts();
    await loadTeamAccess();
    show(feedback, '');
  } catch (error) {
    list.innerHTML = '<tr><td colspan="8">Family account details could not be loaded.</td></tr>';
    show(feedback, error.message);
  }
}

function renderTeamAccessAccounts() {
  const eligible = accounts.filter(account => !account.is_admin && !account.disabled && account.email_confirmed);
  teamAccessAccount.innerHTML = '<option value="">Select a confirmed family account</option>' + eligible.map(account => `<option value="${esc(account.id)}">${esc(account.email)}</option>`).join('');
  teamAccessAccount.disabled = !eligible.length;
}

async function loadTeamAccess() {
  if (!teamAccessList) return;
  teamAccessList.innerHTML = '<tr><td colspan="5">Loading team access…</td></tr>';
  const { data, error } = await client.from('team_age_group_access').select('id,parent_id,team_slug,age_group,granted_at').order('granted_at', { ascending: false });
  if (error) {
    teamAccess = [];
    teamAccessList.innerHTML = '<tr><td colspan="5">Team access could not be loaded. Apply the team access database setup first.</td></tr>';
    return;
  }
  teamAccess = data || [];
  const emails = new Map(accounts.map(account => [account.id, account.email]));
  teamAccessList.innerHTML = teamAccess.length ? teamAccess.map(grant => `<tr><td>${esc(emails.get(grant.parent_id) || 'Family account')}</td><td>${esc(teamNames[grant.team_slug] || grant.team_slug)}</td><td>${esc(grant.age_group)}</td><td>${esc(dateText(grant.granted_at))}</td><td><button type="button" class="account-delete-button" data-team-access-revoke="${esc(grant.id)}">Revoke</button></td></tr>`).join('') : '<tr><td colspan="5">No team age-group access has been granted yet.</td></tr>';
  teamAccessList.querySelectorAll('[data-team-access-revoke]').forEach(button => button.addEventListener('click', revokeTeamAccess));
}

async function revokeTeamAccess(event) {
  const button = event.currentTarget;
  const grant = teamAccess.find(item => item.id === button.dataset.teamAccessRevoke);
  if (!grant || !confirm(`Revoke ${grant.age_group} access for ${teamNames[grant.team_slug] || grant.team_slug}?`)) return;
  button.disabled = true;
  const { error } = await client.from('team_age_group_access').delete().eq('id', grant.id);
  if (error) {
    show(feedback, 'The team age-group access could not be revoked.');
    button.disabled = false;
    return;
  }
  show(feedback, 'Team age-group access revoked.', 'success');
  await loadTeamAccess();
}

document.querySelector('[data-team-access-form]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const parentId = String(values.get('parent_id') || '');
  const account = accounts.find(item => item.id === parentId && !item.is_admin && !item.disabled && item.email_confirmed);
  if (!account) { show(feedback, 'Choose an active, confirmed family account.'); return; }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  const { error } = await client.from('team_age_group_access').insert({ parent_id: parentId, team_slug: String(values.get('team_slug')), age_group: String(values.get('age_group')) });
  submit.disabled = false;
  if (error) {
    show(feedback, error.code === '23505' ? 'This family already has access to that team age group.' : 'Access could not be granted. Apply the team access database setup first.');
    return;
  }
  show(feedback, `Access granted to ${account.email}.`, 'success');
  await loadTeamAccess();
});

async function changeStatus(event) {
  const button = event.currentTarget;
  const action = button.dataset.accountStatus;
  const account = accounts.find(item => item.id === button.dataset.accountId);
  const verb = action === 'disable' ? 'disable' : 'enable';
  if (!account || !confirm(`${verb[0].toUpperCase()}${verb.slice(1)} sign-in for ${account.email}? ${action === 'disable' ? 'Their saved profiles and registrations will be kept.' : ''}`)) return;
  button.disabled = true;
  try {
    await accountAction({ action, user_id: account.id });
    show(feedback, `Sign-in ${action === 'disable' ? 'disabled' : 'enabled'} for ${account.email}.`, 'success');
    await loadAccounts();
  } catch (error) { show(feedback, error.message); button.disabled = false; }
}

async function removeAccount(event) {
  const button = event.currentTarget;
  const account = accounts.find(item => item.id === button.dataset.accountDelete);
  if (!account || !confirm(`Permanently delete ${account.email}? This removes the family account and its saved child profiles. Registration submissions will remain. This cannot be undone.`)) return;
  button.disabled = true;
  try {
    await accountAction({ action: 'delete', user_id: account.id });
    show(feedback, `Account deleted: ${account.email}.`, 'success');
    await loadAccounts();
  } catch (error) { show(feedback, error.message); button.disabled = false; }
}

async function loadRegistrationOptions() {
  const [programResult, waiverResult] = await Promise.all([
    client.from('programs').select('id,title,season,fee,session_count,single_session_available,questions,jersey_size_enabled,jersey_number_enabled,is_open').order('created_at', { ascending: false }),
    client.from('waivers').select('id,title,body').eq('is_active', true).order('created_at', { ascending: true }),
  ]);
  if (programResult.error) {
    programSelect.innerHTML = '<option value="">Programs could not be loaded</option>';
    show(feedback, 'Open programs could not be loaded for admin registration entry.');
    return;
  }
  programs = programResult.data || [];
  if (campaignProgram) campaignProgram.innerHTML = '<option value="">Select a program</option>' + programs.map(program => `<option value="${esc(program.id)}">${esc(program.title)} — ${esc(program.season || '')}</option>`).join('');
  const available = programs.filter(program => program.is_open);
  programSelect.innerHTML = available.length ? '<option value="">Select a program</option>' + available.map(program => `<option value="${esc(program.id)}">${esc(program.title)} — ${esc(program.season || '')}</option>`).join('') : '<option value="">No open programs available</option>';
  if (waiverResult.error) {
    waivers = [];
    waiverRoot.innerHTML = '<legend>WAIVERS &amp; ACKNOWLEDGEMENTS</legend><p>Active waivers could not be loaded. Refresh the page before adding a registration.</p>';
  } else {
    waivers = waiverResult.data || [];
    waiverRoot.innerHTML = `<legend>WAIVERS &amp; ACKNOWLEDGEMENTS</legend>${waivers.length ? waivers.map(waiver => `<label class="admin-waiver-approval"><input type="checkbox" name="waiver_${esc(waiver.id)}" value="true" required><span><strong>${esc(waiver.title)}</strong><small>${esc(waiver.body)}</small></span></label>`).join('') : '<p>No active waivers. The parent payment acknowledgement is still required.</p>'}`;
  }
  updateProgramSummary();
  void refreshCampaignAudience();
}

function updateCampaignMode() {
  const announcement = campaignType?.value === 'announcement';
  campaignProgramWrap.hidden = announcement;
  campaignProgram.required = !announcement;
  document.querySelector('[data-audience-label]').textContent = announcement ? 'opted-in family account(s) for academy news and new-program announcements' : 'registered email address(es) for this program';
  document.querySelector('[data-campaign-preview-footer]').textContent = announcement
    ? 'Optional academy news and new-program announcements. Unsubscribe link included.'
    : 'Factual program-change notices go to addresses on registrations for the selected program.';
  void refreshCampaignAudience();
}

async function refreshCampaignAudience() {
  const audience = document.querySelector('[data-email-audience]');
  const announcement = campaignType?.value === 'announcement';
  if (announcement) {
    audience.textContent = String(accounts.filter(a => a.news_opt_in && a.email_confirmed && !a.disabled && !a.is_admin).length);
    return;
  }
  const programId = campaignProgram?.value;
  if (!programId || !client) { audience.textContent = '—'; return; }
  audience.textContent = '…';
  const { data, error } = await client.functions.invoke('send-family-update', { body: { action: 'audience', message_type: 'program_update', program_id: programId } });
  if (error || data?.error) { audience.textContent = 'Unavailable'; return; }
  audience.textContent = String(data.count || 0);
}

function updateProgramSummary() {
  const program = programs.find(item => item.id === programSelect.value);
  const jersey = document.querySelector('[data-admin-jersey-wrap]');
  jersey.hidden = !program?.jersey_number_enabled;
  if (programSpecific) {
    const questions = Array.isArray(program?.questions) ? program.questions : [];
    const jerseySize = program?.jersey_size_enabled ? `<label>Jersey size (optional)<select name="admin_jersey_size"><option value="">Choose a size (optional)</option><option>Youth XS</option><option>Youth S</option><option>Youth M</option><option>Youth L</option><option>Youth XL</option><option>Adult XS</option><option>Adult S</option><option>Adult M</option><option>Adult L</option><option>Adult XL</option><option>Adult 2XL</option></select></label>` : '';
    const extras = questions.map((question, index) => `<label>${esc(question)}<textarea name="admin_question_${index}" rows="2" maxlength="1000"></textarea></label>`).join('');
    programSpecific.innerHTML = `${jerseySize}${extras}`;
  }
  const sessionCount = Number(program?.session_count);
  const fullCost = Number(String(program?.fee ?? '').replace(/,/g, ''));
  const singleSessionPrice = program?.single_session_available && Number.isInteger(sessionCount) && sessionCount > 0 && Number.isFinite(fullCost)
    ? Math.round((fullCost / sessionCount + Number.EPSILON) * 100) / 100
    : null;
  document.querySelector('[data-admin-payment-note]').textContent = program
    ? `Full program cost: CAD $${fullCost.toFixed(2)}.${program.single_session_available && singleSessionPrice === null ? ' Single-session pricing needs a session count before this registration can be confirmed.' : singleSessionPrice === null ? ' A CAD $100 minimum payment is due by e-transfer' : ` Single-session price and minimum payment: CAD $${singleSessionPrice.toFixed(2)}`}; remaining balance may be paid by e-transfer or cash no later than the second session. E-transfer: kingshockeyacademyns@gmail.com.`
    : 'Select a program to show its fee and payment summary.';
}

async function addRegistration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const program = programs.find(item => item.id === String(formData.get('program_id')));
  if (!program) { show(feedback, 'Select an open program.'); return; }
  const waiverConsents = Object.fromEntries(waivers.map(waiver => [waiver.id, formData.get(`waiver_${waiver.id}`) === 'true']));
  if (waivers.some(waiver => !waiverConsents[waiver.id])) { show(feedback, 'Confirm every active waiver before saving this registration.'); return; }
  if (formData.get('confirm_parent_approval') !== 'on') { show(feedback, 'Confirm the parent or guardian has approved the waivers and payment terms.'); return; }
  const dob = String(formData.get('date_of_birth') || '');
  const parsed = new Date(`${dob}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const earliest = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate());
  if (Number.isNaN(parsed.getTime()) || parsed > today || parsed < earliest) { show(feedback, 'Enter a valid player date of birth.'); return; }
  const value = name => String(formData.get(name) || '').trim();
  const secondGuardianKeys = ['second_guardian_first','second_guardian_last','second_guardian_email','second_guardian_phone','second_guardian_address','second_guardian_postal_code','second_guardian_province'];
  const secondGuardianValues = Object.fromEntries(secondGuardianKeys.map(key => [key, value(key)]));
  const hasSecondGuardian = secondGuardianKeys.some(key => secondGuardianValues[key]);
  if (hasSecondGuardian && secondGuardianKeys.some(key => !secondGuardianValues[key])) { show(feedback, 'Complete all second parent / guardian fields, or leave them all empty.'); return; }
  const customAnswers = {};
  if (program.jersey_size_enabled) customAnswers['Jersey size (optional)'] = value('admin_jersey_size');
  (Array.isArray(program.questions) ? program.questions : []).forEach((question, index) => { customAnswers[String(index)] = value(`admin_question_${index}`); });
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  const { error } = await client.from('registrations').insert({
    program_type: program.title,
    program_id: program.id,
    player_first: value('player_first'),
    player_last: value('player_last'),
    birth_year: parsed.getFullYear(),
    date_of_birth: dob,
    player_address: value('player_address'),
    player_postal_code: value('player_postal_code'),
    player_province: value('player_province'),
    allergies: value('allergies') || null,
    jersey_number: program.jersey_number_enabled ? value('jersey_number') || null : null,
    guardian_name: `${value('guardian_first')} ${value('guardian_last')}`.slice(0, 120),
    guardian_first: value('guardian_first'),
    guardian_last: value('guardian_last'),
    guardian_address: value('guardian_address'),
    guardian_postal_code: value('guardian_postal_code'),
    guardian_province: value('guardian_province'),
    second_guardian_first: secondGuardianValues.second_guardian_first || null,
    second_guardian_last: secondGuardianValues.second_guardian_last || null,
    second_guardian_email: secondGuardianValues.second_guardian_email || null,
    second_guardian_phone: secondGuardianValues.second_guardian_phone || null,
    second_guardian_address: secondGuardianValues.second_guardian_address || null,
    second_guardian_postal_code: secondGuardianValues.second_guardian_postal_code || null,
    second_guardian_province: secondGuardianValues.second_guardian_province || null,
    email: value('email'),
    phone: value('phone'),
    experience: value('experience') || '',
    notes: value('notes') || null,
    emergency_name: value('emergency_name'),
    emergency_relationship: value('emergency_relationship'),
    emergency_phone: value('emergency_phone'),
    consent: true,
    payment_terms_accepted: true,
    waiver_consents: waiverConsents,
    custom_answers: customAnswers,
  });
  submit.disabled = false;
  if (error) {
    show(feedback, 'The player registration could not be saved. Check the details and try again.');
    return;
  }
  form.reset();
  updateProgramSummary();
  show(feedback, `Player registration added to ${program.title}.`, 'success');
}

document.querySelector('[data-account-invite]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const values = new FormData(form);
    const profileFields = ['first_name','last_name','phone','street_number','postal_code','province','second_guardian_first','second_guardian_last','second_guardian_email','second_guardian_phone','second_guardian_street_number','second_guardian_postal_code','second_guardian_province','emergency_name','emergency_relationship','emergency_phone'];
    const profile = Object.fromEntries(profileFields.map(field => [field, String(values.get(`profile_${field}`) || '').trim()]));
    const result = await accountAction({ action: 'invite', email: form.elements.email.value.trim(), profile });
    form.reset();
    show(feedback, `Invitation sent to ${result.email}.`, 'success');
    await loadAccounts();
  } catch (error) { show(feedback, error.message); }
  finally { submit.disabled = false; }
});

document.querySelector('[data-account-campaign]')?.addEventListener('input', event => {
  const form = event.currentTarget;
  document.querySelector('[data-campaign-preview-subject]').textContent = form.elements.subject.value.trim() || 'Your subject will appear here';
  document.querySelector('[data-campaign-preview-body]').textContent = form.elements.message.value.trim() || 'Your message will appear here.';
});

document.querySelector('[data-account-campaign]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const messageType = campaignType.value;
  const countText = document.querySelector('[data-email-audience]').textContent;
  const count = Number(countText);
  if (!Number.isFinite(count)) { show(feedback, 'The recipient count is not available yet. Refresh the count and try again.'); return; }
  if (!count) { show(feedback, messageType === 'program_update' ? 'No registration email addresses are listed for this program.' : 'No active families have opted in to academy news and new-program announcements yet.'); return; }
  const subject = form.elements.subject.value.trim();
  const messageLabel = messageType === 'program_update' ? `registered email address${count === 1 ? '' : 'es'} for ${campaignProgram.selectedOptions[0]?.textContent || 'this program'}` : `opted-in family account${count === 1 ? '' : 's'}`;
  if (!confirm(`Send “${subject}” to ${count} ${messageLabel}? This will send an email to each recipient.`)) return;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  show(feedback, messageType === 'program_update' ? 'Sending required program notice…' : 'Sending optional academy announcement…', 'success');
  const { data, error } = await client.functions.invoke('send-family-update', { body: { subject, message: form.elements.message.value.trim(), mailing_address: form.elements.mailing_address.value.trim(), message_type: messageType, program_id: campaignProgram.value } });
  submit.disabled = false;
  if (error || data?.error) {
    let detail = data?.error;
    if (!detail && error?.context?.clone) {
      try { detail = (await error.context.clone().json())?.error; } catch { /* Keep the readable fallback. */ }
    }
    show(feedback, detail || 'The email could not be sent.');
    return;
  }
  form.reset();
  form.dispatchEvent(new Event('input', { bubbles: true }));
  show(feedback, data.failed ? `Sent to ${data.accepted}; ${data.failed} could not be sent. Check the email service before retrying.` : messageType === 'program_update' ? `Required program notice accepted for delivery to ${data.accepted} registration address${data.accepted === 1 ? '' : 'es'}.` : `Academy news accepted for delivery to ${data.accepted} opted-in family account${data.accepted === 1 ? '' : 's'}.`, data.failed ? 'error' : 'success');
});

document.querySelector('[data-admin-registration]')?.addEventListener('submit', addRegistration);
programSelect?.addEventListener('change', updateProgramSummary);
campaignType?.addEventListener('change', updateCampaignMode);
campaignProgram?.addEventListener('change', () => { void refreshCampaignAudience(); });
search?.addEventListener('input', renderAccounts);
document.querySelector('[data-account-refresh]')?.addEventListener('click', () => { void loadAccounts(); });
document.querySelector('[data-team-access-refresh]')?.addEventListener('click', () => { void loadTeamAccess(); });
document.querySelector('[data-account-signout]')?.addEventListener('click', async () => { await client.auth.signOut(); window.location.replace('admin.html'); });

async function initialize() {
  adminMain.hidden = true;
  if (!client) { show(notice, 'The account portal is not connected to Supabase.'); return; }
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session) { window.location.replace('admin.html'); return; }
  const { data: isAdmin, error: roleError } = await client.rpc('kha_is_admin');
  if (roleError || isAdmin !== true) { show(notice, 'This account is not approved for family account administration.'); return; }
  adminUser = sessionData.session.user;
  adminMain.hidden = false;
  document.querySelector('[data-account-admin-email]').textContent = adminUser.email || '';
  await Promise.all([loadAccounts(), loadRegistrationOptions()]);
  updateCampaignMode();
  client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') window.location.replace('admin.html'); });
}

initialize();
