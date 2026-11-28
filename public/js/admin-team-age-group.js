import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const teams = {
  'nova-scotia-kings': { name: 'Nova Scotia Kings', logo: 'assets/nova-scotia-kings.png' },
  'nova-scotia-vipers': { name: 'Nova Scotia Vipers', logo: 'assets/nova-scotia-vipers.png' },
  'quebec-predators': { name: 'Quebec Predators', logo: 'assets/quebec-predators-transparent.png' },
  'montreal-sentinels': { name: 'Montreal Sentinels', logo: 'assets/montreal-sentinels-transparent.png' }
};
const validAges = ['U9', 'U11', 'U13', 'U15'];
const params = new URLSearchParams(location.search);
const teamSlug = params.get('team');
const age = (params.get('age') || '').toUpperCase();
const team = teams[teamSlug];
const message = document.querySelector('[data-age-page-message]');
const configured = window.KHA_SUPABASE_URL?.startsWith('https://') && window.KHA_SUPABASE_PUBLISHABLE_KEY && !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY) : null;

function notice(text, error = false) {
  if (!message) return;
  message.textContent = text;
  message.className = `alert ${error ? 'error' : 'success'} admin-message`;
  message.hidden = !text;
}

function renderPage() {
  if (!team || !validAges.includes(age)) {
    notice('The team or age group link is missing or invalid. Return to Teams and select a team and age group.', true);
    document.querySelector('.age-hub-grid')?.setAttribute('hidden', '');
    return false;
  }
  document.title = `${team.name} ${age} | Team Management | Kings Hockey Academy`;
  const teamName = document.querySelector('[data-age-team-name]');
  if (teamName) teamName.textContent = team.name.toUpperCase();
  const heading = document.querySelector('[data-age-heading]');
  if (heading) heading.innerHTML = `${age} <em>MANAGEMENT.</em>`;
  const crumb = document.querySelector('[data-age-breadcrumb]');
  if (crumb) crumb.textContent = age;
  const teamLink = document.querySelector('[data-age-team-link]');
  if (teamLink) {
    teamLink.textContent = team.name.toUpperCase();
    teamLink.href = `admin-team.html?team=${encodeURIComponent(teamSlug)}`;
  }
  const logo = document.querySelector('[data-age-team-logo]');
  if (logo) { logo.src = team.logo; logo.alt = `${team.name} logo`; }
  const roster = document.querySelector('[data-age-roster-link]');
  if (roster) roster.href = `admin-team-roster.html?team=${encodeURIComponent(teamSlug)}&age=${encodeURIComponent(age)}`;
  const schedule = document.querySelector('[data-age-schedule-link]');
  if (schedule) schedule.href = `admin-team-schedule.html?team=${encodeURIComponent(teamSlug)}&age=${encodeURIComponent(age)}`;
  const staff = document.querySelector('[data-age-staff-link]');
  if (staff) staff.href = `admin-team-staff.html?team=${encodeURIComponent(teamSlug)}&age_group=${encodeURIComponent(age)}`;
  return true;
}

async function init() {
  const valid = renderPage();
  if (!client) { notice('Supabase configuration is missing. Check public/supabase-config.js.', true); return; }
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) { location.replace('parent-account.html'); return; }
  const { data: isAdmin, error: adminError } = await client.rpc('kha_is_admin');
  if (adminError || isAdmin !== true) { notice('This page is restricted to approved academy administrators.', true); document.querySelector('.age-hub-grid')?.setAttribute('aria-disabled', 'true'); document.querySelectorAll('.age-hub-card').forEach(a => a.addEventListener('click', e => e.preventDefault())); return; }
  const email = document.querySelector('[data-age-admin-email]');
  if (email) email.textContent = data.session.user.email || '';
  document.querySelector('[data-age-group-logout]')?.addEventListener('click', async () => { await client.auth.signOut(); location.replace('parent-account.html'); });
  if (!valid) return;
}
init();
