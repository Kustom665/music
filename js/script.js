document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mobile nav
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  const setNav = (open) => {
    mainNav.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  };
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => setNav(!mainNav.classList.contains('open')));
    mainNav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mainNav.classList.contains('open')) { setNav(false); navToggle.focus(); }
    });
    window.matchMedia('(min-width: 641px)').addEventListener('change', (m) => { if (m.matches) setNav(false); });
  }

  // Review filtering and "load more"
  const filters = [...document.querySelectorAll('.filter')];
  const cards = [...document.querySelectorAll('.review-card')];
  const loadMore = document.getElementById('load-more');
  const empty = document.getElementById('reviews-empty');
  const count = document.getElementById('reviews-count');
  let current = 'all';
  let loaded = false;

  function render() {
    let shown = 0;
    cards.forEach((card) => {
      const match = current === 'all' || card.dataset.genre === current;
      const held = current === 'all' && !loaded && card.dataset.extra === 'true';
      const show = match && !held;
      card.classList.toggle('hidden-card', !show);
      if (show) shown++;
    });
    empty.hidden = shown > 0;
    if (loadMore) loadMore.parentElement.hidden = !(current === 'all' && !loaded);
    count.textContent = `Showing ${shown} review${shown === 1 ? '' : 's'}`;
  }

  function setFilter(genre) {
    current = genre;
    filters.forEach((b) => {
      const on = b.dataset.filter === genre;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    render();
  }

  filters.forEach((btn) => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));

  document.querySelectorAll('.genre-card').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setFilter(link.dataset.genre);
      document.getElementById('reviews').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  if (loadMore) {
    loadMore.addEventListener('click', () => {
      loaded = true;
      render();
      const firstNew = cards.find((c) => c.dataset.extra === 'true');
      if (firstNew) { firstNew.setAttribute('tabindex', '-1'); firstNew.focus({ preventScroll: true }); }
    });
  }
  render();

  // Featured review: expand in place
  const fullToggle = document.getElementById('full-toggle');
  const fullReview = document.getElementById('full-review');
  if (fullToggle && fullReview) {
    fullToggle.addEventListener('click', () => {
      const open = fullReview.hidden;
      fullReview.hidden = !open;
      fullToggle.setAttribute('aria-expanded', String(open));
      fullToggle.textContent = open ? 'Show less ↑' : 'Read the full review →';
    });
  }

  // Newsletter (front-end only: not connected to a mailing list)
  const form = document.getElementById('newsletter-form');
  const note = document.getElementById('form-note');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]').value.trim();
      if (email) {
        note.textContent = 'Looks good. This preview form is not connected to a mailing list yet, so nothing was sent or saved.';
        form.reset();
      }
    });
  }
});
