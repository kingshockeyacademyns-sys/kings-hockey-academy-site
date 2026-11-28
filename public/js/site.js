document.getElementById('year')?.replaceChildren(String(new Date().getFullYear()));

document.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const dropdown = toggle.closest('.nav-dropdown');
    const isOpen = dropdown.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
});

document.addEventListener('click', event => {
  document.querySelectorAll('.nav-dropdown.is-open').forEach(dropdown => {
    if (!dropdown.contains(event.target)) {
      dropdown.classList.remove('is-open');
      dropdown.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
    }
  });
});

// Shared public header account indicator. Login state is read from the same
// Supabase persisted session used by parent and coach account pages.
const accountNav = document.querySelector('[data-account-nav]');
if (accountNav) {
  const statusEl = accountNav.querySelector('[data-account-status]');
  const identityEl = accountNav.querySelector('[data-account-identity]');
  const renderAccount = user => {
    if (!user) {
      statusEl.textContent = 'Login';
      identityEl.hidden = true;
      identityEl.textContent = '';
      accountNav.classList.remove('is-account-active');
      accountNav.setAttribute('aria-label', 'Login to your account');
      return;
    }
    statusEl.textContent = 'Logged in';
    identityEl.textContent = user.email || user.user_metadata?.full_name || user.user_metadata?.name || 'Account active';
    identityEl.hidden = false;
    accountNav.classList.add('is-account-active');
    accountNav.setAttribute('aria-label', `Logged in as ${identityEl.textContent}. Open your account`);
  };

  const initializeAccountNav = async () => {
    if (!window.KHA_SUPABASE_URL?.startsWith('https://') || !window.KHA_SUPABASE_PUBLISHABLE_KEY) {
      renderAccount(null);
      return;
    }
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const client = createClient(window.KHA_SUPABASE_URL, window.KHA_SUPABASE_PUBLISHABLE_KEY);
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      renderAccount(data.session?.user || null);
      client.auth.onAuthStateChange((_event, session) => renderAccount(session?.user || null));
    } catch (error) {
      console.error('Unable to read account session for site header:', error);
      renderAccount(null);
    }
  };
  initializeAccountNav();
}
