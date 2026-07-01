/* Dashboard Page — Overview of jobs + quick stats + live progress tracking */
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
          <div style="font-size:2rem;font-weight:700;margin-top:4px" id="stats-active">${activeJobs.length}</div>
        </div>
        <div class="card">
          <div class="text-muted text-sm">Trained Models</div>
          <div style="font-size:2rem;font-weight:700;margin-top:4px">${models.length}</div>
        </div>
        <div class="card">
          <div class="text-muted text-sm">Total Spent</div>
          <div style="font-size:2rem;font-weight:700;margin-top:4px" id="stats-cost">$${totalCost.toFixed(2)}</div>
        </div>
      </div>

      <div class="grid-2 gap-lg mt-lg">
        <!-- Left: Recent Jobs List -->
        <div>
          <div class="flex justify-between items-center mb-md">
            <h2 style="font-size:1.1rem;font-weight:600">Recent Jobs</h2>
            <button class="btn btn-primary btn-sm" id="dash-new">⊕ New Training</button>
          </div>
          <div id="dash-jobs" class="flex flex-col gap-sm">
            ${jobs.length === 0 ? '<div class="card text-center text-muted" style="padding:48px">No training jobs yet.</div>' :
              jobs.slice(0, 10).map(j => `
                <div class="card flex justify-between items-center job-row" style="padding:14px 18px;cursor:pointer; transition: transform 0.15s ease" data-job-id="${j.id}" id="job-row-${j.id}">
                  <div>
                    <div style="font-weight:500">${j.name}</div>
                    <div class="text-sm text-muted">${j.base_model} · ${new Date(j.created_at).toLocaleDateString()}</div>
                  </div>
                  <div class="flex items-center gap-md">
                    <span class="badge badge-${j.status === 'completed' ? 'success' : j.status === 'failed' ? 'danger' : ['uploading','training','generating_samples'].includes(j.status) ? 'info' : 'muted'}" id="badge-${j.id}">${j.status}</span>
                    <span class="text-sm text-muted" id="cost-${j.id}">$${(j.cost_spent || 0).toFixed(2)}</span>
                  </div>
                </div>
              `).join('')
            }
          </div>
        </div>

        <!-- Right: Active Progress Detail -->
        <div id="job-detail-panel" class="hidden">
          <h2 style="font-size:1.1rem;font-weight:600;margin-bottom:16px">Job Details</h2>
          <div id="job-detail-container"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('dash-new').onclick = () => App.navigate('upload');

  let selectedJobId = null;

  // Handle active job progress events from backend orchestrator
  window.api.training.onProgress((data) => {
    // Update badge in the list
    const badge = document.getElementById(`badge-${data.jobId}`);
    if (badge) {
      badge.textContent = data.status;
      badge.className = `badge badge-${data.status === 'completed' ? 'success' : data.status === 'failed' ? 'danger' : ['uploading','training','generating_samples'].includes(data.status) ? 'info' : 'muted'}`;
    }

    // Update cost in the list
    const costText = document.getElementById(`cost-${data.jobId}`);
    if (costText && data.cost !== undefined) {
      costText.textContent = `$${data.cost.toFixed(2)}`;
    }

    // If this is the currently selected job, update its details view live
    if (selectedJobId === data.jobId) {
      const fill = document.getElementById('job-progress-fill');
      const text = document.getElementById('job-progress-text');
      const costDetail = document.getElementById('job-cost-text');
      const etaDetail = document.getElementById('job-eta-text');
      const msg = document.getElementById('job-msg');

      if (fill && data.progress !== undefined) fill.style.width = `${data.progress}%`;
      if (text && data.progress !== undefined) text.textContent = `${Math.round(data.progress)}%`;
      if (costDetail && data.cost !== undefined) costDetail.textContent = `$${data.cost.toFixed(2)}`;
      if (etaDetail && data.eta !== undefined) {
        const mins = Math.floor(data.eta / 60);
        const secs = data.eta % 60;
        etaDetail.textContent = `${mins}m ${secs}s`;
      }
      if (msg && data.message) msg.textContent = data.message;
    }
  });

  window.api.training.onComplete((data) => {
    App.toast(`Job "${data.jobId}" completed successfully!`);
    App.navigate('dashboard'); // Refresh dashboard to show update
  });

  window.api.training.onError((data) => {
    App.toast(`Job "${data.jobId}" failed: ${data.error}`, 'error');
    App.navigate('dashboard');
  });

  const jobRows = container.querySelectorAll('.job-row');
  jobRows.forEach(row => {
    row.onclick = async () => {
      jobRows.forEach(r => r.style.borderColor = 'var(--border)');
      row.style.borderColor = 'var(--accent)';
      
      const jobId = parseInt(row.dataset.jobId);
      selectedJobId = jobId;
      
      const job = await window.api.db.getJob(jobId);
      if (job) {
        document.getElementById('job-detail-panel').classList.remove('hidden');
        ProgressTracker.render(
          document.getElementById('job-detail-container'),
          job,
          {
            onStop: async (id) => {
              await window.api.training.stop(id);
              App.toast('Training stopped.');
              App.navigate('dashboard');
            },
            onStart: async (id) => {
              const active = jobs.find(j => j.id !== id && ['uploading', 'training', 'generating_samples'].includes(j.status));
              if (active) {
                App.toast(`Active job "${active.name}" is already running!`, 'error');
                return;
              }
              const res = await window.api.training.start(id);
              if (res.error) {
                App.toast(res.error, 'error');
              } else {
                App.toast('Training started!');
              }
              App.navigate('dashboard');
            },
            onDelete: async (id) => {
              await window.api.db.deleteJob(id);
              App.toast('Job deleted.');
              App.navigate('dashboard');
            }
          }
        );
      }
    };
  });

  // Auto-select the first job if available
  if (jobs.length > 0) {
    jobRows[0].click();
  }
});
