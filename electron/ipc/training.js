// Training job orchestrator — manages full cloud GPU lifecycle
const path = require('path');
const fs = require('fs');

// Active job monitors (jobId -> intervalId)
const monitors = {};

function register(ipcMain, userDataPath) {
  // Reference to DB and GPU modules (loaded at runtime via ipcMain)
  const getDB = () => require('./database');
  const modelsDir = path.join(userDataPath, 'models');
  if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

  ipcMain.handle('training:start', async (event, jobId) => {
    try {
      // 1. Get job + settings from DB
      const job = await ipcMain._invokeHandler('db:getJob', jobId);
      if (!job) throw new Error('Job not found');

      const gpuKey = await ipcMain._invokeHandler('db:getSetting', 'gpu_api_key');
      const provider = job.gpu_provider || await ipcMain._invokeHandler('db:getSetting', 'gpu_provider');

      // 2. Generate training config YAML
      const config = JSON.parse(job.config || '{}');
      const templateFile = job.base_model === 'ideogram4' ? 'ideogram4.yaml' : 'krea2.yaml';
      let template = fs.readFileSync(path.join(__dirname, '..', '..', 'training', 'templates', templateFile), 'utf8');

      const steps = config.epochs * 100; // rough: ~100 steps per epoch for typical dataset
      template = template
        .replace(/\$\{JOB_NAME\}/g, job.name)
        .replace(/\$\{DATASET_PATH\}/g, '/workspace/dataset')
        .replace(/\$\{STEPS\}/g, String(steps))
        .replace(/\$\{LEARNING_RATE\}/g, String(config.lr || 0.0001))
        .replace(/\$\{RANK\}/g, String(config.rank || 32))
        .replace(/\$\{RESOLUTION\}/g, String(config.resolution || 1024));

      // 3. Update job status
      await ipcMain._invokeHandler('db:updateJob', jobId, {
        status: 'uploading',
        started_at: new Date().toISOString(),
      });
      event.sender.send('training:progress', { jobId, status: 'uploading', progress: 0, message: 'Provisioning GPU...' });

      // 4. Create GPU instance
      const suggestion = await ipcMain._invokeHandler('gpu:suggest', job.base_model);
      const gpuList = await ipcMain._invokeHandler('gpu:listGPUs', provider, gpuKey, suggestion.minVram);
      if (gpuList.error || !gpuList.length) throw new Error('No GPUs available: ' + (gpuList.error || 'empty list'));

      const selectedGPU = job.gpu_type !== 'auto'
        ? gpuList.find(g => g.id === job.gpu_type) || gpuList[0]
        : gpuList[0]; // cheapest available

      const dockerImage = 'loratrainer/trainer:latest'; // Our Docker image
      const envVars = {
        CONFIG_YAML: template,
        JOB_ID: String(jobId),
        CALLBACK_URL: '', // For future webhook support
      };

      const createParams = provider === 'vastai'
        ? { offerId: selectedGPU.id, image: dockerImage, env: envVars }
        : { gpuTypeId: selectedGPU.id, image: dockerImage, env: envVars };

      const instance = await ipcMain._invokeHandler('gpu:createInstance', provider, gpuKey, createParams);
      if (instance.error) throw new Error('Failed to create instance: ' + instance.error);

      const instanceId = instance.id || instance.new_contract;

      await ipcMain._invokeHandler('db:updateJob', jobId, {
        status: 'training',
        gpu_instance: String(instanceId),
        gpu_type: selectedGPU.gpu || selectedGPU.label,
      });
      event.sender.send('training:progress', { jobId, status: 'training', progress: 5, message: `GPU provisioned: ${selectedGPU.gpu || selectedGPU.label}` });

      // 5. Start monitoring loop
      startMonitor(event.sender, ipcMain, jobId, provider, gpuKey, instanceId, job.spend_limit || 5);

      return { success: true, instanceId };
    } catch (err) {
      await ipcMain._invokeHandler('db:updateJob', jobId, { status: 'failed', error_msg: err.message });
      event.sender.send('training:error', { jobId, error: err.message });
      return { error: err.message };
    }
  });

  ipcMain.handle('training:stop', async (event, jobId) => {
    try {
      const job = await ipcMain._invokeHandler('db:getJob', jobId);
      if (!job || !job.gpu_instance) return { error: 'No active instance' };

      const gpuKey = await ipcMain._invokeHandler('db:getSetting', 'gpu_api_key');
      const provider = job.gpu_provider;

      // Stop monitor
      if (monitors[jobId]) { clearInterval(monitors[jobId]); delete monitors[jobId]; }

      // Destroy GPU
      await ipcMain._invokeHandler('gpu:destroyInstance', provider, gpuKey, job.gpu_instance);

      await ipcMain._invokeHandler('db:updateJob', jobId, {
        status: 'stopped',
        finished_at: new Date().toISOString(),
      });
      event.sender.send('training:progress', { jobId, status: 'stopped', progress: 0, message: 'Training stopped' });
      return { success: true };
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('training:status', async (_, jobId) => {
    const job = await ipcMain._invokeHandler('db:getJob', jobId);
    return job ? { status: job.status, progress: job.progress, cost: job.cost_spent, eta: job.eta_seconds } : null;
  });

  // ── Monitor Loop ──
  function startMonitor(sender, ipc, jobId, provider, gpuKey, instanceId, spendLimit) {
    let elapsed = 0;
    const POLL_INTERVAL = 30000; // 30s

    monitors[jobId] = setInterval(async () => {
      try {
        elapsed += POLL_INTERVAL / 1000;
        const job = await ipc._invokeHandler('db:getJob', jobId);
        if (!job || job.status === 'stopped' || job.status === 'completed' || job.status === 'failed') {
          clearInterval(monitors[jobId]);
          delete monitors[jobId];
          return;
        }

        // Get instance status
        const instance = await ipc._invokeHandler('gpu:getInstance', provider, gpuKey, instanceId);

        // Calculate cost (rough: elapsed time * price/hr)
        const gpu = await ipc._invokeHandler('gpu:listGPUs', provider, gpuKey, 0);
        const priceHr = (Array.isArray(gpu) && gpu.find(g => String(g.id) === String(instanceId))?.priceHr) || 0.5;
        const cost = (elapsed / 3600) * priceHr;

        // Estimate progress (rough based on elapsed vs expected time)
        const config = JSON.parse(job.config || '{}');
        const expectedMin = (config.epochs || 20) * 1.5; // ~1.5 min per epoch rough
        const progress = Math.min(95, Math.round((elapsed / 60 / expectedMin) * 100));
        const etaSec = Math.max(0, Math.round((expectedMin * 60) - elapsed));

        await ipc._invokeHandler('db:updateJob', jobId, {
          progress,
          cost_spent: Math.round(cost * 100) / 100,
          eta_seconds: etaSec,
        });

        sender.send('training:progress', {
          jobId, status: 'training', progress, cost,
          eta: etaSec,
          message: `Training ${progress}% · $${cost.toFixed(2)} spent · ~${Math.ceil(etaSec/60)}min left`,
        });

        // ── Spend limit check ──
        if (cost >= spendLimit) {
          sender.send('training:progress', { jobId, status: 'stopped', message: `Spend limit ($${spendLimit}) reached. Shutting down.` });
          await ipc._invokeHandler('gpu:destroyInstance', provider, gpuKey, instanceId);
          await ipc._invokeHandler('db:updateJob', jobId, { status: 'stopped', finished_at: new Date().toISOString(), error_msg: 'Spend limit reached' });
          clearInterval(monitors[jobId]);
          delete monitors[jobId];
          return;
        }
        if (cost >= spendLimit * 0.9) {
          sender.send('training:progress', { jobId, status: 'training', message: `⚠ 90% of spend limit reached ($${cost.toFixed(2)}/$${spendLimit})` });
        }

        // Check if instance is done (no longer running)
        if (instance && instance.actual_status === 'exited') {
          sender.send('training:complete', { jobId, message: 'Training complete!' });
          await ipc._invokeHandler('gpu:destroyInstance', provider, gpuKey, instanceId);
          await ipc._invokeHandler('db:updateJob', jobId, { status: 'completed', progress: 100, finished_at: new Date().toISOString() });
          clearInterval(monitors[jobId]);
          delete monitors[jobId];
        }
      } catch (err) {
        console.error('Monitor error:', err);
      }
    }, POLL_INTERVAL);
  }
}

// Helper: allow IPC handles to be called internally
// This patches ipcMain to support internal invoke
function patchIpcMain(ipcMain) {
  const handlers = {};
  const origHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => {
    handlers[channel] = handler;
    origHandle(channel, handler);
  };
  ipcMain._invokeHandler = async (channel, ...args) => {
    if (handlers[channel]) return handlers[channel]({}, ...args);
    throw new Error(`No handler for ${channel}`);
  };
}

module.exports = { register, patchIpcMain };
