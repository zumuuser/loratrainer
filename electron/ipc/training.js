// Training job orchestrator — manages cloud GPU lifecycle
function register(ipcMain, userDataPath) {
  ipcMain.handle('training:start', async (_, jobId) => {
    // Will be implemented in feat/job-orchestrator branch
    return { error: 'Not implemented yet' };
  });

  ipcMain.handle('training:stop', async (_, jobId) => {
    return { error: 'Not implemented yet' };
  });

  ipcMain.handle('training:status', async (_, jobId) => {
    return { error: 'Not implemented yet' };
  });
}

module.exports = { register };
