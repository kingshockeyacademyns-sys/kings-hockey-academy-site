/* Shared admin navigation. Builds a complete Teams tree so every team, age group,
   roster and schedule is reachable from every admin page. */
(() => {
  const teams = [
    { slug: 'nova-scotia-kings', name: 'Nova Scotia Kings' },
    { slug: 'nova-scotia-vipers', name: 'Nova Scotia Vipers' },
    { slug: 'quebec-predators', name: 'Quebec Predators' },
    { slug: 'montreal-sentinels', name: 'Montreal Sentinels' }
  ];
  const ages = ['U9', 'U11', 'U13', 'U15'];
  const makeLink = (label, href, extra = '') => `<a href="${href}" ${extra}>${label}</a>`;

  document.querySelectorAll('[data-admin-team-dropdown]').forEach((root) => {
    const button = root.querySelector('.admin-team-toggle');
    const menu = root.querySelector('.admin-team-submenu');
    if (!button || !menu) return;

    menu.classList.add('admin-team-tree');
    menu.setAttribute('aria-label', 'Teams and team management pages');
    menu.innerHTML = makeLink('All Teams', 'admin-teams.html', 'class="admin-tree-all"') + teams.map((team) => {
      const teamUrl = `admin-team.html?team=${team.slug}`;
      const teamBlock = `<details class="admin-team-branch"><summary>${team.name}</summary><div class="admin-team-branch-content">` +
        makeLink('Team Overview', teamUrl, 'class="admin-tree-team-link"') +
        ages.map((age) => {
          const ageUrl = `admin-team-age-group.html?team=${team.slug}&age=${age}`;
          const rosterUrl = `admin-team-roster.html?team=${team.slug}&age=${age}`;
          const scheduleUrl = `admin-team-schedule.html?team=${team.slug}&age=${age}`;
          return `<details class="admin-age-branch"><summary>${age}</summary><div class="admin-age-branch-content">` +
            makeLink('Age Group Overview', ageUrl) + makeLink('Team Roster', rosterUrl) + makeLink('Team Schedule', scheduleUrl) +
            `</div></details>`;
        }).join('') + `</div></details>`;
      return teamBlock;
    }).join('');

    // Expand the relevant team/age branches automatically when the current page is
    // one of their subpages, so users can see where they are in the menu tree.
    const params = new URLSearchParams(window.location.search);
    const currentTeam = params.get('team');
    const currentAge = (params.get('age') || '').toUpperCase();
    const pathname = window.location.pathname.split('/').pop();
    const allLinks = menu.querySelectorAll('a[href]');
    allLinks.forEach((link) => {
      const url = new URL(link.href, window.location.href);
      const page = url.pathname.split('/').pop();
      const linkTeam = url.searchParams.get('team');
      const linkAge = (url.searchParams.get('age') || '').toUpperCase();
      if (page === pathname && linkTeam === currentTeam && linkAge === currentAge) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
        link.closest('details.admin-age-branch')?.setAttribute('open', '');
        link.closest('details.admin-team-branch')?.setAttribute('open', '');
      }
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      const open = root.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!root.contains(event.target)) {
        root.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
      }
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        root.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        button.focus();
      }
    });
  });
})();
