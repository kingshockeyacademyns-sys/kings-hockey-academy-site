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
