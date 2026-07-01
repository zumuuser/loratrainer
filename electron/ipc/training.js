// Training job orchestrator — manages full cloud GPU lifecycle
const path = require('path');
const fs = require('fs');

// Active job monitors (jobId -> intervalId)
const monitors = {};

function register(ipcMain, userDataPath) {
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

      const steps = config.epochs * 100;
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
        : gpuList[0];

      const dockerImage = await ipcMain._invokeHandler('db:getSetting', 'docker_image') || 'loratrainer/trainer:latest';
      const containerRegistryAuthId = await ipcMain._invokeHandler('db:getSetting', 'runpod_registry_auth_id') || null;
      const envVars = {
        JOB_ID: String(jobId),
      };

      const createParams = provider === 'vastai'
        ? { offerId: selectedGPU.id, image: dockerImage, env: envVars }
        : { gpuTypeId: selectedGPU.id, image: dockerImage, env: envVars, containerRegistryAuthId };

      const instance = await ipcMain._invokeHandler('gpu:createInstance', provider, gpuKey, createParams);
      if (instance.error) throw new Error('Failed to create instance: ' + instance.error);

      const instanceId = instance.id || instance.new_contract;

      // Wait for the instance endpoint to boot up and respond
      let endpoint = null;
      let retries = 40; // 40 * 15s = 10 minutes max
      while (retries > 0 && !endpoint) {
        event.sender.send('training:progress', { jobId, status: 'uploading', progress: 10, message: `Provisioning container (retry ${41 - retries}/40)...` });
        await new Promise(r => setTimeout(r, 15000));

        const inst = await ipcMain._invokeHandler('gpu:getInstance', provider, gpuKey, instanceId);
        if (provider === 'vastai' && inst && inst.public_ipaddr && inst.ports && inst.ports['8000/tcp']) {
          const portObj = inst.ports['8000/tcp'][0];
          if (portObj) endpoint = `http://${inst.public_ipaddr}:${portObj.HostPort}`;
        } else if (provider === 'runpod' && inst && inst.runtime) {
          // Check if port 8000 proxy is active
          endpoint = `http://${instanceId}-8000.proxy.runpod.net`;
        }
        retries--;
      }

      if (!endpoint) throw new Error('Timeout waiting for GPU container web server to start.');

      // Wait for HTTP connectivity to the upload endpoint
      event.sender.send('training:progress', { jobId, status: 'uploading', progress: 20, message: 'Connecting to container upload server...' });
      let connected = false;
      for (let i = 0; i < 5; i++) {
        try {
          const check = await fetch(`${endpoint}/upload`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(5000) });
          connected = true;
          break;
        } catch {
          await new Promise(r => setTimeout(r, 5000));
        }
      }

      // Fetch images and captions from database
      const dbImages = await ipcMain._invokeHandler('db:getDatasetImages', jobId);
      if (!dbImages.length) throw new Error('No dataset images found in job database');

      // Upload each image/caption companion to container
      for (let i = 0; i < dbImages.length; i++) {
        const img = dbImages[i];
        if (!fs.existsSync(img.file_path)) continue;

        const imgBuffer = fs.readFileSync(img.file_path);
        const imageB64 = imgBuffer.toString('base64');
        const filename = path.basename(img.file_path);

        const payload = {
          filename,
          image_b64: imageB64,
          caption: img.caption || ''
        };

        const upRes = await fetch(`${endpoint}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!upRes.ok) throw new Error(`Dataset upload failed for image ${filename}: ${await upRes.text()}`);

        const pct = 20 + Math.round(((i + 1) / dbImages.length) * 50); // 20% to 70%
        event.sender.send('training:progress', { jobId, status: 'uploading', progress: pct, message: `Uploading dataset ${i + 1}/${dbImages.length}...` });
      }

      // Start the training task by pushing the configuration YAML
      event.sender.send('training:progress', { jobId, status: 'uploading', progress: 75, message: 'Pushing training configuration YAML...' });
      const startRes = await fetch(`${endpoint}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_yaml: template }),
      });
      if (!startRes.ok) throw new Error(`Failed to initialize container training: ${await startRes.text()}`);

      await ipcMain._invokeHandler('db:updateJob', jobId, {
        status: 'training',
        gpu_instance: String(instanceId),
        gpu_type: selectedGPU.gpu || selectedGPU.label,
      });
      event.sender.send('training:progress', { jobId, status: 'training', progress: 80, message: `Training launched on ${selectedGPU.gpu || selectedGPU.label}` });

      // Start monitoring loop
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

      if (monitors[jobId]) { clearInterval(monitors[jobId]); delete monitors[jobId]; }

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
        if (!job || ['stopped', 'completed', 'failed'].includes(job.status)) {
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
        const expectedMin = (config.epochs || 20) * 1.5;
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

        // Determine server endpoint for download checking
        let endpoint = null;
        if (provider === 'vastai' && instance && instance.public_ipaddr && instance.ports && instance.ports['8000/tcp']) {
          const portObj = instance.ports['8000/tcp'][0];
          if (portObj) endpoint = `http://${instance.public_ipaddr}:${portObj.HostPort}`;
        } else if (provider === 'runpod' && instanceId) {
          endpoint = `http://${instanceId}-8000.proxy.runpod.net`;
        }

        if (endpoint) {
          try {
            const doneCheck = await fetch(`${endpoint}/done.txt`, { signal: AbortSignal.timeout(5000) });
            if (doneCheck.ok) {
              sender.send('training:progress', { jobId, status: 'generating_samples', progress: 95, message: 'Downloading model & samples...' });
              await ipc._invokeHandler('db:updateJob', jobId, { status: 'generating_samples' });

              const destModelPath = path.join(modelsDir, `${jobId}_model.safetensors`);
              const destThumbPath = path.join(modelsDir, `${jobId}_sample.png`);

              // Download model
              await ipc._invokeHandler('storage:downloadFile', { url: `${endpoint}/model.safetensors`, destPath: destModelPath });
              
              // Download sample thumbnail
              try {
                await ipc._invokeHandler('storage:downloadFile', { url: `${endpoint}/sample.png`, destPath: destThumbPath });
              } catch {
                // Ignore missing thumbnail, fallback to null
              }

              // Register model in database
              const modelData = {
                job_id: jobId,
                name: job.name,
                base_model: job.base_model,
                file_path: destModelPath,
                file_size: fs.existsSync(destModelPath) ? fs.statSync(destModelPath).size : 0,
                thumbnail: fs.existsSync(destThumbPath) ? destThumbPath : null,
                sample_images: JSON.stringify(fs.existsSync(destThumbPath) ? [destThumbPath] : []),
                training_cost: cost,
              };

              const stmt = ipcMain._db.prepare(`
                INSERT INTO models (job_id, name, base_model, file_path, file_size, thumbnail, sample_images, training_cost)
                VALUES (@job_id, @name, @base_model, @file_path, @file_size, @thumbnail, @sample_images, @training_cost)
              `);
              stmt.run(modelData);

              // Shutdown server
              await ipc._invokeHandler('gpu:destroyInstance', provider, gpuKey, instanceId);

              // Complete Job
              await ipc._invokeHandler('db:updateJob', jobId, { status: 'completed', progress: 100, finished_at: new Date().toISOString() });
              sender.send('training:complete', { jobId, message: 'Training complete and model downloaded!' });

              clearInterval(monitors[jobId]);
              delete monitors[jobId];
            }
          } catch (fetchErr) {
            // Server not up yet or unreachable, continue polling
          }
        }

        // Fallback: Check if instance is terminated externally
        if (instance && (instance.actual_status === 'exited' || instance.status === 'TERMINATED')) {
          await ipc._invokeHandler('db:updateJob', jobId, { status: 'failed', error_msg: 'GPU instance terminated unexpectedly' });
          sender.send('training:error', { jobId, error: 'GPU instance terminated unexpectedly' });
          clearInterval(monitors[jobId]);
          delete monitors[jobId];
        }
      } catch (err) {
        console.error('Monitor error:', err);
      }
    }, POLL_INTERVAL);
  }
}

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
