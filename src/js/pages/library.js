/* Library Page — Browse trained models */
App.registerPage('library', async (container) => {
  const models = await window.api.db.getModels();
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Model Library</h1>
        <p class="page-subtitle">${models.length} trained model${models.length !== 1 ? 's' : ''}</p>
      </div>
      <div id="library-grid" class="grid-3">
        ${models.length === 0 ?
          '<div class="card text-center text-muted" style="padding:48px;grid-column:1/-1">No models yet. Train your first LoRA to see it here.</div>' :
          models.map(m => `
            <div class="card" style="padding:0;overflow:hidden">
              <div style="aspect-ratio:1;background:var(--bg-raised);display:flex;align-items:center;justify-content:center">
                ${m.thumbnail ? '<img src="file://'+m.thumbnail+'" style="width:100%;height:100%;object-fit:cover">' : '<span class="text-muted" style="font-size:2rem">◇</span>'}
              </div>
              <div style="padding:12px 16px">
                <div style="font-weight:500">${m.name}</div>
                <div class="text-sm text-muted">${m.base_model} · $${(m.training_cost||0).toFixed(2)}</div>
                <div class="flex gap-sm mt-sm">
                  <button class="btn btn-secondary" style="flex:1;font-size:0.8rem" data-download="${m.id}">↓ Download</button>
                  <button class="btn btn-danger" style="font-size:0.8rem" data-delete="${m.id}">✕</button>
                </div>
              </div>
            </div>`).join('')}
      </div>
    </div>`;
  container.querySelectorAll('[data-download]').forEach(btn => {
    btn.onclick = async () => {
      const model = await window.api.db.getModel(parseInt(btn.dataset.download));
      if (model?.file_path) await window.api.storage.openFolder(model.file_path);
    };
  });
  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('Delete this model?')) {
        await window.api.db.deleteModel(parseInt(btn.dataset.delete));
        App.navigate('library');
      }
    };
  });
});
