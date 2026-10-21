const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skinEditorAgentBridge', {
  onRequest(handler) {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('skin-agent:request', listener);
    return () => ipcRenderer.removeListener('skin-agent:request', listener);
  },
  respond(requestId, response) {
    if (!requestId) return;
    ipcRenderer.send('skin-agent:response', {
      requestId,
      response
    });
  }
});
