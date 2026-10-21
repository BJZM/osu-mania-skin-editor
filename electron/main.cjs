const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, session, shell } = require('electron');
const {
  VIDEO_TRANSCODE_PATH,
  handleVideoTranscodeRequest
} = require('./video-transcoder.cjs');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.osu': 'text/plain; charset=utf-8',
  '.osz': 'application/zip',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip'
};

const AGENT_BRIDGE_PROTOCOL_VERSION = 1;
const AGENT_BRIDGE_MAX_BODY_BYTES = 64 * 1024 * 1024;
const AGENT_BRIDGE_REQUEST_TIMEOUT_MS = 120000;

function createStaticServer(root) {
  const resolvedRoot = path.resolve(root);
  const packagedFFmpegDir = path.join(process.resourcesPath, 'ffmpeg-lgpl-win64', 'bin');

  return http.createServer((request, response) => {
    let url;
    try {
      url = new URL(request.url, 'http://127.0.0.1');
    } catch {
      response.writeHead(400);
      response.end('Bad Request');
      return;
    }

    if (url.pathname === VIDEO_TRANSCODE_PATH) {
      void handleVideoTranscodeRequest(request, response, {
        ffmpegDir: app.isPackaged ? packagedFFmpegDir : undefined
      });
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad Request');
      return;
    }

    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = path.resolve(resolvedRoot, `.${pathname}`);
    const relative = path.relative(resolvedRoot, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        response.writeHead(404);
        response.end('Not Found');
        return;
      }

      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Length': stats.size,
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      });

      if (request.method === 'HEAD') {
        response.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
      stream.pipe(response);
    });
  });
}

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
const pendingAgentRequests = new Map();

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

    const url = new URL(request.url || '/', 'http://127.0.0.1');
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

function closeAgentBridgeServer() {
  for (const pending of pendingAgentRequests.values()) {
    clearTimeout(pending.timer);
    const err = new Error('Skin editor is closing');
    err.code = 'EDITOR_CLOSED';
    pending.reject(err);
  }
  pendingAgentRequests.clear();
  removeAgentBridgeDiscovery();
  if (agentBridgeServer) {
    agentBridgeServer.close();
    agentBridgeServer = null;
  }
}

async function createMainWindow() {
  const iconPath = path.join(app.getAppPath(), 'assets', 'app-icon.ico');

  if (!staticServer) {
    staticServer = createStaticServer(app.getAppPath());
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
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${staticServer.port}/`);
  await ensureAgentBridgeServer();
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
    closeAgentBridgeServer();
    if (staticServer) {
      staticServer.close();
      staticServer = null;
    }
  });
}
