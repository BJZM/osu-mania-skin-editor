const path = require('node:path');
const { createStaticServer } = require('../electron/static-server.cjs');
const { abortAllVideoTranscodes } = require('../electron/video-transcoder.cjs');

const root = path.resolve(__dirname, '..');
const extraAllowedPrefixes = (process.env.STATIC_SERVER_EXTRA_PREFIXES || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const server = createStaticServer(root, { extraAllowedPrefixes });

server.on('error', (err) => {
  console.error('Server error:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in server:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in server:', reason);
});

function shutdown() {
  abortAllVideoTranscodes();
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

const port = process.env.PORT || 8765;
server.listen(port, '127.0.0.1', () => {
  console.log(`Server listening on http://127.0.0.1:${port}`);
});
