// GPU provider API integration — Vast.ai + RunPod
const GPU_SUGGESTIONS = {
  krea2:     { minVram: 24, recommended: 'RTX 4090 / A100 40GB', estCost: '$0.30-1.00' },
  ideogram4: { minVram: 48, recommended: 'A100 80GB / H100',     estCost: '$1.00-3.00' },
  both:      { minVram: 48, recommended: 'A100 80GB / H100',     estCost: '$2.00-5.00' },
};

// ── Vast.ai API ──
const VASTAI_BASE = 'https://console.vast.ai/api/v0';

async function vastaiRequest(endpoint, apiKey, opts = {}) {
  const res = await fetch(`${VASTAI_BASE}${endpoint}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) throw new Error(`Vast.ai ${res.status}: ${await res.text()}`);
  return res.json();
}

async function vastaiListGPUs(apiKey, minVram = 24) {
  const data = await vastaiRequest('/bundles', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      verified: { eq: true },
      external: { eq: false },
      rentable: { eq: true },
      gpu_ram: { gte: minVram * 1024 }, // MB
      num_gpus: { eq: 1 },
      order: [['dph_total', 'asc']],
      type: 'on-demand',
      limit: 20,
    }),
  });
  return (data.offers || []).map(o => ({
    id: o.id,
    gpu: o.gpu_name,
    vram: Math.round(o.gpu_ram / 1024),
    cpus: o.cpu_cores_effective,
    ram: Math.round(o.cpu_ram / 1024),
    storage: o.disk_space,
    priceHr: o.dph_total,
    reliability: o.reliability2,
    location: o.geolocation,
    dlSpeed: o.inet_down,
    label: `${o.gpu_name} ${Math.round(o.gpu_ram/1024)}GB — $${o.dph_total.toFixed(3)}/hr`,
  }));
}

async function vastaiCreateInstance(apiKey, offerId, dockerImage, envVars = {}) {
  const envStr = Object.entries(envVars).map(([k,v]) => `-e ${k}=${v}`).join(' ');
  return vastaiRequest('/asks/', apiKey, {
    method: 'PUT',
    body: JSON.stringify({
      client_id: 'me',
      image: dockerImage,
      env: envVars,
      disk: 50,
      onstart: null,
      runtype: 'args',
      args_str: '',
      template_hash_id: null,
      extra: envStr,
    }),
  });
}

async function vastaiGetInstance(apiKey, instanceId) {
  return vastaiRequest(`/instances/${instanceId}`, apiKey);
}

async function vastaiDestroyInstance(apiKey, instanceId) {
  return vastaiRequest(`/instances/${instanceId}`, apiKey, { method: 'DELETE' });
}

// ── RunPod API ──
const RUNPOD_GQL = 'https://api.runpod.io/graphql';

async function runpodGQL(apiKey, query, variables = {}) {
  const res = await fetch(RUNPOD_GQL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`RunPod ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

async function runpodListGPUs(apiKey, minVram = 24) {
  const data = await runpodGQL(apiKey, `{
    gpuTypes {
      id displayName memoryInGb
      lowestPrice(input: {gpuCount: 1}) { minimumBidPrice uninterruptablePrice }
    }
  }`);
  return (data.gpuTypes || [])
    .filter(g => g.memoryInGb >= minVram && g.lowestPrice?.uninterruptablePrice)
    .map(g => ({
      id: g.id,
      gpu: g.displayName,
      vram: g.memoryInGb,
      priceHr: g.lowestPrice.uninterruptablePrice,
      label: `${g.displayName} ${g.memoryInGb}GB — $${g.lowestPrice.uninterruptablePrice.toFixed(3)}/hr`,
    }))
    .sort((a, b) => a.priceHr - b.priceHr)
    .slice(0, 20);
}

async function runpodCreatePod(apiKey, gpuTypeId, dockerImage, envVars = {}, containerRegistryAuthId = null) {
  const envArray = Object.entries(envVars).map(([key, value]) => ({ key, value }));
  const input = {
    name: 'loratrainer-job',
    imageName: dockerImage,
    gpuTypeId,
    gpuCount: 1,
    volumeInGb: 50,
    containerDiskInGb: 20,
    env: envArray,
    startSsh: true,
  };
  if (containerRegistryAuthId) {
    input.containerRegistryAuthId = containerRegistryAuthId;
  }
  const data = await runpodGQL(apiKey, `
    mutation($input: PodFindAndDeployOnDemandInput!) { podFindAndDeployOnDemand(input: $input) { id } }
  `, {
    input
  });
  return data.podFindAndDeployOnDemand;
}

async function runpodGetPod(apiKey, podId) {
  const data = await runpodGQL(apiKey, `{ pod(input: {podId: "${podId}"}) { id name runtime { uptimeInSeconds gpus { id } } } }`);
  return data.pod;
}

async function runpodStopPod(apiKey, podId) {
  return runpodGQL(apiKey, `mutation { podStop(input: {podId: "${podId}"}) { id } }`);
}

async function runpodTerminatePod(apiKey, podId) {
  return runpodGQL(apiKey, `mutation { podTerminate(input: {podId: "${podId}"}) }`);
}

// ── IPC Registration ──
function register(ipcMain) {
  ipcMain.handle('gpu:validateKey', async (_, provider, apiKey) => {
    try {
      if (provider === 'vastai') {
        await vastaiRequest('/users/current', apiKey);
        return true;
      } else if (provider === 'runpod') {
        await runpodGQL(apiKey, '{ myself { id } }');
        return true;
      }
      return false;
    } catch { return false; }
  });

  ipcMain.handle('gpu:listGPUs', async (_, provider, apiKey, minVram) => {
    try {
      if (provider === 'vastai') return await vastaiListGPUs(apiKey, minVram);
      if (provider === 'runpod') return await runpodListGPUs(apiKey, minVram);
      return [];
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('gpu:suggest', (_, baseModel) => {
    return GPU_SUGGESTIONS[baseModel] || GPU_SUGGESTIONS.krea2;
  });

  ipcMain.handle('gpu:createInstance', async (_, provider, apiKey, params) => {
    try {
      if (provider === 'vastai') return await vastaiCreateInstance(apiKey, params.offerId, params.image, params.env);
      if (provider === 'runpod') return await runpodCreatePod(apiKey, params.gpuTypeId, params.image, params.env, params.containerRegistryAuthId);
      return { error: 'Unknown provider' };
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('gpu:getInstance', async (_, provider, apiKey, instanceId) => {
    try {
      if (provider === 'vastai') return await vastaiGetInstance(apiKey, instanceId);
      if (provider === 'runpod') return await runpodGetPod(apiKey, instanceId);
      return null;
    } catch (err) { return { error: err.message }; }
  });

  ipcMain.handle('gpu:destroyInstance', async (_, provider, apiKey, instanceId) => {
    try {
      if (provider === 'vastai') return await vastaiDestroyInstance(apiKey, instanceId);
      if (provider === 'runpod') return await runpodTerminatePod(apiKey, instanceId);
      return true;
    } catch (err) { return { error: err.message }; }
  });
}

module.exports = { register };
