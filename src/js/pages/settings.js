/* Settings Page — API keys + preferences */
App.registerPage('settings', async (container) => {
  const name = await window.api.db.getSetting('user_name') || '';
  const orKey = await window.api.db.getSetting('openrouter_key') || '';
  const provider = await window.api.db.getSetting('gpu_provider') || 'vastai';
  const gpuKey = await window.api.db.getSetting('gpu_api_key') || '';

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
      </div>
      <div class="card mb-md">
        <h3 style="font-weight:600;margin-bottom:12px">GPU Provider</h3>
        <div class="input-group">
          <label class="input-label">Provider</label>
          <select class="input" id="set-provider">
            <option value="vastai" ${provider==='vastai'?'selected':''}>Vast.ai</option>
            <option value="runpod" ${provider==='runpod'?'selected':''}>RunPod</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label">API Key</label>
          <input class="input" id="set-gpu-key" type="password" value="${gpuKey}">
        </div>
      </div>
      <button class="btn btn-primary" id="set-save">Save Settings</button>
    </div>`;

  document.getElementById('set-save').onclick = async () => {
    await window.api.db.setSetting('user_name', document.getElementById('set-name').value.trim());
    await window.api.db.setSetting('openrouter_key', document.getElementById('set-or-key').value.trim());
    await window.api.db.setSetting('gpu_provider', document.getElementById('set-provider').value);
    await window.api.db.setSetting('gpu_api_key', document.getElementById('set-gpu-key').value.trim());
    App.toast('Settings saved');
  };
});
