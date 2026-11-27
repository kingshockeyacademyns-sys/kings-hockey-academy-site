/* Shared admin dropdown behavior. Supports mouse, keyboard and touch. */
(() => {
  document.querySelectorAll('[data-admin-team-dropdown]').forEach((root) => {
    const button = root.querySelector('.admin-team-toggle');
    if (!button) return;
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
