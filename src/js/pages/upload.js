/* Upload Page — Bulk image upload + auto-captioning */
App.registerPage('upload', async (container) => {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">New Training Job</h1>
        <p class="page-subtitle">Upload your training images</p>
      </div>

      <div class="input-group">
        <label class="input-label">Job Name</label>
        <input class="input" id="upload-name" type="text" placeholder="e.g. Aira Character v2">
      </div>

      <div class="drop-zone" id="drop-zone">
        <div class="drop-zone-icon">📁</div>
        <div class="drop-zone-text">Drag & drop images here or click to browse</div>
        <div class="drop-zone-hint">JPG, PNG, WebP · 15-30 images recommended</div>
      </div>

      <div id="upload-preview" class="grid-4 mt-lg"></div>

      <div id="upload-actions" class="flex gap-md mt-lg hidden">
        <button class="btn btn-secondary" id="upload-caption">✨ Auto-Caption All</button>
        <button class="btn btn-primary" id="upload-continue" style="margin-left:auto">Continue to Config →</button>
      </div>

      <div id="caption-status" class="mt-md text-sm hidden"></div>
    </div>
  `;

  let images = []; // { path, filename, caption }

  const zone = document.getElementById('drop-zone');
  const preview = document.getElementById('upload-preview');
  const actions = document.getElementById('upload-actions');

  // Drag & drop
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const paths = [...e.dataTransfer.files].map(f => f.path);
    await addImages(paths);
  });

  // Click to browse
  zone.addEventListener('click', async () => {
    const paths = await window.api.storage.openFileDialog();
    if (paths.length) await addImages(paths);
  });

  async function addImages(paths) {
    const saved = await window.api.storage.saveImages(paths);
    for (const s of saved) {
      images.push({ path: s.saved, filename: s.filename, caption: '' });
    }
    renderPreview();
    if (images.length) actions.classList.remove('hidden');
  }

  function renderPreview() {
    preview.innerHTML = images.map((img, i) => `
      <div class="card" style="padding:8px;position:relative">
        <img src="file://${img.path}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px">
        <textarea class="input mt-sm" style="height:60px;font-size:0.8rem" placeholder="Caption..."
          data-idx="${i}">${img.caption}</textarea>
        <button class="btn-ghost" style="position:absolute;top:4px;right:4px;font-size:1.2rem" data-remove="${i}">×</button>
      </div>
    `).join('');

    // Caption edit handlers
    preview.querySelectorAll('textarea').forEach(ta => {
      ta.oninput = () => { images[ta.dataset.idx].caption = ta.value; };
    });
    // Remove handlers
    preview.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => {
        images.splice(parseInt(btn.dataset.remove), 1);
        renderPreview();
        if (!images.length) actions.classList.add('hidden');
      };
    });
  }

  // Auto-caption
  document.getElementById('upload-caption').onclick = async () => {
    const statusEl = document.getElementById('caption-status');
    const apiKey = await window.api.db.getSetting('openrouter_key');
    if (!apiKey) return App.toast('No OpenRouter key set', 'error');
    statusEl.textContent = 'Captioning images...';
    statusEl.classList.remove('hidden');

    const result = await window.api.openrouter.caption(images.map(i => i.path), apiKey);
    if (result.error) {
      statusEl.textContent = result.error;
      statusEl.className = 'mt-md text-sm text-danger';
      return;
    }
    // Merge captions
    if (result.captions) {
      result.captions.forEach((cap, i) => { if (images[i]) images[i].caption = cap; });
      renderPreview();
      statusEl.textContent = `${result.captions.length} images captioned`;
      statusEl.className = 'mt-md text-sm text-success';
    }
  };

  // Continue to training config
  document.getElementById('upload-continue').onclick = () => {
    const name = document.getElementById('upload-name').value.trim();
    if (!name) return App.toast('Enter a job name', 'error');
    if (!images.length) return App.toast('Upload at least one image', 'error');
    // Store in sessionStorage for next page
    sessionStorage.setItem('pendingJob', JSON.stringify({ name, images }));
    App.navigate('train');
  };
});
