import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ageGroupForBirthDate } from './age-groups.js';

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
const programSpecific = document.querySelector('[data-admin-program-specific]');
const teamAccessList = document.querySelector('[data-team-access-list]');
const teamPlayerSearch = document.querySelector('[data-team-player-search]');
const teamPlayerResults = document.querySelector('[data-team-player-results]');
const teamPlayerSearchStatus = document.querySelector('[data-team-player-search-status]');
const teamSelectedPlayerPanel = document.querySelector('[data-team-selected-player]');
const teamAccessPlayerId = document.querySelector('[data-team-access-player-id]');
const teamPlayerAgeGroup = document.querySelector('[data-team-player-age-group]');
const teamPlayerAgeGroupValue = document.querySelector('[data-team-player-age-group-value]');
const teamRosterSubmit = document.querySelector('[data-team-roster-submit]');
const playerSearch = document.querySelector('[data-player-search]');
const playerSearchResults = document.querySelector('[data-player-search-results]');
const selectedPlayerPanel = document.querySelector('[data-selected-player]');
const registrationRequestForm = document.querySelector('[data-admin-registration-request]');
const registrationRequestsList = document.querySelector('[data-registration-requests]');
const allowedViews = new Set(['all', 'age-groups', 'add-player']);
const selectedView = new URLSearchParams(window.location.search).get('view');
const accountView = allowedViews.has(selectedView) ? selectedView : 'all';
document.querySelectorAll('[data-account-view]').forEach(section => { section.hidden = section.dataset.accountView !== accountView; });
document.querySelectorAll('[data-account-view-link]').forEach(link => {
  if (link.dataset.accountViewLink === accountView) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
});
let accounts = [];
let programs = [];
let teamAccess = [];
let matchingPlayers = [];
let selectedPlayer = null;
let playerSearchTimer = null;
let teamPlayerSearchTimer = null;
let teamMatchingPlayers = [];
let selectedRosterPlayer = null;
let adminUser = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = value => value ? new Date(value).toLocaleDateString() : 'Never';
const teamNames = { 'nova-scotia-kings': 'Nova Scotia Kings', 'nova-scotia-vipers': 'Nova Scotia Vipers', 'quebec-predators': 'Quebec Predators', 'montreal-sentinels': 'Montreal Sentinels' };
const halifaxDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Halifax', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

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
    await loadTeamAccess();
    show(feedback, '');
  } catch (error) {
    list.innerHTML = '<tr><td colspan="8">Family account details could not be loaded.</td></tr>';
    show(feedback, error.message);
  }
}

async function loadTeamAccess() {
  if (!teamAccessList) return;
  teamAccessList.innerHTML = '<tr><td colspan="6">Loading team rosters…</td></tr>';
  try {
    const result = await accountAction({ action: 'list_team_rosters' });
    teamAccess = result.roster || [];
  } catch (error) {
    teamAccess = [];
    teamAccessList.innerHTML = '<tr><td colspan="6">Team rosters could not be loaded. Apply the player roster database update first.</td></tr>';
    return;
  }
  teamAccessList.innerHTML = teamAccess.length ? teamAccess.map(grant => `<tr><td><strong>${esc(grant.player ? `${grant.player.first_name} ${grant.player.last_name}` : 'Saved player')}</strong></td><td>${esc(grant.parent_email || 'Family account')}</td><td>${esc(teamNames[grant.team_slug] || grant.team_slug)}</td><td>${esc(ageGroupForBirthDate(grant.player?.date_of_birth) || grant.age_group)}</td><td>${esc(dateText(grant.granted_at))}</td><td><button type="button" class="account-delete-button" data-team-access-revoke="${esc(grant.id)}">Remove</button></td></tr>`).join('') : '<tr><td colspan="6">No players have been added to a team roster yet.</td></tr>';
  teamAccessList.querySelectorAll('[data-team-access-revoke]').forEach(button => button.addEventListener('click', revokeTeamAccess));
}

async function revokeTeamAccess(event) {
  const button = event.currentTarget;
  const grant = teamAccess.find(item => item.id === button.dataset.teamAccessRevoke);
  if (!grant || !confirm(`Remove ${grant.player?.first_name || 'this player'} from the ${teamNames[grant.team_slug] || grant.team_slug} ${grant.age_group} roster?`)) return;
  button.disabled = true;
  const { error } = await client.from('team_age_group_access').delete().eq('id', grant.id);
  if (error) {
    show(feedback, 'The team age-group access could not be revoked.');
    button.disabled = false;
    return;
  }
  show(feedback, 'Player removed from the team roster.', 'success');
  await loadTeamAccess();
}

function renderTeamPlayerResults(players) {
  teamMatchingPlayers = players;
  if (!players.length) {
    teamPlayerResults.innerHTML = '<tr><td colspan="5">No saved players matched that search.</td></tr>';
    return;
  }
  teamPlayerResults.innerHTML = players.map((player, index) => `<tr><td><strong>${esc(player.first_name)} ${esc(player.last_name)}</strong></td><td>${esc(player.date_of_birth || 'Missing')}</td><td>${esc(ageGroupForBirthDate(player.date_of_birth) || 'Not available')}</td><td>${esc(player.parent_name || player.parent_email || 'Family account')}</td><td><button type="button" class="account-action-button" data-select-roster-player="${index}">Select</button></td></tr>`).join('');
  teamPlayerResults.querySelectorAll('[data-select-roster-player]').forEach(button => button.addEventListener('click', () => selectRosterPlayer(Number(button.dataset.selectRosterPlayer))));
}

function selectRosterPlayer(index) {
  selectedRosterPlayer = teamMatchingPlayers[index] || null;
  if (!selectedRosterPlayer) return;
  const group = ageGroupForBirthDate(selectedRosterPlayer.date_of_birth);
  teamAccessPlayerId.value = selectedRosterPlayer.id;
  teamPlayerAgeGroup.textContent = group || 'Unavailable';
  teamPlayerAgeGroupValue.value = group || '';
  teamRosterSubmit.disabled = !['U9', 'U11', 'U13', 'U15'].includes(group) || !selectedRosterPlayer.parent_id;
  teamSelectedPlayerPanel.innerHTML = `<div><p class="eyebrow dark">SELECTED PLAYER</p><strong>${esc(selectedRosterPlayer.first_name)} ${esc(selectedRosterPlayer.last_name)}</strong><span>${esc(group || 'Age group unavailable')} · ${esc(selectedRosterPlayer.parent_name || selectedRosterPlayer.parent_email)}</span></div><button type="button" class="parent-text-button" data-clear-roster-player>CHANGE PLAYER</button>`;
  teamSelectedPlayerPanel.hidden = false;
  teamSelectedPlayerPanel.querySelector('[data-clear-roster-player]').addEventListener('click', clearRosterPlayer);
  teamPlayerSearchStatus.textContent = `Selected ${selectedRosterPlayer.first_name} ${selectedRosterPlayer.last_name}.`;
}

function clearRosterPlayer() {
  selectedRosterPlayer = null;
  teamAccessPlayerId.value = '';
  teamPlayerAgeGroup.textContent = 'Choose a player';
  teamPlayerAgeGroupValue.value = '';
  teamRosterSubmit.disabled = true;
  teamSelectedPlayerPanel.hidden = true;
  teamSelectedPlayerPanel.innerHTML = '';
}

async function searchTeamPlayers() {
  const query = teamPlayerSearch.value.trim();
  if (query.length < 2) {
    teamMatchingPlayers = [];
    teamPlayerResults.innerHTML = '<tr><td colspan="5">Search for an existing player.</td></tr>';
    teamPlayerSearchStatus.textContent = 'Enter at least two letters to search.';
    return;
  }
  teamPlayerSearchStatus.textContent = 'Searching saved players…';
  teamPlayerResults.innerHTML = '<tr><td colspan="5">Searching…</td></tr>';
  try {
    const result = await accountAction({ action: 'search_players', query });
    renderTeamPlayerResults(result.players || []);
    teamPlayerSearchStatus.textContent = `${(result.players || []).length} matching saved player${(result.players || []).length === 1 ? '' : 's'}.`;
  } catch (error) {
    teamPlayerResults.innerHTML = '<tr><td colspan="5">Saved players could not be searched.</td></tr>';
    teamPlayerSearchStatus.textContent = error.message;
  }
}

document.querySelector('[data-team-access-form]')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedRosterPlayer || !teamPlayerAgeGroupValue.value) { show(feedback, 'Search for and select an existing player first.'); return; }
  const values = new FormData(event.currentTarget);
  const { error } = await client.from('team_age_group_access').insert({ parent_id: selectedRosterPlayer.parent_id, player_id: selectedRosterPlayer.id, team_slug: String(values.get('team_slug')), age_group: teamPlayerAgeGroupValue.value });
  if (error) {
    show(feedback, error.code === '23505' ? 'This player is already on that team roster.' : 'The player could not be added. Apply the player roster database update first.');
    return;
  }
  show(feedback, `${selectedRosterPlayer.first_name} ${selectedRosterPlayer.last_name} added to the ${teamNames[String(values.get('team_slug'))]} ${teamPlayerAgeGroupValue.value} roster.`, 'success');
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
  const programResult = await client.from('programs').select('id,title,season,fee,session_count,single_session_available,registration_closes_on,questions,jersey_size_enabled,jersey_number_enabled,is_open').order('created_at', { ascending: false });
  if (programResult.error) {
    if (programSelect) programSelect.innerHTML = '<option value="">Programs could not be loaded</option>';
    show(feedback, 'Open programs could not be loaded for registration requests.');
    return;
  }
  programs = programResult.data || [];
  if (campaignProgram) campaignProgram.innerHTML = '<option value="">Select a program</option>' + programs.map(program => `<option value="${esc(program.id)}">${esc(program.title)} — ${esc(program.season || '')}</option>`).join('');
  const today = halifaxDate();
  const available = programs.filter(program => program.is_open && (!program.registration_closes_on || program.registration_closes_on >= today));
  if (programSelect) programSelect.innerHTML = available.length ? '<option value="">Select a program</option>' + available.map(program => `<option value="${esc(program.id)}">${esc(program.title)} — ${esc(program.season || '')}</option>`).join('') : '<option value="">No open programs available</option>';
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
  const feeText = String(program?.fee ?? '').trim();
  const numericFee = feeText.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const fullCost = numericFee && Number.isFinite(Number(numericFee)) ? Number(numericFee) : null;
  const sessionCount = Number(program?.session_count);
  const singleSessionPrice = program?.single_session_available && fullCost !== null && Number.isInteger(sessionCount) && sessionCount > 0
    ? Math.round((fullCost / sessionCount + Number.EPSILON) * 100) / 100
    : null;
  const money = value => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
  const programCost = fullCost === null ? feeText || 'Contact the academy' : money(fullCost);
  const minimumPayment = program?.single_session_available ? singleSessionPrice : 100;
  document.querySelector('[data-admin-payment-note]').textContent = program
    ? `Full program cost: ${programCost}. Minimum payment: ${minimumPayment === null ? 'contact the academy to confirm' : money(minimumPayment)}. Remaining balance may be paid by e-transfer or cash no later than the second session. E-transfer: kingshockeyacademyns@gmail.com.`
    : 'Select a program to show its fee and payment summary.';
}

function renderPlayerResults(players) {
  matchingPlayers = players;
  if (!players.length) {
    playerSearchResults.innerHTML = '<tr><td colspan="5">No saved players matched that search.</td></tr>';
    return;
  }
  playerSearchResults.innerHTML = players.map((player, index) => `<tr><td><strong>${esc(player.first_name)} ${esc(player.last_name)}</strong><small>${esc(player.date_of_birth || 'Date of birth missing')}</small></td><td>${esc(ageGroupForBirthDate(player.date_of_birth) || 'Not available')}</td><td>${esc(player.parent_name || 'Family account')}</td><td>${player.parent_profile_complete ? '<span class="account-status">READY</span>' : '<span class="account-status is-disabled">PARENT DETAILS NEEDED</span>'}<small>${esc(player.parent_email || '')}</small></td><td><button type="button" class="account-action-button" data-select-player="${index}" ${player.can_request ? '' : 'disabled'}>${player.can_request ? 'Select' : 'Unavailable'}</button></td></tr>`).join('');
  playerSearchResults.querySelectorAll('[data-select-player]').forEach(button => button.addEventListener('click', () => selectExistingPlayer(Number(button.dataset.selectPlayer))));
}

function selectExistingPlayer(index) {
  selectedPlayer = matchingPlayers[index];
  if (!selectedPlayer) return;
  document.querySelector('[data-selected-child-id]').value = selectedPlayer.id;
  selectedPlayerPanel.innerHTML = `<div><p class="eyebrow dark">SELECTED PLAYER</p><strong>${esc(selectedPlayer.first_name)} ${esc(selectedPlayer.last_name)}</strong><span>${esc(ageGroupForBirthDate(selectedPlayer.date_of_birth) || 'Age group unavailable')} · ${esc(selectedPlayer.parent_name || selectedPlayer.parent_email)}</span></div><button type="button" class="parent-text-button" data-clear-selected-player>CHANGE PLAYER</button>`;
  selectedPlayerPanel.hidden = false;
  registrationRequestForm.hidden = false;
  selectedPlayerPanel.querySelector('[data-clear-selected-player]').addEventListener('click', clearSelectedPlayer);
  updateProgramSummary();
  show(feedback, 'Choose a program. The parent will receive the waivers and terms for confirmation.', 'success');
}

function clearSelectedPlayer() {
  selectedPlayer = null;
  document.querySelector('[data-selected-child-id]').value = '';
  selectedPlayerPanel.hidden = true;
  selectedPlayerPanel.innerHTML = '';
  registrationRequestForm.hidden = true;
  registrationRequestForm.reset();
  updateProgramSummary();
}

async function searchExistingPlayers() {
  const query = playerSearch.value.trim();
  const status = document.querySelector('[data-player-search-status]');
  if (query.length < 2) {
    matchingPlayers = [];
    playerSearchResults.innerHTML = '<tr><td colspan="5">Search for an existing player.</td></tr>';
    status.textContent = 'Enter at least two letters to search.';
    return;
  }
  status.textContent = 'Searching saved players…';
  playerSearchResults.innerHTML = '<tr><td colspan="5">Searching…</td></tr>';
  try {
    const result = await accountAction({ action: 'search_players', query });
    renderPlayerResults(result.players || []);
    status.textContent = `${(result.players || []).length} matching saved player${(result.players || []).length === 1 ? '' : 's'}.`;
  } catch (error) {
    playerSearchResults.innerHTML = '<tr><td colspan="5">Saved players could not be searched.</td></tr>';
    status.textContent = error.message;
  }
}

async function requestPlayerRegistration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!selectedPlayer || !selectedPlayer.can_request) { show(feedback, 'Choose a player who already has a complete family profile.'); return; }
  const values = new FormData(form);
  const today = halifaxDate();
  const program = programs.find(item => item.id === String(values.get('program_id')) && item.is_open && (!item.registration_closes_on || item.registration_closes_on >= today));
  if (!program) { show(feedback, 'Select an open program.'); return; }
  const customAnswers = {};
  if (program.jersey_size_enabled) customAnswers['Jersey size (optional)'] = String(values.get('admin_jersey_size') || '').trim();
  (Array.isArray(program.questions) ? program.questions : []).forEach((question, index) => { customAnswers[String(index)] = String(values.get(`admin_question_${index}`) || '').trim(); });
  const recipients = [selectedPlayer.parent_email, selectedPlayer.second_guardian_email].filter(Boolean).join(' and ');
  if (!confirm(`Send the current waivers and registration terms for ${selectedPlayer.first_name} ${selectedPlayer.last_name} to ${recipients}? The registration will only be created after a parent confirms.`)) return;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  show(feedback, 'Sending the parent approval request…', 'success');
  try {
    const result = await accountAction({
      action: 'request_registration_approval',
      child_id: selectedPlayer.id,
      program_id: program.id,
      form_data: {
        jersey_number: program.jersey_number_enabled ? String(values.get('jersey_number') || '').trim() : '',
        custom_answers: customAnswers,
        experience: String(values.get('experience') || ''),
        notes: String(values.get('notes') || '').trim(),
      },
    });
    clearSelectedPlayer();
    show(feedback, `Confirmation email sent to ${result.sent_to} for ${program.title}. The player will be registered after the parent approves.`, 'success');
    await loadRegistrationRequests();
  } catch (error) { show(feedback, error.message); }
  finally { submit.disabled = false; }
}

async function loadRegistrationRequests() {
  if (!registrationRequestsList) return;
  registrationRequestsList.innerHTML = '<tr><td colspan="5">Loading parent approval requests…</td></tr>';
  try {
    const result = await accountAction({ action: 'list_registration_approval_requests' });
    const items = result.requests || [];
    registrationRequestsList.innerHTML = items.length ? items.map(item => `<tr><td>${esc(item.player_name)}</td><td>${esc(item.program_title)}</td><td>${esc(item.parent_email)}</td><td><span class="account-status ${['pending', 'email_failed'].includes(item.status) ? 'is-disabled' : ''}">${esc(item.status === 'email_failed' ? 'EMAIL SETUP REQUIRED' : item.status.toUpperCase())}</span></td><td>${esc(dateText(item.created_at))}</td></tr>`).join('') : '<tr><td colspan="5">No parent approval requests yet.</td></tr>';
  } catch (error) {
    registrationRequestsList.innerHTML = `<tr><td colspan="5">${esc(error.message)}</td></tr>`;
  }
}

document.querySelector('[data-account-invite]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await accountAction({ action: 'invite', email: form.elements.email.value.trim() });
    form.reset();
    show(feedback, `Login instructions sent to ${result.email}.`, 'success');
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

registrationRequestForm?.addEventListener('submit', requestPlayerRegistration);
programSelect?.addEventListener('change', updateProgramSummary);
campaignType?.addEventListener('change', updateCampaignMode);
campaignProgram?.addEventListener('change', () => { void refreshCampaignAudience(); });
search?.addEventListener('input', renderAccounts);
document.querySelector('[data-account-refresh]')?.addEventListener('click', () => { void loadAccounts(); });
document.querySelector('[data-team-access-refresh]')?.addEventListener('click', () => { void loadTeamAccess(); });
document.querySelector('[data-registration-requests-refresh]')?.addEventListener('click', () => { void loadRegistrationRequests(); });
playerSearch?.addEventListener('input', () => {
  clearTimeout(playerSearchTimer);
  playerSearchTimer = setTimeout(() => { void searchExistingPlayers(); }, 280);
});
teamPlayerSearch?.addEventListener('input', () => {
  if (selectedRosterPlayer) clearRosterPlayer();
  clearTimeout(teamPlayerSearchTimer);
  teamPlayerSearchTimer = setTimeout(() => { void searchTeamPlayers(); }, 280);
});
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
  if (accountView === 'add-player') await loadRegistrationRequests();
  updateCampaignMode();
  client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') window.location.replace('admin.html'); });
}

initialize();
