document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      mainNav.classList.toggle('open');
    });
  }

  // Genre filtering
  const filters = document.querySelectorAll('.filter');
  const cards = document.querySelectorAll('.review-card');

  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.filter;
      cards.forEach((card) => {
        const match = target === 'all' || card.dataset.genre === target;
        card.classList.toggle('hidden-card', !match);
      });
    });
  });

  // Newsletter form (front-end only placeholder)
  const form = document.getElementById('newsletter-form');
  const note = document.getElementById('form-note');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]').value.trim();
      if (email) {
        note.textContent = `Thanks — we'll send reviews to ${email}.`;
        form.reset();
      }
    });
  }
});
