// OpenRouter API integration — captioning + chat-to-config
function register(ipcMain) {
  ipcMain.handle('openrouter:validateKey', async (_, apiKey) => {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      return res.ok;
    } catch { return false; }
  });

  ipcMain.handle('openrouter:caption', async (_, imagePaths, apiKey) => {
    // Will be implemented in feat/captioning branch
    return { error: 'Not implemented yet' };
  });

  ipcMain.handle('openrouter:chat', async (_, messages, apiKey) => {
    // Will be implemented in feat/chat-config branch
    return { error: 'Not implemented yet' };
  });
}

module.exports = { register };
