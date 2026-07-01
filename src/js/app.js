/* ═══════════════════════════════════════════
   App Router & State Management
   ═══════════════════════════════════════════ */

const App = (() => {
  let currentPage = null;
  const pages = {};

  // Register a page renderer
  function registerPage(name, renderFn) {
    pages[name] = renderFn;
  }

  // Navigate to page
  async function navigate(page, params = {}) {
    const content = document.getElementById('content');
    const sidebar = document.getElementById('sidebar');

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Show/hide sidebar (hidden during onboarding)
    if (page === 'onboarding') {
      sidebar.classList.add('hidden');
    } else {
      sidebar.classList.remove('hidden');
    }

    // Render page
    if (pages[page]) {
      currentPage = page;
      content.innerHTML = '';
      await pages[page](content, params);
    }
  }

  // Toast notifications
  function toast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, 3500);
  }

  // Init
  async function init() {
    // Nav click handlers
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });

    // Check onboarding
    const onboarded = await window.api.db.isOnboarded();
    navigate(onboarded ? 'dashboard' : 'onboarding');
  }

  // Boot on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  return { registerPage, navigate, toast };
})();
