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

contextBridge.exposeInMainWorld('skinEditorDesktop', {
  notifyCloseGuardReady() {
    ipcRenderer.send('desktop:close-guard-ready');
  },
  onCloseRequested(handler) {
    if (typeof handler !== 'function') return () => {};
    const listener = () => handler();
    ipcRenderer.on('desktop:close-requested', listener);
    return () => ipcRenderer.removeListener('desktop:close-requested', listener);
  },
  allowClose() {
    ipcRenderer.send('desktop:allow-close');
  },
  waitForNextDownload() {
    let listener = null;
    const promise = new Promise((resolve) => {
      listener = (_event, payload) => {
        resolve(payload && payload.state ? payload.state : 'interrupted');
      };
      ipcRenderer.once('desktop:download-finished', listener);
    });
    return {
      promise,
      cancel() {
        if (listener) ipcRenderer.removeListener('desktop:download-finished', listener);
      }
    };
  }
});
