import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') &&
  window.KHA_SUPABASE_PUBLISHABLE_KEY &&
  !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;
const teams = {
  'nova-scotia-kings': 'Nova Scotia Kings',
  'nova-scotia-vipers': 'Nova Scotia Vipers',
  'quebec-predators': 'Quebec Predators',
  'montreal-sentinels': 'Montreal Sentinels'
};
const roles = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  team_manager: 'Team Manager',
  team_staff: 'Other Team Staff'
};
const teamSelect = document.querySelector('[data-staff-team]');
const form = document.querySelector('[data-staff-invite-form]');
const submitButton = document.querySelector('[data-staff-invite-submit]');
const list = document.querySelector('[data-staff-list]');
const count = document.querySelector('[data-staff-count]');
const message = document.querySelector('[data-staff-message]');
let currentSession = null;
let staff = [];

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function notice(text, isError = false) {
  if (!message) return;
  message.textContent = text;
  message.className = `staff-feedback ${isError ? 'error' : 'success'}`;
  message.hidden = !text;
}

function errorText(error, data) {
  return data?.error || error?.message || 'The request could not be completed. Please try again.';
}

async function callStaffFunction(body) {
  const { data, error } = await client.functions.invoke('manage-team-staff', { body });
  if (error || data?.error) throw new Error(errorText(error, data));
  return data || {};
}

function renderStaff() {
  const teamSlug = teamSelect.value;
  if (count) count.textContent = `${staff.length} staff member${staff.length === 1 ? '' : 's'} assigned to ${teams[teamSlug] || 'this team'}.`;
  if (!staff.length) {
    list.innerHTML = '<tr><td colspan="5">No staff members are assigned to this team yet.</td></tr>';
    return;
  }
  list.innerHTML = staff.map(member => {
    const active = member.is_active === true;
    const disabledAccount = member.account_disabled === true;
    const status = disabledAccount ? 'Account disabled' : active ? 'Active' : 'Inactive';
    const statusClass = active && !disabledAccount ? '' : ' inactive';
    const assigned = member.created_at ? new Date(member.created_at).toLocaleDateString() : '—';
    const email = member.email || 'Account email unavailable';
    return `<tr>
      <td><strong>${esc(email)}</strong><small>${esc(member.user_id || '')}</small></td>
      <td>${esc(roles[member.staff_role] || member.staff_role || 'Unassigned')}</td>
      <td><span class="staff-status${statusClass}">${esc(status)}</span></td>
      <td>${esc(assigned)}</td>
      <td><div class="staff-actions">
        <button type="button" class="staff-action" data-staff-active="${esc(member.id)}" data-next-active="${active ? 'false' : 'true'}" ${disabledAccount ? 'disabled' : ''}>${active ? 'Deactivate' : 'Activate'}</button>
        <button type="button" class="staff-action remove" data-staff-remove="${esc(member.id)}">Remove</button>
      </div></td>
    </tr>`;
  }).join('');
  list.querySelectorAll('[data-staff-active]').forEach(button => button.addEventListener('click', () => void setActive(button)));
  list.querySelectorAll('[data-staff-remove]').forEach(button => button.addEventListener('click', () => void removeStaff(button)));
}

async function loadStaff(showNotice = false) {
  const teamSlug = teamSelect.value;
  if (!teams[teamSlug]) return;
  if (count) count.textContent = `Loading staff for ${teams[teamSlug]}…`;
  list.innerHTML = '<tr><td colspan="5">Loading staff…</td></tr>';
  try {
    const result = await callStaffFunction({ action: 'list', team_slug: teamSlug });
    staff = Array.isArray(result.staff) ? result.staff : [];
    renderStaff();
    if (showNotice) notice(`Staff list refreshed for ${teams[teamSlug]}.`);
  } catch (error) {
    staff = [];
    list.innerHTML = `<tr><td colspan="5">${esc(error.message)}</td></tr>`;
    if (count) count.textContent = 'Staff list could not be loaded.';
    notice(error.message, true);
  }
}

async function inviteStaff(event) {
  event.preventDefault();
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const staffRole = String(formData.get('staff_role') || '').trim();
  const teamSlug = teamSelect.value;
  if (!email || !teams[teamSlug] || !roles[staffRole]) {
    notice('Enter a valid email address, team and staff position.', true);
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = 'ASSIGNING…';
  try {
    const result = await callStaffFunction({ action: 'invite', email, team_slug: teamSlug, staff_role: staffRole });
    form.reset();
    if (result.invitation_sent) {
      notice(`Invitation sent to ${email} and assigned to ${teams[teamSlug]} as ${roles[staffRole]}.`);
    } else {
      notice(`Existing account ${email} assigned to ${teams[teamSlug]} as ${roles[staffRole]}. No duplicate account was created.`);
    }
    await loadStaff();
  } catch (error) {
    notice(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'ASSIGN STAFF <b>↗</b>';
  }
}

async function setActive(button) {
  const membershipId = button.dataset.staffActive;
  const isActive = button.dataset.nextActive === 'true';
  const member = staff.find(row => row.id === membershipId);
  const label = member?.email || 'this staff member';
  if (!confirm(`${isActive ? 'Activate' : 'Deactivate'} ${label} for ${teams[teamSelect.value]}?`)) return;
  button.disabled = true;
  try {
    await callStaffFunction({ action: 'set_active', membership_id: membershipId, is_active: isActive });
    notice(`${label} ${isActive ? 'activated' : 'deactivated'} for ${teams[teamSelect.value]}.`);
    await loadStaff();
  } catch (error) {
    notice(error.message, true);
    button.disabled = false;
  }
}

async function removeStaff(button) {
  const membershipId = button.dataset.staffRemove;
  const member = staff.find(row => row.id === membershipId);
  const email = member?.email || 'this staff member';
  if (!confirm(`Remove ${email} from ${teams[teamSelect.value]}? This removes only the team staff assignment; it does not delete the person's account or parent profile.`)) return;
  button.disabled = true;
  try {
    await callStaffFunction({ action: 'remove', membership_id: membershipId });
    notice(`${email} removed from ${teams[teamSelect.value]}. Their account has not been deleted.`);
    await loadStaff();
  } catch (error) {
    notice(error.message, true);
    button.disabled = false;
  }
}

async function init() {
  if (!client) {
    notice('Supabase configuration is missing. Check public/supabase-config.js.', true);
    return;
  }
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    location.replace('admin.html');
    return;
  }
  currentSession = data.session;
  const { data: isAdmin, error: adminError } = await client.rpc('kha_is_admin');
  if (adminError || isAdmin !== true) {
    notice('This page is restricted to approved academy administrators.', true);
    form.querySelectorAll('input,select,button').forEach(element => element.disabled = true);
    teamSelect.disabled = true;
    return;
  }
  const email = document.querySelector('[data-staff-admin-email]');
  if (email) email.textContent = currentSession.user.email || '';
  document.querySelector('[data-staff-admin-logout]')?.addEventListener('click', async () => {
    await client.auth.signOut();
    location.replace('admin.html');
  });
  teamSelect.addEventListener('change', () => { notice(''); void loadStaff(); });
  form.addEventListener('submit', inviteStaff);
  document.querySelector('[data-staff-refresh]')?.addEventListener('click', () => void loadStaff(true));
  await loadStaff();
}

init();
