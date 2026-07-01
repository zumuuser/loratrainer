// GPU provider API integration — Vast.ai + RunPod
const GPU_SUGGESTIONS = {
  krea2:     { minVram: 24, recommended: 'RTX 4090 / A100 40GB', estCost: '$0.30-1.00' },
  ideogram4: { minVram: 48, recommended: 'A100 80GB / H100',     estCost: '$1.00-3.00' },
  both:      { minVram: 48, recommended: 'A100 80GB / H100',     estCost: '$2.00-5.00' },
};

function register(ipcMain) {
  ipcMain.handle('gpu:validateKey', async (_, provider, apiKey) => {
    try {
      if (provider === 'vastai') {
        const res = await fetch('https://console.vast.ai/api/v0/users/current', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return res.ok;
      } else if (provider === 'runpod') {
        const res = await fetch('https://api.runpod.io/graphql', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ myself { id } }' }),
        });
        return res.ok;
      }
      return false;
    } catch { return false; }
  });

  ipcMain.handle('gpu:listGPUs', async (_, provider, apiKey) => {
    // Will be implemented in feat/vastai and feat/runpod branches
    return { error: 'Not implemented yet' };
  });

  ipcMain.handle('gpu:suggest', (_, baseModel) => {
    return GPU_SUGGESTIONS[baseModel] || GPU_SUGGESTIONS.krea2;
  });
}

module.exports = { register };
