/* Upload Page — Bulk image upload + auto-captioning */
App.registerPage('upload', async (container) => {
  // 1. Get or create pending job in database
  let jobId = sessionStorage.getItem('currentJobId');
  if (jobId) jobId = parseInt(jobId);

  if (!jobId) {
    const jobs = await window.api.db.getJobs();
    const pendingJob = jobs.find(j => j.status === 'pending');
    if (pendingJob) {
      jobId = pendingJob.id;
    } else {
      jobId = await window.api.db.createJob({
        name: 'New LoRA Job',
        base_model: 'krea2',
        config: JSON.stringify({ lr: 0.0001, rank: 16, epochs: 20, resolution: 1024, caption_prefix: '' }),
        dataset_path: '',
        spend_limit: 3.0,
        gpu_provider: 'vastai',
        gpu_type: 'auto'
      });
    }
    sessionStorage.setItem('currentJobId', jobId);
  }

  const job = await window.api.db.getJob(jobId);

  container.innerHTML = `
    <div class="page" style="padding-bottom: 80px;">
      <div class="page-header">
        <h1 class="page-title">New Training Job</h1>
        <p class="page-subtitle">Upload your training images and generate captions</p>
      </div>

      <div class="input-group">
        <label class="input-label">Job Name</label>
        <input class="input" id="upload-name" type="text" placeholder="e.g. Aira Character v2" value="${job.name || ''}">
      </div>

      <div class="drop-zone" id="drop-zone">
        <div class="drop-zone-icon">📁</div>
        <div class="drop-zone-text">Drag & drop images here or click to browse</div>
        <div class="drop-zone-hint">JPG, PNG, WebP · 15-30 images recommended for character LoRA</div>
      </div>

      <!-- Caption progress bar (hidden until captioning starts) -->
      <div id="caption-bar" class="card mt-md hidden">
        <div class="flex justify-between items-center mb-md">
          <span class="text-sm" id="caption-label">Captioning...</span>
          <span class="text-sm text-muted" id="caption-cost">$0.00</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" id="caption-progress" style="width:0%"></div></div>
      </div>

      <!-- Image grid with captions -->
      <div id="upload-grid" class="mt-lg"></div>

      <!-- Actions -->
      <div id="upload-actions" class="flex gap-md mt-lg hidden" style="position:fixed;bottom:0;left:var(--sidebar-w);right:0;padding:16px var(--space-xl);background:var(--bg-surface);border-top:1px solid var(--border);z-index:100">
        <span class="text-sm text-muted flex items-center" id="img-count">0 images</span>
        <button class="btn btn-secondary" id="upload-caption-btn">✨ Auto-Caption All</button>
        <button class="btn btn-secondary" id="upload-add-more">+ Add More</button>
        <button class="btn btn-primary" id="upload-continue" style="margin-left:auto">Continue to Config →</button>
      </div>
    </div>`;

  let images = [];

  const zone = document.getElementById('drop-zone');
  const grid = document.getElementById('upload-grid');
  const actions = document.getElementById('upload-actions');
  const nameInput = document.getElementById('upload-name');

  // Autosave job name
  nameInput.oninput = async () => {
    await window.api.db.updateJob(jobId, { name: nameInput.value.trim() });
  };

  // ── Drag & Drop ──
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    await addImages([...e.dataTransfer.files].map(f => f.path));
  });
  zone.addEventListener('click', async () => {
    const paths = await window.api.storage.openFileDialog();
    if (paths.length) await addImages(paths);
  });

  document.getElementById('upload-add-more').onclick = async () => {
    const paths = await window.api.storage.openFileDialog();
    if (paths.length) await addImages(paths);
  };

  async function addImages(paths) {
    const saved = await window.api.storage.saveImages(paths);
    const imagesToSave = saved.map(s => ({ path: s.saved, caption: s.caption || '' }));
    await window.api.db.saveDatasetImages(jobId, imagesToSave);
    await reloadImages();
  }

  async function reloadImages() {
    const dbImgs = await window.api.db.getDatasetImages(jobId);
    images = dbImgs.map(img => ({ id: img.id, path: img.file_path, caption: img.caption || '' }));
    renderGrid();
    document.getElementById('img-count').textContent = `${images.length} images`;
    if (images.length) {
      actions.classList.remove('hidden');
      zone.classList.add('hidden');
    } else {
      actions.classList.add('hidden');
      zone.classList.remove('hidden');
    }
  }

  function renderGrid() {
    grid.innerHTML = `<div class="grid-4">${images.map((img, i) => `
      <div class="card" style="padding:0;overflow:hidden;position:relative" id="img-card-${i}">
        <img src="file://${img.path}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block" loading="lazy">
        <div style="padding:8px">
          <textarea class="input" style="height:72px;font-size:0.8rem;resize:vertical" placeholder="Caption this image..." data-idx="${i}">${img.caption}</textarea>
        </div>
        <button class="btn-ghost" style="position:absolute;top:4px;right:4px;font-size:1.1rem;background:rgba(0,0,0,0.5);border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center" data-remove="${i}">×</button>
      </div>`).join('')}</div>`;

    grid.querySelectorAll('textarea').forEach(ta => {
      ta.oninput = async () => {
        const idx = parseInt(ta.dataset.idx);
        if (images[idx]) {
          images[idx].caption = ta.value;
          await window.api.db.updateCaption(images[idx].id, ta.value);
        }
      };
    });
    
    grid.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = async () => {
        const idx = parseInt(btn.dataset.remove);
        if (images[idx]) {
          await window.api.db.deleteDatasetImage(images[idx].id);
          await reloadImages();
        }
      };
    });
  }

  // Initial load
  await reloadImages();

  // ── Auto-Caption ──
  const captionBar = document.getElementById('caption-bar');
  const captionLabel = document.getElementById('caption-label');
  const captionCost = document.getElementById('caption-cost');
  const captionProgress = document.getElementById('caption-progress');

  // Listen for progress events
  window.api.openrouter.onCaptionProgress(async (data) => {
    const pct = Math.round((data.current / data.total) * 100);
    captionProgress.style.width = `${pct}%`;
    captionLabel.textContent = `Captioning ${data.current}/${data.total}...`;
    captionCost.textContent = `$${data.cost.toFixed(4)}`;
    
    const idx = images.findIndex(img => !img.caption.trim());
    const targetIdx = idx !== -1 ? idx : (data.current - 1);
    
    if (images[targetIdx]) {
      images[targetIdx].caption = data.caption;
      const ta = grid.querySelector(`textarea[data-idx="${targetIdx}"]`);
      if (ta) ta.value = data.caption;
      await window.api.db.updateCaption(images[targetIdx].id, data.caption);
    }
  });

  document.getElementById('upload-caption-btn').onclick = async () => {
    const apiKey = await window.api.db.getSetting('openrouter_key');
    if (!apiKey) return App.toast('Set OpenRouter API key in Settings', 'error');
    if (!images.length) return App.toast('Upload images first', 'error');

    captionBar.classList.remove('hidden');
    captionLabel.textContent = 'Starting captioning...';
    captionProgress.style.width = '0%';

    const uncaptioned = images.filter(img => !img.caption.trim());
    const pathsToCaption = uncaptioned.length ? uncaptioned.map(i => i.path) : images.map(i => i.path);
    const model = await window.api.db.getSetting('openrouter_model') || 'google/gemini-2.0-flash-001';
    
    const result = await window.api.openrouter.caption(pathsToCaption, apiKey, model);

    if (result.captions) {
      await reloadImages();
      captionLabel.textContent = `Done — ${result.captions.length} captioned`;
      captionCost.textContent = `$${(result.totalCost || 0).toFixed(4)}`;
      App.toast(`${result.captions.length} images captioned`);
    }
  };

  // ── Continue ──
  document.getElementById('upload-continue').onclick = () => {
    const name = nameInput.value.trim();
    if (!name) return App.toast('Enter a job name', 'error');
    if (!images.length) return App.toast('Upload at least one image', 'error');
    const uncaptioned = images.filter(i => !i.caption.trim()).length;
    if (uncaptioned > 0 && !confirm(`${uncaptioned} image(s) have no caption. Continue anyway?`)) return;
    App.navigate('train');
  };
});
