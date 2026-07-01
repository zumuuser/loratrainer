/* Dashboard Page — Overview of jobs + quick stats */
App.registerPage('dashboard', async (container) => {
  const jobs = await window.api.db.getJobs();
  const models = await window.api.db.getModels();
  const name = await window.api.db.getSetting('user_name') || 'User';

  const activeJobs = jobs.filter(j => ['uploading','training','generating_samples'].includes(j.status));
  const totalCost = jobs.reduce((sum, j) => sum + (j.cost_spent || 0), 0);

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Hey ${name}</h1>
        <p class="page-subtitle">Your LoRA training dashboard</p>
      </div>

      <div class="grid-3 mb-md">
        <div class="card">
          <div class="text-muted text-sm">Active Jobs</div>
          <div style="font-size:2rem;font-weight:700;margin-top:4px">${activeJobs.length}</div>
        </div>
        <div class="card">
          <div class="text-muted text-sm">Trained Models</div>
          <div style="font-size:2rem;font-weight:700;margin-top:4px">${models.length}</div>
        </div>
        <div class="card">
          <div class="text-muted text-sm">Total Spent</div>
          <div style="font-size:2rem;font-weight:700;margin-top:4px">$${totalCost.toFixed(2)}</div>
        </div>
      </div>

      <div class="flex justify-between items-center mb-md">
        <h2 style="font-size:1.1rem;font-weight:600">Recent Jobs</h2>
        <button class="btn btn-primary" id="dash-new">⊕ New Training</button>
      </div>

      <div id="dash-jobs">
        ${jobs.length === 0 ? '<div class="card text-center text-muted" style="padding:48px">No training jobs yet. Click "New Training" to start.</div>' :
          jobs.slice(0, 10).map(j => `
            <div class="card flex justify-between items-center mb-md" style="padding:16px 20px;cursor:pointer" data-job="${j.id}">
              <div>
                <div style="font-weight:500">${j.name}</div>
                <div class="text-sm text-muted">${j.base_model} · ${new Date(j.created_at).toLocaleDateString()}</div>
              </div>
              <div class="flex items-center gap-md">
                ${j.status === 'training' ? `<div class="progress-bar" style="width:80px"><div class="progress-fill" style="width:${j.progress}%"></div></div>` : ''}
                <span class="badge badge-${j.status === 'completed' ? 'success' : j.status === 'failed' ? 'danger' : j.status === 'training' ? 'info' : 'muted'}">${j.status}</span>
                <span class="text-sm text-muted">$${(j.cost_spent || 0).toFixed(2)}</span>
              </div>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;

  document.getElementById('dash-new').onclick = () => App.navigate('upload');
});
