const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, session, shell } = require('electron');
const { createStaticServer } = require('./static-server.cjs');
const { abortAllVideoTranscodes } = require('./video-transcoder.cjs');

// 便携版运行环境与数据目录自适应配置：
// 1. 若运行于单文件 NSIS 便携版中，真实运行根目录位于 process.env.PORTABLE_EXECUTABLE_DIR；
// 2. 若运行于免安装绿色解压版中，真实运行根目录位于 app.getPath('exe') 同级目录；
// 当根目录中存在 .portable 标记或 data 目录时，将 userData 和缓存重定向至该 data 目录，实现数据完全便携化。
function configurePortableEnvironment() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const realDir = process.env.PORTABLE_EXECUTABLE_DIR;
    const portableMarker = path.join(realDir, '.portable');
    const dataDir = path.join(realDir, 'data');
    if (fs.existsSync(portableMarker) || fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        app.setPath('userData', dataDir);
      } catch (err) {
        console.warn('Failed to redirect portable userData for single-file exe:', err);
      }
    }
  } else if (app.isPackaged) {
    const exeDir = path.dirname(process.execPath);
    const portableMarker = path.join(exeDir, '.portable');
    const dataDir = path.join(exeDir, 'data');
    if (fs.existsSync(portableMarker) || fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        app.setPath('userData', dataDir);
      } catch (err) {
        console.warn('Failed to redirect portable userData for unpacked directory:', err);
      }
    }
  }
}

configurePortableEnvironment();

const AGENT_BRIDGE_PROTOCOL_VERSION = 1;
const AGENT_BRIDGE_MAX_BODY_BYTES = 64 * 1024 * 1024;
const AGENT_BRIDGE_REQUEST_TIMEOUT_MS = 120000;

function readJsonBody(request, limit = AGENT_BRIDGE_MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function writeJsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(body);
}

function tokensMatch(expected, provided) {
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

let mainWindow = null;
let staticServer = null;
let agentBridgeServer = null;
let agentBridgeToken = null;
let agentBridgeDiscoveryPaths = [];
let allowMainWindowClose = false;
let rendererCloseGuardReady = false;
const videoTranscodeToken = crypto.randomBytes(32).toString('hex');
const pendingAgentRequests = new Map();

function rejectPendingAgentRequests(code = 'EDITOR_CLOSED', message = 'Skin editor is closing') {
  for (const pending of pendingAgentRequests.values()) {
    clearTimeout(pending.timer);
    const err = new Error(message);
    err.code = code;
    pending.reject(err);
  }
  pendingAgentRequests.clear();
}

ipcMain.handle('desktop:get-video-transcode-token', (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return '';
  }
  return videoTranscodeToken;
});

ipcMain.on('desktop:close-guard-ready', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  rendererCloseGuardReady = true;
});

ipcMain.on('desktop:allow-close', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || mainWindow.isDestroyed()) return;
  allowMainWindowClose = true;
  mainWindow.close();
});

ipcMain.on('skin-agent:response', (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  const requestId = payload && payload.requestId;
  const pending = pendingAgentRequests.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingAgentRequests.delete(requestId);
  const response = payload.response || {};
  if (response.ok) {
    pending.resolve(response.result);
  } else {
    const err = new Error(
      (response.error && response.error.message) || 'Skin editor command failed'
    );
    err.code = (response.error && response.error.code) || 'AGENT_COMMAND_FAILED';
    err.details = response.error && response.error.details;
    pending.reject(err);
  }
});

function invokeRenderer(method, params = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    const err = new Error('Skin editor window is not available');
    err.code = 'EDITOR_NOT_READY';
    return Promise.reject(err);
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAgentRequests.delete(requestId);
      const err = new Error(`Skin editor command timed out: ${method}`);
      err.code = 'COMMAND_TIMEOUT';
      reject(err);
    }, AGENT_BRIDGE_REQUEST_TIMEOUT_MS);

    pendingAgentRequests.set(requestId, { resolve, reject, timer });
    mainWindow.webContents.send('skin-agent:request', {
      requestId,
      method,
      params
    });
  });
}

function createAgentBridgeServer() {
  return http.createServer(async (request, response) => {
    const authorization = String(request.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!tokensMatch(agentBridgeToken, token)) {
      writeJsonResponse(response, 401, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid agent bridge token' }
      });
      return;
    }

    let url;
    try {
      url = new URL(request.url || '/', 'http://127.0.0.1');
    } catch {
      writeJsonResponse(response, 400, {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid request URL' }
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      writeJsonResponse(response, 200, {
        ok: true,
        protocolVersion: AGENT_BRIDGE_PROTOCOL_VERSION,
        appVersion: app.getVersion()
      });
      return;
    }

    if (request.method !== 'POST' || url.pathname !== '/invoke') {
      writeJsonResponse(response, 404, {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Unknown agent bridge endpoint' }
      });
      return;
    }

    try {
      const body = await readJsonBody(request);
      if (!body || typeof body.method !== 'string' || !body.method.trim()) {
        const err = new Error('method is required');
        err.code = 'INVALID_REQUEST';
        throw err;
      }
      const result = await invokeRenderer(body.method, body.params || {});
      writeJsonResponse(response, 200, { ok: true, result });
    } catch (error) {
      writeJsonResponse(response, error.statusCode || 400, {
        ok: false,
        error: {
          code: error.code || 'BRIDGE_ERROR',
          message: error.message || 'Agent bridge request failed',
          details: error.details || null
        }
      });
    }
  });
}

function writeAgentBridgeDiscovery(port) {
  const discovery = {
    protocolVersion: AGENT_BRIDGE_PROTOCOL_VERSION,
    url: `http://127.0.0.1:${port}`,
    token: agentBridgeToken,
    appVersion: app.getVersion(),
    pid: process.pid,
    updatedAt: new Date().toISOString()
  };
  agentBridgeDiscoveryPaths = [
    path.join(app.getPath('userData'), 'agent-bridge.json'),
    path.join(app.getPath('temp'), 'osu-mania-skin-editor-agent-bridge.json')
  ];
  for (const discoveryPath of agentBridgeDiscoveryPaths) {
    fs.mkdirSync(path.dirname(discoveryPath), { recursive: true });
    fs.writeFileSync(discoveryPath, JSON.stringify(discovery, null, 2), {
      encoding: 'utf8',
      mode: 0o600
    });
  }
}

function removeAgentBridgeDiscovery() {
  for (const discoveryPath of agentBridgeDiscoveryPaths) {
    try {
      fs.rmSync(discoveryPath, { force: true });
    } catch {}
  }
  agentBridgeDiscoveryPaths = [];
}

async function ensureAgentBridgeServer() {
  if (agentBridgeServer) {
    writeAgentBridgeDiscovery(agentBridgeServer.port);
    return;
  }
  agentBridgeToken = crypto.randomBytes(32).toString('hex');
  agentBridgeServer = createAgentBridgeServer();
  agentBridgeServer.port = await listen(agentBridgeServer);
  writeAgentBridgeDiscovery(agentBridgeServer.port);
}

function closeHttpServer(server) {
  if (!server) return;
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  server.close();
}

function closeAgentBridgeServer() {
  rejectPendingAgentRequests('EDITOR_CLOSED', 'Skin editor is closing');
  removeAgentBridgeDiscovery();
  if (agentBridgeServer) {
    closeHttpServer(agentBridgeServer);
    agentBridgeServer = null;
  }
}

async function createMainWindow() {
  const iconPath = path.join(app.getAppPath(), 'assets', 'app-icon.ico');

  if (!staticServer) {
    const packagedFFmpegDir = path.join(process.resourcesPath, 'ffmpeg-lgpl-win64', 'bin');
    staticServer = createStaticServer(app.getAppPath(), {
      videoTranscodeOptions: {
        ffmpegDir: app.isPackaged ? packagedFFmpegDir : undefined,
        token: videoTranscodeToken
      }
    });
    staticServer.port = await listen(staticServer);
  }

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1b1622',
    icon: iconPath,
    title: 'osu!mania 可视化皮肤编辑器',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (allowMainWindowClose || !rendererCloseGuardReady) return;
    event.preventDefault();
    mainWindow.webContents.send('desktop:close-requested');
  });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (!isMainFrame || isInPlace) return;
    allowMainWindowClose = false;
    rendererCloseGuardReady = false;
    rejectPendingAgentRequests('EDITOR_NAVIGATING', 'Skin editor page is reloading');
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    allowMainWindowClose = false;
    rendererCloseGuardReady = false;
    const reason = details && details.reason ? details.reason : 'unknown';
    rejectPendingAgentRequests('RENDERER_GONE', `Skin editor renderer exited (${reason})`);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    allowMainWindowClose = false;
    rendererCloseGuardReady = false;
    rejectPendingAgentRequests('EDITOR_CLOSED', 'Skin editor window closed');
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const loadPromise = mainWindow.loadURL(`http://127.0.0.1:${staticServer.port}/`);
  const bridgePromise = ensureAgentBridgeServer().catch((err) => {
    console.warn('Agent bridge server initialization failed/deferred:', err);
  });
  await loadPromise;
  await bridgePromise;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.osumania.skineditor');
    Menu.setApplicationMenu(null);
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({
        title: '保存文件',
        buttonLabel: '保存'
      });
      item.once('done', (_doneEvent, state) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('desktop:download-finished', { state });
      });
    });

    await createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
    });
  }).catch((error) => {
    console.error('Unable to start application:', error);
    app.quit();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    abortAllVideoTranscodes();
    closeAgentBridgeServer();
    if (staticServer) {
      closeHttpServer(staticServer);
      staticServer = null;
    }
  });
}
