import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const teams = {
  'nova-scotia-kings': { name: 'Nova Scotia Kings', city: 'Pictou County' },
  'nova-scotia-vipers': { name: 'Nova Scotia Vipers', city: 'Greater Halifax' },
  'quebec-predators': { name: 'Quebec Predators', city: 'Quebec City' },
  'montreal-sentinels': { name: 'Montreal Sentinels', city: 'Montreal' },
};
const ageGroups = new Set(['U9', 'U11', 'U13', 'U15']);
const params = new URLSearchParams(window.location.search);
const teamSlug = params.get('team');
const ageGroup = params.get('age_group')?.toUpperCase();
const team = teams[teamSlug];
const message = document.querySelector('[data-age-group-message]');
const login = document.querySelector('[data-age-group-login]');
const privateContent = document.querySelector('[data-age-group-private]');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function showMessage(text, kind = '') {
  message.textContent = text;
  message.className = `alert${kind ? ` ${kind}` : ''}`;
  message.hidden = !text;
}

async function initialize() {
  if (!team || !ageGroups.has(ageGroup)) {
    document.querySelector('[data-age-group-heading]').innerHTML = 'TEAM<br><em>AGE GROUP.</em>';
    document.querySelector('[data-age-group-subtitle]').textContent = 'Choose an age group from a team page to continue.';
    showMessage('This team or age group could not be found.', 'error');
    return;
  }

  document.title = `${team.name} ${ageGroup} | Kings Hockey Academy`;
  document.querySelector('[data-age-group-heading]').innerHTML = `${escapeHtml(team.name)}<br><em>${ageGroup} TEAM.</em>`;
  document.querySelector('[data-age-group-subtitle]').textContent = `${team.city} · ${ageGroup} age group`;
  document.querySelector('[data-age-group-title]').textContent = `${team.name} · ${ageGroup}`;
  document.querySelector('[data-age-group-description]').textContent = `This private family page is for ${team.name} families with administrator-approved ${ageGroup} access.`;
  document.querySelector('[data-team-back]').href = `teams/${teamSlug}.html`;

  const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY;
  if (!configured) {
    showMessage('The family access system is not connected. Please contact the academy.', 'error');
    return;
  }
  const client = createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY);
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    showMessage('Your sign-in could not be checked. Please refresh the page or sign in again.', 'error');
    return;
  }
  if (!sessionData.session) {
    showMessage('Sign in with a family account to check whether this team page has been shared with you.');
    login.hidden = false;
    return;
  }

  const { data, error } = await client.from('team_age_group_access')
    .select('id')
    .eq('parent_id', sessionData.session.user.id)
    .eq('team_slug', teamSlug)
    .eq('age_group', ageGroup)
    .maybeSingle();
  if (error) {
    showMessage('Team access could not be checked. The access setup may still need to be applied by the site administrator.', 'error');
    return;
  }
  if (!data) {
    showMessage('This family account has not been granted access to this team age group. Please contact the academy administrator.');
    return;
  }
  showMessage('Your family account has access to this team age group.', 'success');
  privateContent.hidden = false;
}

initialize();
