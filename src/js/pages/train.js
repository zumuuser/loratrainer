/* Train Page — Configure + launch training */
App.registerPage('train', async (container) => {
  let jobId = sessionStorage.getItem('currentJobId');
  if (jobId) jobId = parseInt(jobId);
  if (!jobId) return App.navigate('upload');

  const job = await window.api.db.getJob(jobId);
  if (!job) return App.navigate('upload');

  const config = JSON.parse(job.config || '{}');
  let provider = job.gpu_provider;
  if (!provider) {
    const dbProvider = await window.api.db.getSetting('gpu_provider');
    const vastaiKey = await window.api.db.getSetting('vastai_api_key');
    const runpodKey = await window.api.db.getSetting('runpod_api_key');
    if (vastaiKey && !runpodKey) {
      provider = 'vastai';
    } else if (runpodKey && !vastaiKey) {
      provider = 'runpod';
    } else {
      provider = dbProvider || 'vastai';
    }
  }

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Configure Training</h1>
        <p class="page-subtitle" id="job-subtitle">${job.name || 'New LoRA Job'}</p>
      </div>
      <div class="grid-2 gap-lg">
        <!-- Left: Config Panel -->
        <div>
          <div class="card mb-md">
            <h3 style="font-weight:600;margin-bottom:12px">Base Model</h3>
            <div class="flex gap-sm">
              <label class="card flex items-center gap-sm" style="padding:12px;cursor:pointer;flex:1">
                <input type="radio" name="base_model" value="krea2" ${job.base_model === 'krea2' ? 'checked' : ''}> KREA 2
              </label>
              <label class="card flex items-center gap-sm" style="padding:12px;cursor:pointer;flex:1">
                <input type="radio" name="base_model" value="ideogram4" ${job.base_model === 'ideogram4' ? 'checked' : ''}> Ideogram 4
              </label>
              <label class="card flex items-center gap-sm" style="padding:12px;cursor:pointer;flex:1">
                <input type="radio" name="base_model" value="both" ${job.base_model === 'both' ? 'checked' : ''}> Both
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
              <div class="input-group"><label class="input-label">Learning Rate</label><input class="input" id="cfg-lr" type="number" value="${config.lr || 0.0001}" step="0.00001"></div>
              <div class="input-group"><label class="input-label">LoRA Rank</label><input class="input" id="cfg-rank" type="number" value="${config.rank || 16}" step="4"></div>
              <div class="input-group"><label class="input-label">Epochs</label><input class="input" id="cfg-epochs" type="number" value="${config.epochs || 20}" step="5"></div>
              <div class="input-group"><label class="input-label">Resolution</label>
                <select class="input" id="cfg-res">
                  <option value="512" ${config.resolution === 512 ? 'selected' : ''}>512</option>
                  <option value="768" ${config.resolution === 768 ? 'selected' : ''}>768</option>
                  <option value="1024" ${config.resolution === 1024 || !config.resolution ? 'selected' : ''}>1024</option>
                </select>
              </div>
            </div>
            <div class="input-group mt-sm"><label class="input-label">Caption Prefix</label><input class="input" id="cfg-prefix" placeholder="e.g. a photo taken on an iphone 15, casual selfie" value="${config.caption_prefix || ''}"></div>
          </div>
          <div class="card mb-md" id="gpu-section"></div>
          <div class="card mb-md">
            <h3 style="font-weight:600;margin-bottom:12px">Spend Limit</h3>
            <div class="input-group"><label class="input-label">Max cost for this job ($)</label><input class="input" id="cfg-limit" type="number" value="${job.spend_limit || 3.00}" step="0.50" min="0.50"></div>
          </div>
          <button class="btn btn-primary btn-lg w-full" id="launch-btn">🚀 Launch Training</button>
        </div>
        <!-- Right: Chat Config -->
        <div id="chat-panel"></div>
      </div>
    </div>`;

  // Dynamic image counts
  const dbImages = await window.api.db.getDatasetImages(jobId);
  document.getElementById('job-subtitle').textContent = `${job.name || 'New LoRA Job'} · ${dbImages.length} images`;

  // ── Autosave config function ──
  async function saveConfigState() {
    const configData = {
      lr: parseFloat(document.getElementById('cfg-lr').value),
      rank: parseInt(document.getElementById('cfg-rank').value),
      epochs: parseInt(document.getElementById('cfg-epochs').value),
      resolution: parseInt(document.getElementById('cfg-res').value),
      caption_prefix: document.getElementById('cfg-prefix').value.trim(),
    };
    
    await window.api.db.updateJob(jobId, {
      base_model: baseModel(),
      config: JSON.stringify(configData),
      spend_limit: parseFloat(document.getElementById('cfg-limit').value),
      gpu_provider: document.getElementById('cfg-provider')?.value || provider,
      gpu_type: document.getElementById('cfg-gpu')?.value || 'auto'
    });
  }

  // Bind autosave on input changes
  const inputs = ['cfg-lr', 'cfg-rank', 'cfg-epochs', 'cfg-res', 'cfg-prefix', 'cfg-limit'];
  inputs.forEach(id => {
    document.getElementById(id).oninput = saveConfigState;
  });

  // ── Chat-to-Config wiring ──
  ChatConfig.render(document.getElementById('chat-panel'), async (chatConfig) => {
    if (chatConfig.lr) document.getElementById('cfg-lr').value = chatConfig.lr;
    if (chatConfig.rank) document.getElementById('cfg-rank').value = chatConfig.rank;
    if (chatConfig.epochs) document.getElementById('cfg-epochs').value = chatConfig.epochs;
    if (chatConfig.resolution) document.getElementById('cfg-res').value = chatConfig.resolution;
    if (chatConfig.caption_prefix) document.getElementById('cfg-prefix').value = chatConfig.caption_prefix;
    await saveConfigState();
  });

  // ── Presets ──
  const presets = {
    quick:    { lr: 0.0001, rank: 16, epochs: 15, desc: '~15 min · Lower rank · Good for testing' },
    standard: { lr: 0.0001, rank: 32, epochs: 25, desc: '~25 min · Balanced quality · Recommended' },
    hq:       { lr: 0.00005, rank: 64, epochs: 40, desc: '~45 min · High rank · Best quality' },
  };
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.onclick = async () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const p = presets[btn.dataset.preset];
      document.getElementById('cfg-lr').value = p.lr;
      document.getElementById('cfg-rank').value = p.rank;
      document.getElementById('cfg-epochs').value = p.epochs;
      document.getElementById('preset-desc').textContent = p.desc;
      await saveConfigState();
    };
  });

  // ── GPU Picker ──
  const baseModel = () => document.querySelector('input[name="base_model"]:checked').value;

  async function loadGPUs() {
    const providerSelect = document.getElementById('cfg-provider');
    const gpuSelect = document.getElementById('cfg-gpu');
    if (!providerSelect || !gpuSelect) return;

    const currentProvider = providerSelect.value;
    gpuSelect.innerHTML = '<option value="auto">Loading GPUs...</option>';
    gpuSelect.disabled = true;

    try {
      const keySetting = currentProvider === 'vastai' ? 'vastai_api_key' : 'runpod_api_key';
      let key = await window.api.db.getSetting(keySetting);
      if (!key) key = await window.api.db.getSetting('gpu_api_key');

      if (!key) {
        gpuSelect.innerHTML = '<option value="auto">Auto (API key missing in settings)</option>';
        gpuSelect.disabled = false;
        return;
      }

      const minVram = baseModel() === 'both' ? 24 : 16;
      const gpus = await window.api.gpu.listGPUs(currentProvider, key, minVram);
      if (gpus.error || !gpus.length) {
        gpuSelect.innerHTML = `<option value="auto">Auto (No active machines / API error: ${gpus.error || 'empty'})</option>`;
      } else {
        let html = '<option value="auto">Auto (best available)</option>';
        gpus.forEach(gpu => {
          const isSelected = job.gpu_type === gpu.id;
          html += `<option value="${gpu.id}" ${isSelected ? 'selected' : ''}>${gpu.gpu || gpu.label} ($${(gpu.priceHr || 0).toFixed(3)}/hr)</option>`;
        });
        gpuSelect.innerHTML = html;
      }
    } catch (e) {
      gpuSelect.innerHTML = `<option value="auto">Auto (Error: ${e.message})</option>`;
    } finally {
      gpuSelect.disabled = false;
    }
  }

  async function renderGPU() {
    const suggestion = await window.api.gpu.suggest(baseModel());
    const savedProvider = job.gpu_provider || provider;
    document.getElementById('gpu-section').innerHTML = `
      <h3 style="font-weight:600;margin-bottom:12px">GPU Selection</h3>
      <div class="badge badge-info mb-md">Suggested: ${suggestion.recommended} · Est. ${suggestion.estCost}</div>
      <div class="input-group"><label class="input-label">Provider</label>
        <select class="input" id="cfg-provider">
          <option value="vastai" ${savedProvider === 'vastai' ? 'selected' : ''}>Vast.ai</option>
          <option value="runpod" ${savedProvider === 'runpod' ? 'selected' : ''}>RunPod</option>
        </select>
      </div>
      <div class="input-group"><label class="input-label">GPU Type (auto-selected if left default)</label>
        <select class="input" id="cfg-gpu"><option value="auto">Auto (best available)</option></select>
      </div>`;
    
    const providerSelect = document.getElementById('cfg-provider');
    const gpuSelect = document.getElementById('cfg-gpu');
    providerSelect.onchange = async () => {
      await saveConfigState();
      await loadGPUs();
    };
    gpuSelect.onchange = saveConfigState;
    
    await loadGPUs();
  }

  await renderGPU();
  
  document.querySelectorAll('input[name="base_model"]').forEach(r => {
    r.onchange = async () => {
      await saveConfigState();
      await renderGPU();
    };
  });

  // ── Launch ──
  const jobs = await window.api.db.getJobs();
  const activeJob = jobs.find(j => ['uploading', 'training', 'generating_samples'].includes(j.status));
  const launchBtn = document.getElementById('launch-btn');

  if (activeJob) {
    launchBtn.disabled = true;
    launchBtn.classList.remove('btn-primary');
    launchBtn.classList.add('btn-secondary');
    launchBtn.style.cursor = 'not-allowed';
    launchBtn.innerHTML = `⚠️ Active job in progress: "${activeJob.name}"`;
  } else {
    launchBtn.onclick = async () => {
      await saveConfigState();
      
      launchBtn.disabled = true;
      launchBtn.innerHTML = `<span style="display: inline-block; animation: spin 1s linear infinite; margin-right: 4px;">↻</span> Launching...`;
      
      // Trigger training pipeline in background
      window.api.training.start(jobId).then((result) => {
        if (result && result.error) {
          App.toast(`Launch failed: ${result.error}`, 'error');
        }
      });
      
      sessionStorage.removeItem('currentJobId');
      App.navigate('dashboard');
    };
  }
});
