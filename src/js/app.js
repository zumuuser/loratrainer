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

  async function checkForUpdates() {
    try {
      const res = await window.api.updater.check();
      if (res && res.updateAvailable && !res.error) {
        const updateCard = document.getElementById('update-notification');
        if (updateCard) {
          updateCard.classList.remove('hidden');
          const btn = document.getElementById('update-btn');
          btn.onclick = async () => {
            btn.disabled = true;
            btn.innerHTML = `<span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 4px;">↻</span> Updating...`;
            toast('Downloading update from GitHub...', 'info');
            const success = await window.api.updater.perform(res.latestSha);
            if (success && !success.error) {
              toast('Update installed! Relaunching...', 'success');
            } else {
              toast(`Update failed: ${success.error || 'unknown error'}`, 'error');
              btn.disabled = false;
              btn.textContent = 'Update App';
            }
          };
        }
      }
    } catch (e) {
      console.error('Failed checking for updates:', e);
    }
  }

  // Init
  async function init() {
    // Nav click handlers
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });

    // Check onboarding
    const onboarded = await window.api.db.isOnboarded();
    await navigate(onboarded ? 'dashboard' : 'onboarding');

    // Run update check
    if (onboarded) {
      checkForUpdates();
    }
  }

  // Boot on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  return { registerPage, navigate, toast };
})();
