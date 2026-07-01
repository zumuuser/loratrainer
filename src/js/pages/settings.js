/* Settings Page — API keys + preferences */
App.registerPage('settings', async (container) => {
  const name = await window.api.db.getSetting('user_name') || '';
  const orKey = await window.api.db.getSetting('openrouter_key') || '';
  const orModel = await window.api.db.getSetting('openrouter_model') || 'google/gemini-2.0-flash-001';
  const provider = await window.api.db.getSetting('gpu_provider') || 'vastai';
  let vastaiKey = await window.api.db.getSetting('vastai_api_key') || '';
  let runpodKey = await window.api.db.getSetting('runpod_api_key') || '';
  const fallbackGpuKey = await window.api.db.getSetting('gpu_api_key') || '';

  // If the provider-specific keys are empty but legacy fallback is set, migrate/pre-fill them
  if (!vastaiKey && !runpodKey && fallbackGpuKey) {
    if (provider === 'vastai') vastaiKey = fallbackGpuKey;
    else if (provider === 'runpod') runpodKey = fallbackGpuKey;
  }

  const dockerImage = await window.api.db.getSetting('docker_image') || 'ghcr.io/zumuuser/loratrainer/trainer:latest';
  const registryAuthId = await window.api.db.getSetting('runpod_registry_auth_id') || '';
  const githubToken = await window.api.db.getSetting('github_token') || '';

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Manage your API keys and preferences</p>
      </div>
      <div class="card mb-md">
        <h3 style="font-weight:600;margin-bottom:12px">Profile</h3>
        <div class="input-group">
          <label class="input-label">Name</label>
          <input class="input" id="set-name" value="${name}">
        </div>
      </div>
      <div class="card mb-md">
        <h3 style="font-weight:600;margin-bottom:12px">OpenRouter</h3>
        <div class="input-group">
          <label class="input-label">API Key</label>
          <input class="input" id="set-or-key" type="password" value="${orKey}">
        </div>
        <div class="input-group mt-sm">
          <label class="input-label">Captioning / Chat Model</label>
          <select class="input" id="set-or-model">
            <option value="google/gemini-2.0-flash-001" ${orModel==='google/gemini-2.0-flash-001'?'selected':''}>Google Gemini 2.0 Flash (Default)</option>
            <option value="openai/gpt-4o-mini" ${orModel==='openai/gpt-4o-mini'?'selected':''}>OpenAI GPT-4o Mini</option>
            <option value="meta-llama/llama-3.2-11b-vision-instruct:free" ${orModel==='meta-llama/llama-3.2-11b-vision-instruct:free'?'selected':''}>Meta Llama 3.2 11B Vision (Free)</option>
            <option value="google/gemini-2.0-flash-exp:free" ${orModel==='google/gemini-2.0-flash-exp:free'?'selected':''}>Google Gemini 2.0 Flash (Free)</option>
          </select>
        </div>
      </div>
      <div class="card mb-md">
        <h3 style="font-weight:600;margin-bottom:12px">GPU Providers</h3>
        <div class="input-group">
          <label class="input-label">Default Provider</label>
          <select class="input" id="set-provider">
            <option value="vastai" ${provider==='vastai'?'selected':''}>Vast.ai</option>
            <option value="runpod" ${provider==='runpod'?'selected':''}>RunPod</option>
          </select>
        </div>
        <div class="input-group mt-sm">
          <label class="input-label">Vast.ai API Key</label>
          <input class="input" id="set-vastai-key" type="password" value="${vastaiKey}" placeholder="Vast.ai API Key">
        </div>
        <div class="input-group mt-sm">
          <label class="input-label">RunPod API Key</label>
          <input class="input" id="set-runpod-key" type="password" value="${runpodKey}" placeholder="RunPod API Key">
        </div>
      </div>
      <div class="card mb-md">
        <h3 style="font-weight:600;margin-bottom:12px">Advanced / Container Settings</h3>
        <div class="input-group">
          <label class="input-label">Docker Image for LoRA Trainer</label>
          <input class="input" id="set-docker-image" value="${dockerImage}" placeholder="ghcr.io/zumuuser/loratrainer/trainer:latest">
        </div>
        <div class="input-group mt-sm">
          <label class="input-label">RunPod Registry Auth ID (Optional, for private images)</label>
          <input class="input" id="set-registry-auth-id" value="${registryAuthId}" placeholder="e.g. registryAuthId">
        </div>
        <div class="input-group mt-sm">
          <label class="input-label">GitHub Access Token (Optional, for updates)</label>
          <input class="input" id="set-github-token" type="password" value="${githubToken}" placeholder="ghp_...">
        </div>
      </div>
      <div class="flex gap-md mt-lg">
        <button class="btn btn-primary" id="set-save">Save Settings</button>
        <button class="btn btn-secondary" id="set-check-updates">Check for Updates</button>
      </div>
    </div>`;

  document.getElementById('set-save').onclick = async () => {
    const defaultProvider = document.getElementById('set-provider').value;
    const vKey = document.getElementById('set-vastai-key').value.trim();
    const rKey = document.getElementById('set-runpod-key').value.trim();

    await window.api.db.setSetting('user_name', document.getElementById('set-name').value.trim());
    await window.api.db.setSetting('openrouter_key', document.getElementById('set-or-key').value.trim());
    await window.api.db.setSetting('openrouter_model', document.getElementById('set-or-model').value);
    await window.api.db.setSetting('gpu_provider', defaultProvider);
    await window.api.db.setSetting('vastai_api_key', vKey);
    await window.api.db.setSetting('runpod_api_key', rKey);

    // Keep gpu_api_key sync'd with the default provider for backward compatibility
    const activeKey = defaultProvider === 'vastai' ? vKey : rKey;
    await window.api.db.setSetting('gpu_api_key', activeKey);

    await window.api.db.setSetting('docker_image', document.getElementById('set-docker-image').value.trim());
    await window.api.db.setSetting('runpod_registry_auth_id', document.getElementById('set-registry-auth-id').value.trim());
    await window.api.db.setSetting('github_token', document.getElementById('set-github-token').value.trim());
    App.toast('Settings saved');
  };

  document.getElementById('set-check-updates').onclick = async () => {
    const btn = document.getElementById('set-check-updates');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div> Checking...';
    try {
      const res = await window.api.updater.check();
      if (res && res.updateAvailable && !res.error) {
        App.toast(`Update available! Commit ${res.latestSha.substring(0, 7)} can be installed.`);
        const updateCard = document.getElementById('update-notification');
        if (updateCard) {
          updateCard.classList.remove('hidden');
          const updateBtn = document.getElementById('update-btn');
          updateBtn.onclick = async () => {
            updateBtn.disabled = true;
            updateBtn.innerHTML = `<span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 4px;">↻</span> Updating...`;
            App.toast('Downloading update from GitHub...', 'info');
            const success = await window.api.updater.perform(res.latestSha);
            if (success && !success.error) {
              App.toast('Update installed! Relaunching...', 'success');
            } else {
              App.toast(`Update failed: ${success.error || 'unknown error'}`, 'error');
              updateBtn.disabled = false;
              updateBtn.textContent = 'Update App';
            }
          };
        }
      } else {
        App.toast('Your application is up to date.');
      }
    } catch (err) {
      App.toast('Failed to check for updates: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Check for Updates';
    }
  };
});
