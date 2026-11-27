import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const teams = {
  'nova-scotia-kings': { name: 'Nova Scotia Kings', logo: 'assets/nova-scotia-kings.png' },
  'nova-scotia-vipers': { name: 'Nova Scotia Vipers', logo: 'assets/nova-scotia-vipers.png' },
  'quebec-predators': { name: 'Quebec Predators', logo: 'assets/quebec-predators-transparent.png' },
  'montreal-sentinels': { name: 'Montreal Sentinels', logo: 'assets/montreal-sentinels-transparent.png' }
};

const params = new URLSearchParams(location.search);
const teamSlug = params.get('team');
const team = teams[teamSlug];
const message = document.querySelector('[data-team-page-message]');

const configured = window.KHA_SUPABASE_URL?.startsWith('https://') &&
  window.KHA_SUPABASE_PUBLISHABLE_KEY &&
  !window.KHA_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');
const client = configured
  ? createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY)
  : null;

function notice(text, error = false) {
  if (!message) return;
  message.textContent = text;
  message.className = `alert ${error ? 'error' : 'success'} admin-message`;
  message.hidden = !text;
}

function renderTeam() {
  if (!team) {
    notice('The team link is missing or invalid. Return to the Teams overview and select a team.', true);
    document.querySelector('.team-age-grid')?.setAttribute('hidden', '');
    return;
  }

  document.title = `${team.name} | Team Management | Kings Hockey Academy`;
  const heading = document.querySelector('[data-team-heading]');
  if (heading) heading.textContent = team.name.toUpperCase();
  const breadcrumb = document.querySelector('[data-team-breadcrumb]');
  if (breadcrumb) breadcrumb.textContent = team.name.toUpperCase();
  const logo = document.querySelector('[data-team-logo]');
  if (logo) {
    logo.src = team.logo;
    logo.alt = `${team.name} logo`;
  }
  document.querySelectorAll('[data-age-link]').forEach(link => {
    const age = link.dataset.ageLink;
    link.href = `admin-team-age-group.html?team=${encodeURIComponent(teamSlug)}&age=${encodeURIComponent(age)}`;
    link.setAttribute('aria-label', `Manage ${team.name} ${age}`);
  });
}

async function init() {
  renderTeam();
  if (!client) {
    notice('Supabase configuration is missing. Check public/supabase-config.js.', true);
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    location.replace('admin.html');
    return;
  }

  const { data: isAdmin, error: adminError } = await client.rpc('kha_is_admin');
  if (adminError || isAdmin !== true) {
    notice('This page is restricted to approved academy administrators.', true);
    document.querySelector('.team-age-grid')?.setAttribute('aria-disabled', 'true');
    document.querySelectorAll('.team-age-card').forEach(link => {
      link.addEventListener('click', event => event.preventDefault());
    });
    return;
  }

  const email = document.querySelector('[data-team-page-email]');
  if (email) email.textContent = data.session.user.email || '';
  document.querySelector('[data-team-page-logout]')?.addEventListener('click', async () => {
    await client.auth.signOut();
    location.replace('admin.html');
  });
}

init();
