import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  team_staff: 'Team Staff'
};
const params = new URLSearchParams(location.search);
const teamSlug = params.get('team');
const ageSelect = document.querySelector('[data-public-staff-age]');
const state = document.querySelector('[data-public-staff-state]');
const list = document.querySelector('[data-public-staff-list]');
const heading = document.querySelector('[data-public-staff-heading]');
const intro = document.querySelector('[data-public-staff-intro]');
const back = document.querySelector('[data-public-staff-back]');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadStaff() {
  if (!teams[teamSlug]) {
    state.textContent = 'This team could not be found.';
    ageSelect.disabled = true;
    return;
  }
  const ageGroup = ageSelect.value;
  state.textContent = 'Loading team staff…';
  list.innerHTML = '';
  try {
    const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY;
    if (!configured) throw new Error('The team directory is not connected. Please contact the academy.');
    const client = createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY);
    const { data, error } = await client.functions.invoke('manage-team-staff', {
      body: { action: 'public_list', team_slug: teamSlug, age_group: ageGroup }
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'The staff list could not be loaded.');
    const staff = Array.isArray(data.staff) ? data.staff : [];
    const deduped = [...new Map(staff.map(member => [
      `${member.display_name}|${member.staff_role}|${member.age_group || 'all'}`, member
    ])).values()];
    if (!deduped.length) {
      state.textContent = 'No active staff assignments are listed for this team and age group yet.';
      return;
    }
    state.textContent = `${deduped.length} active staff assignment${deduped.length === 1 ? '' : 's'}.`;
    list.innerHTML = deduped.map(member => `<article class="public-staff-card">
      <h3>${esc(member.display_name || 'Team Staff')}</h3>
      <p>${esc(roles[member.staff_role] || 'Team Staff')}</p>
      <small>${esc(member.age_group || 'All age groups')}</small>
    </article>`).join('');
  } catch (error) {
    state.textContent = error.message || 'The staff list could not be loaded.';
  }
}

heading.innerHTML = `${esc(teams[teamSlug] || 'TEAM')}<br><em>STAFF.</em>`;
intro.textContent = `Meet the staff supporting ${teams[teamSlug] || 'this team'}. Staff names and positions are shown; account email addresses are kept private.`;
back.href = teams[teamSlug] ? `teams/${teamSlug}.html` : 'teams.html';
ageSelect.value = (params.get('age_group') || 'all').toUpperCase();
ageSelect.addEventListener('change', () => {
  const url = new URL(location.href);
  if (ageSelect.value === 'all') url.searchParams.delete('age_group');
  else url.searchParams.set('age_group', ageSelect.value);
  history.replaceState({}, '', url);
  void loadStaff();
});
void loadStaff();
