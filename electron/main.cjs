const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, Menu, session, shell } = require('electron');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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

function createStaticServer(root) {
  const resolvedRoot = path.resolve(root);

  return http.createServer((request, response) => {
    let url;
    try {
      url = new URL(request.url, 'http://127.0.0.1');
    } catch {
      response.writeHead(400);
      response.end('Bad Request');
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
      sandbox: true
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
    if (staticServer) {
      staticServer.close();
      staticServer = null;
    }
  });
}
