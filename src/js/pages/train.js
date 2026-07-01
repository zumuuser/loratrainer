/* Train Page — Configure + launch training */
App.registerPage('train', async (container) => {
  const pending = JSON.parse(sessionStorage.getItem('pendingJob') || 'null');
  if (!pending) return App.navigate('upload');

  const provider = await window.api.db.getSetting('gpu_provider') || 'vastai';

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Configure Training</h1>
        <p class="page-subtitle">${pending.name} · ${pending.images.length} images</p>
      </div>

      <div class="grid-2 gap-lg">
        <!-- Left: Config Panel -->
        <div>
          <div class="card mb-md">
            <h3 style="font-weight:600;margin-bottom:12px">Base Model</h3>
            <div class="flex gap-sm">
              <label class="card flex items-center gap-sm" style="padding:12px;cursor:pointer;flex:1">
                <input type="radio" name="base_model" value="krea2" checked> KREA 2
              </label>
              <label class="card flex items-center gap-sm" style="padding:12px;cursor:pointer;flex:1">
                <input type="radio" name="base_model" value="ideogram4"> Ideogram 4
              </label>
              <label class="card flex items-center gap-sm" style="padding:12px;cursor:pointer;flex:1">
                <input type="radio" name="base_model" value="both"> Both
              </label>
            </div>
          </div>

          <div class="card mb-md">
            <h3 style="font-weight:600;margin-bottom:12px">Training Quality</h3>
            <div class="flex gap-sm">
              <button class="btn btn-secondary preset-btn active" data-preset="quick">⚡ Quick</button>
              <button class="btn btn-secondary preset-btn" data-preset="standard">⚙ Standard</button>
              <button class="btn btn-secondary preset-btn" data-preset="hq">✦ High Quality</button>
            </div>
            <div id="preset-desc" class="text-sm text-muted mt-sm">~15 min · Lower rank · Good for testing</div>
          </div>

          <div class="card mb-md">
            <h3 style="font-weight:600;margin-bottom:12px">Advanced Settings</h3>
            <div class="grid-2 gap-sm">
              <div class="input-group">
                <label class="input-label">Learning Rate</label>
                <input class="input" id="cfg-lr" type="number" value="0.0001" step="0.00001">
              </div>
              <div class="input-group">
                <label class="input-label">LoRA Rank</label>
                <input class="input" id="cfg-rank" type="number" value="16" step="4">
              </div>
              <div class="input-group">
                <label class="input-label">Epochs</label>
                <input class="input" id="cfg-epochs" type="number" value="20" step="5">
              </div>
              <div class="input-group">
                <label class="input-label">Resolution</label>
                <select class="input" id="cfg-res">
                  <option value="512">512</option>
                  <option value="768">768</option>
                  <option value="1024" selected>1024</option>
                </select>
              </div>
            </div>
          </div>

          <div class="card mb-md" id="gpu-section"></div>

          <div class="card mb-md">
            <h3 style="font-weight:600;margin-bottom:12px">Spend Limit</h3>
            <div class="input-group">
              <label class="input-label">Max cost for this job ($)</label>
              <input class="input" id="cfg-limit" type="number" value="3.00" step="0.50" min="0.50">
            </div>
          </div>

          <button class="btn btn-primary btn-lg w-full" id="launch-btn">🚀 Launch Training</button>
        </div>

        <!-- Right: Chat Config -->
        <div>
          <div class="card" style="height:100%;display:flex;flex-direction:column">
            <h3 style="font-weight:600;margin-bottom:12px">💬 Chat Config</h3>
            <p class="text-sm text-muted mb-md">Describe your desired look in plain English and I'll set the parameters.</p>
            <div id="chat-messages" style="flex:1;overflow-y:auto;margin-bottom:12px;max-height:400px"></div>
            <div class="flex gap-sm">
              <input class="input" id="chat-input" placeholder="e.g. iPhone selfie style, warm tones, bokeh..." style="flex:1">
              <button class="btn btn-primary" id="chat-send">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Preset logic
  const presets = {
    quick:    { lr: 0.0001, rank: 16, epochs: 15, desc: '~15 min · Lower rank · Good for testing' },
    standard: { lr: 0.0001, rank: 32, epochs: 25, desc: '~25 min · Balanced quality · Recommended' },
    hq:       { lr: 0.00005, rank: 64, epochs: 40, desc: '~45 min · High rank · Best quality' },
  };

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const p = presets[btn.dataset.preset];
      document.getElementById('cfg-lr').value = p.lr;
      document.getElementById('cfg-rank').value = p.rank;
      document.getElementById('cfg-epochs').value = p.epochs;
      document.getElementById('preset-desc').textContent = p.desc;
    };
  });

  // GPU picker
  const baseModel = () => document.querySelector('input[name="base_model"]:checked').value;
  const gpuSection = document.getElementById('gpu-section');
  async function renderGPU() {
    const suggestion = await window.api.gpu.suggest(baseModel());
    gpuSection.innerHTML = `
      <h3 style="font-weight:600;margin-bottom:12px">GPU Selection</h3>
      <div class="badge badge-info mb-md">Suggested: ${suggestion.recommended} · Est. ${suggestion.estCost}</div>
      <div class="input-group">
        <label class="input-label">Provider</label>
        <select class="input" id="cfg-provider">
          <option value="vastai" ${provider === 'vastai' ? 'selected' : ''}>Vast.ai</option>
          <option value="runpod" ${provider === 'runpod' ? 'selected' : ''}>RunPod</option>
        </select>
      </div>
      <div class="input-group">
        <label class="input-label">GPU Type</label>
        <select class="input" id="cfg-gpu">
          <option>Loading available GPUs...</option>
        </select>
      </div>
    `;
  }
  renderGPU();
  document.querySelectorAll('input[name="base_model"]').forEach(r => r.onchange = renderGPU);

  // Launch
  document.getElementById('launch-btn').onclick = async () => {
    const config = {
      lr: parseFloat(document.getElementById('cfg-lr').value),
      rank: parseInt(document.getElementById('cfg-rank').value),
      epochs: parseInt(document.getElementById('cfg-epochs').value),
      resolution: parseInt(document.getElementById('cfg-res').value),
    };
    const jobData = {
      name: pending.name,
      base_model: baseModel(),
      config: JSON.stringify(config),
      dataset_path: '',
      spend_limit: parseFloat(document.getElementById('cfg-limit').value),
      gpu_provider: document.getElementById('cfg-provider')?.value || provider,
      gpu_type: document.getElementById('cfg-gpu')?.value || 'auto',
    };
    const jobId = await window.api.db.createJob(jobData);
    sessionStorage.removeItem('pendingJob');
    App.toast('Training job created!');
    App.navigate('dashboard');
  };

  // Chat (stub — will connect to OpenRouter in feat/chat-config)
  document.getElementById('chat-send').onclick = () => {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    const messages = document.getElementById('chat-messages');
    messages.innerHTML += `<div class="mb-md"><div class="text-sm text-accent">You</div><div>${msg}</div></div>`;
    messages.innerHTML += `<div class="mb-md"><div class="text-sm text-success">Assistant</div><div class="text-muted">Chat config will be connected in next update.</div></div>`;
    input.value = '';
    messages.scrollTop = messages.scrollHeight;
  };
});
