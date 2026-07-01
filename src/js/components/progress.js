/* Progress Component — Renders training job progress panel */
const ProgressTracker = (() => {
  /**
   * Render progress tracking panel for a specific job
   * @param {HTMLElement} container
   * @param {Object} job - Job database row
   * @param {Object} opts - { onStop, onStart }
   */
  function render(container, job, opts = {}) {
    const config = JSON.parse(job.config || '{}');
    const isCompleted = job.status === 'completed';
    const isFailed = job.status === 'failed';
    const isStopped = job.status === 'stopped';
    const isRunning = ['uploading', 'training', 'generating_samples'].includes(job.status);

    container.innerHTML = `
      <div class="card card-glass flex flex-col gap-md" style="padding: 24px;">
        <div class="flex justify-between items-center">
          <div>
            <h3 style="font-weight:600; font-size:1.2rem">${job.name}</h3>
            <span class="text-sm text-muted">${job.base_model} · limit: $${(job.spend_limit || 0).toFixed(2)}</span>
          </div>
          <span class="badge badge-${isCompleted ? 'success' : isFailed ? 'danger' : isRunning ? 'info' : 'muted'}">${job.status}</span>
        </div>

        <div class="progress-bar">
          <div class="progress-fill" id="job-progress-fill" style="width: ${job.progress || 0}%"></div>
        </div>

        <div class="grid-3 gap-md text-center">
          <div>
            <span class="text-muted text-sm" style="display:block">Progress</span>
            <strong id="job-progress-text" style="font-size:1.3rem">${Math.round(job.progress || 0)}%</strong>
          </div>
          <div>
            <span class="text-muted text-sm" style="display:block">Cost Spent</span>
            <strong id="job-cost-text" style="font-size:1.3rem">$${(job.cost_spent || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span class="text-muted text-sm" style="display:block">Est. Time Remaining</span>
            <strong id="job-eta-text" style="font-size:1.3rem">${formatETA(job.eta_seconds)}</strong>
          </div>
        </div>

        <div id="job-msg" class="text-sm text-center text-secondary">${job.error_msg ? `<span class="text-danger">${job.error_msg}</span>` : 'Idle'}</div>

        <div class="flex gap-md justify-between mt-md">
          ${isRunning 
            ? `<button class="btn btn-danger w-full" id="job-stop-btn">✕ Stop training & release GPU</button>` 
            : `<button class="btn btn-primary w-full" id="job-start-btn">🚀 Resume/Start Training</button>`
          }
        </div>
      </div>
    `;

    const stopBtn = container.querySelector('#job-stop-btn');
    const startBtn = container.querySelector('#job-start-btn');

    if (stopBtn) {
      stopBtn.onclick = async () => {
        if (confirm('Are you sure you want to stop training? This will immediately terminate the GPU instance.')) {
          stopBtn.disabled = true;
          stopBtn.innerHTML = '<div class="spinner"></div> Stopping...';
          if (opts.onStop) await opts.onStop(job.id);
        }
      };
    }

    if (startBtn) {
      startBtn.onclick = async () => {
        startBtn.disabled = true;
        startBtn.innerHTML = '<div class="spinner"></div> Launching...';
        if (opts.onStart) await opts.onStart(job.id);
      };
    }
  }

  function formatETA(seconds) {
    if (!seconds || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  return { render };
})();
