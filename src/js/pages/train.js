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
              <div class="input-group"><label class="input-label">Learning Rate</label><input class="input" id="cfg-lr" type="number" value="0.0001" step="0.00001"></div>
              <div class="input-group"><label class="input-label">LoRA Rank</label><input class="input" id="cfg-rank" type="number" value="16" step="4"></div>
              <div class="input-group"><label class="input-label">Epochs</label><input class="input" id="cfg-epochs" type="number" value="20" step="5"></div>
              <div class="input-group"><label class="input-label">Resolution</label>
                <select class="input" id="cfg-res"><option value="512">512</option><option value="768">768</option><option value="1024" selected>1024</option></select>
              </div>
            </div>
            <div class="input-group mt-sm"><label class="input-label">Caption Prefix</label><input class="input" id="cfg-prefix" placeholder="e.g. a photo taken on an iphone 15, casual selfie"></div>
          </div>
          <div class="card mb-md" id="gpu-section"></div>
          <div class="card mb-md">
            <h3 style="font-weight:600;margin-bottom:12px">Spend Limit</h3>
            <div class="input-group"><label class="input-label">Max cost for this job ($)</label><input class="input" id="cfg-limit" type="number" value="3.00" step="0.50" min="0.50"></div>
          </div>
          <button class="btn btn-primary btn-lg w-full" id="launch-btn">🚀 Launch Training</button>
        </div>
        <!-- Right: Chat Config -->
        <div id="chat-panel"></div>
      </div>
    </div>`;

  // ── Chat-to-Config wiring ──
  ChatConfig.render(document.getElementById('chat-panel'), (config) => {
    if (config.lr) document.getElementById('cfg-lr').value = config.lr;
    if (config.rank) document.getElementById('cfg-rank').value = config.rank;
    if (config.epochs) document.getElementById('cfg-epochs').value = config.epochs;
    if (config.resolution) document.getElementById('cfg-res').value = config.resolution;
    if (config.caption_prefix) document.getElementById('cfg-prefix').value = config.caption_prefix;
  });

  // ── Presets ──
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

  // ── GPU Picker ──
  const baseModel = () => document.querySelector('input[name="base_model"]:checked').value;
  async function renderGPU() {
    const suggestion = await window.api.gpu.suggest(baseModel());
    document.getElementById('gpu-section').innerHTML = `
      <h3 style="font-weight:600;margin-bottom:12px">GPU Selection</h3>
      <div class="badge badge-info mb-md">Suggested: ${suggestion.recommended} · Est. ${suggestion.estCost}</div>
      <div class="input-group"><label class="input-label">Provider</label>
        <select class="input" id="cfg-provider">
          <option value="vastai" ${provider==='vastai'?'selected':''}>Vast.ai</option>
          <option value="runpod" ${provider==='runpod'?'selected':''}>RunPod</option>
        </select>
      </div>
      <div class="input-group"><label class="input-label">GPU Type (auto-selected if left default)</label>
        <select class="input" id="cfg-gpu"><option value="auto">Auto (best available)</option></select>
      </div>`;
  }
  renderGPU();
  document.querySelectorAll('input[name="base_model"]').forEach(r => { r.onchange = renderGPU; });

  // ── Launch ──
  document.getElementById('launch-btn').onclick = async () => {
    const config = {
      lr: parseFloat(document.getElementById('cfg-lr').value),
      rank: parseInt(document.getElementById('cfg-rank').value),
      epochs: parseInt(document.getElementById('cfg-epochs').value),
      resolution: parseInt(document.getElementById('cfg-res').value),
      caption_prefix: document.getElementById('cfg-prefix').value.trim(),
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
    // Save dataset images to DB
    await window.api.db.saveDatasetImages(jobId, pending.images);
    sessionStorage.removeItem('pendingJob');
    App.toast('Training job created!');
    App.navigate('dashboard');
  };
});
