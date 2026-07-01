/* Settings Page — API keys + preferences */
App.registerPage('settings', async (container) => {
  const name = await window.api.db.getSetting('user_name') || '';
  const orKey = await window.api.db.getSetting('openrouter_key') || '';
  const orModel = await window.api.db.getSetting('openrouter_model') || 'google/gemini-2.0-flash-001';
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
    await window.api.db.setSetting('openrouter_model', document.getElementById('set-or-model').value);
    await window.api.db.setSetting('gpu_provider', document.getElementById('set-provider').value);
    await window.api.db.setSetting('gpu_api_key', document.getElementById('set-gpu-key').value.trim());
    App.toast('Settings saved');
  };
});
