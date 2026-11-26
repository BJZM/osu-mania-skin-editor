const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
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
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.osu': 'text/plain; charset=utf-8',
  '.osz': 'application/zip',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip'
};

const DEFAULT_ALLOWED_EXACT_PATHS = new Set([
  'index.html',
  'googled9f619fe06c64c49.html',
  'license',
  'third_party_notices.md',
  'src/css/style.css',
  'src/js/bundle.js'
]);

const DEFAULT_ALLOWED_PREFIXES = [
  'assets/',
  'vendor/'
];

const DEFAULT_BLOCKED_PREFIXES = [
  'vendor/ffmpeg-lgpl-win64/'
];

function normalizeRelativePosix(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function isAllowedRuntimePath(relativePath, options = {}) {
  const normalized = normalizeRelativePosix(relativePath);
  if (!normalized) return false;

  for (const prefix of DEFAULT_BLOCKED_PREFIXES) {
    if (normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) {
      return false;
    }
  }

  if (DEFAULT_ALLOWED_EXACT_PATHS.has(normalized)) return true;
  for (const prefix of DEFAULT_ALLOWED_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }

  if (Array.isArray(options.extraAllowedPaths)) {
    for (const allowedPath of options.extraAllowedPaths) {
      if (normalized === normalizeRelativePosix(allowedPath)) {
        return true;
      }
    }
  }

  if (Array.isArray(options.extraAllowedPrefixes)) {
    for (const prefix of options.extraAllowedPrefixes) {
      const normalizedPrefix = normalizeRelativePosix(prefix);
      if (normalizedPrefix && normalized.startsWith(normalizedPrefix)) {
        return true;
      }
    }
  }

  return false;
}

function getExpectedOrigins(server) {
  const addr = server && typeof server.address === 'function' ? server.address() : null;
  const port = addr && typeof addr === 'object' ? addr.port : null;
  if (!port) return [];
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

function createStaticServer(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const server = http.createServer((request, response) => {
    let url;
    try {
      url = new URL(request.url || '/', 'http://127.0.0.1');
    } catch {
      response.writeHead(400);
      response.end('Bad Request');
      return;
    }

    if (url.pathname === VIDEO_TRANSCODE_PATH) {
      const expectedOrigins = getExpectedOrigins(server);
      const dynamicOptions = typeof options.getVideoTranscodeOptions === 'function'
        ? options.getVideoTranscodeOptions({ request, url, expectedOrigins })
        : options.videoTranscodeOptions;
      const transcodeOptions = {
        expectedOrigins,
        ...(dynamicOptions || {})
      };
      void handleVideoTranscodeRequest(request, response, transcodeOptions);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method Not Allowed');
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
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    const relativePosix = relative.split(path.sep).join('/');
    if (!isAllowedRuntimePath(relativePosix, options)) {
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

      const ext = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Length': stats.size,
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
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
      response.on('close', () => {
        if (!stream.destroyed) stream.destroy();
      });
      stream.pipe(response);
    });
  });

  return server;
}

module.exports = {
  MIME_TYPES,
  createStaticServer,
  isAllowedRuntimePath
};
