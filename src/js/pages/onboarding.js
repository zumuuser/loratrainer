/* Onboarding Page — First-run API key setup */
App.registerPage('onboarding', async (container) => {
  container.innerHTML = `
    <div class="onboarding">
      <div class="card onboarding-card">
        <span class="brand-icon">◇</span>
        <h1 class="page-title">Welcome to LoRA Trainer</h1>
        <p class="page-subtitle">Set up your API keys to get started</p>

        <div id="onboard-steps">
          <!-- Step 1: Profile -->
          <div id="step-1" class="onboard-step">
            <div class="input-group">
              <label class="input-label">Your Name</label>
              <input class="input" id="ob-name" type="text" placeholder="e.g. Zack">
            </div>
            <button class="btn btn-primary w-full" id="ob-next-1">Continue</button>
          </div>

          <!-- Step 2: OpenRouter -->
          <div id="step-2" class="onboard-step hidden">
            <div class="input-group">
              <label class="input-label">OpenRouter API Key</label>
              <input class="input" id="ob-openrouter" type="password" placeholder="sk-or-...">
              <span class="text-sm text-muted mt-sm" style="display:block">Used for auto-captioning & chat config</span>
            </div>
            <div class="flex gap-sm">
              <button class="btn btn-secondary" id="ob-back-2">Back</button>
              <button class="btn btn-primary" id="ob-next-2" style="flex:1">Validate & Continue</button>
            </div>
          </div>

          <!-- Step 3: GPU Provider -->
          <div id="step-3" class="onboard-step hidden">
            <div class="input-group">
              <label class="input-label">GPU Provider</label>
              <select class="input" id="ob-provider">
                <option value="vastai">Vast.ai (Recommended)</option>
                <option value="runpod">RunPod</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label">Provider API Key</label>
              <input class="input" id="ob-gpu-key" type="password" placeholder="API key...">
            </div>
            <div class="flex gap-sm">
              <button class="btn btn-secondary" id="ob-back-3">Back</button>
              <button class="btn btn-primary" id="ob-next-3" style="flex:1">Validate & Finish</button>
            </div>
          </div>
        </div>

        <div id="ob-status" class="mt-md text-sm text-center hidden"></div>
      </div>
    </div>
  `;

  let step = 1;
  const show = (n) => {
    document.querySelectorAll('.onboard-step').forEach(s => s.classList.add('hidden'));
    document.getElementById(`step-${n}`).classList.remove('hidden');
    step = n;
  };

  const status = (msg, isError) => {
    const el = document.getElementById('ob-status');
    el.textContent = msg;
    el.className = `mt-md text-sm text-center ${isError ? 'text-danger' : 'text-success'}`;
    el.classList.remove('hidden');
  };

  // Step 1 → 2
  document.getElementById('ob-next-1').onclick = () => {
    const name = document.getElementById('ob-name').value.trim();
    if (!name) return status('Please enter your name', true);
    window.api.db.setSetting('user_name', name);
    show(2);
  };

  // Step 2 → 3
  document.getElementById('ob-back-2').onclick = () => show(1);
  document.getElementById('ob-next-2').onclick = async () => {
    const key = document.getElementById('ob-openrouter').value.trim();
    if (!key) return status('Please enter your OpenRouter key', true);
    status('Validating...', false);
    const valid = await window.api.openrouter.validateKey(key);
    if (!valid) return status('Invalid OpenRouter key', true);
    await window.api.db.setSetting('openrouter_key', key);
    show(3);
  };

  // Step 3 → Done
  document.getElementById('ob-back-3').onclick = () => show(2);
  document.getElementById('ob-next-3').onclick = async () => {
    const provider = document.getElementById('ob-provider').value;
    const key = document.getElementById('ob-gpu-key').value.trim();
    if (!key) return status('Please enter your GPU provider key', true);
    status('Validating...', false);
    const valid = await window.api.gpu.validateKey(provider, key);
    if (!valid) return status('Invalid API key for ' + provider, true);
    await window.api.db.setSetting('gpu_provider', provider);
    await window.api.db.setSetting('gpu_api_key', key);
    await window.api.db.setSetting('onboarded', true);
    App.toast('Setup complete!');
    App.navigate('dashboard');
  };
});
