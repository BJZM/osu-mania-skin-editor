const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const VIDEO_TRANSCODE_PATH = '/__video-transcode';
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

function bundledFFmpegDir() {
  return path.join(__dirname, '..', 'vendor', 'ffmpeg-lgpl-win64', 'bin');
}

function executable(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function getFFmpegPaths(ffmpegDir = bundledFFmpegDir()) {
  const overrideDir = process.env.OSU_SKIN_EDITOR_FFMPEG_DIR;
  const resolvedDir = overrideDir ? path.resolve(overrideDir) : ffmpegDir;
  return {
    ffmpeg: path.join(resolvedDir, executable('ffmpeg')),
    ffprobe: path.join(resolvedDir, executable('ffprobe'))
  };
}

function sourceExtension(sourcePath) {
  const match = String(sourcePath || '').match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : 'bin';
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    let stderrBytes = 0;

    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => {
      if (stderrBytes < 8192) {
        stderr.push(chunk);
        stderrBytes += chunk.length;
      }
    });
    child.once('error', reject);
    child.once('close', code => {
      const output = Buffer.concat(stdout);
      const errorOutput = Buffer.concat(stderr).toString('utf8').trim();
      if (code === 0) {
        resolve({ output, errorOutput });
        return;
      }
      const error = new Error(errorOutput || `${path.basename(command)} exited with code ${code}`);
      error.code = code;
      error.stderr = errorOutput;
      reject(error);
    });
  });
}

async function probeDuration(ffprobePath, inputPath) {
  try {
    const result = await runProcess(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ]);
    const duration = Number.parseFloat(result.output.toString('utf8').trim());
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch (_) {
    return 0;
  }
}

function parseProgress(chunk, duration, onProgress) {
  if (!onProgress) return;
  const text = chunk.toString('utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^out_time_(?:us|ms)=(\d+)$/);
    if (!match) continue;
    const seconds = Number.parseInt(match[1], 10) / 1_000_000;
    if (!Number.isFinite(seconds)) continue;
    const percent = duration > 0
      ? Math.max(0, Math.min(100, Math.round((seconds / duration) * 100)))
      : null;
    onProgress({ seconds, percent });
  }
}

async function transcodeVideoBuffer(inputBuffer, sourcePath, options = {}) {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new Error('视频数据为空');
  }
  if (inputBuffer.length > MAX_VIDEO_BYTES) {
    throw new Error('视频文件超过 512 MB，无法在浏览器预览中转码');
  }

  const { ffmpeg: ffmpegPath, ffprobe: ffprobePath } = getFFmpegPaths(options.ffmpegDir);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osu-skin-video-'));
  const inputPath = path.join(tempDir, `input.${sourceExtension(sourcePath)}`);
  const outputPath = path.join(tempDir, 'output.webm');

  try {
    await fs.writeFile(inputPath, inputBuffer);
    const duration = await probeDuration(ffprobePath, inputPath);

    await new Promise((resolve, reject) => {
      const args = [
        '-nostdin',
        '-hide_banner',
        '-loglevel', 'error',
        '-progress', 'pipe:2',
        '-y',
        '-i', inputPath,
        '-map', '0:v:0',
        '-vf', 'scale=min(1280\\,iw):-2:flags=fast_bilinear',
        '-c:v', 'libvpx',
        '-deadline', 'realtime',
        '-cpu-used', '8',
        '-crf', '30',
        '-b:v', '0',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-f', 'webm',
        outputPath
      ];
      const child = spawn(ffmpegPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      });
      const stderr = [];
      let stderrBytes = 0;

      child.stderr.on('data', chunk => {
        parseProgress(chunk, duration, options.onProgress);
        if (stderrBytes < 8192) {
          stderr.push(chunk);
          stderrBytes += chunk.length;
        }
      });
      child.once('error', reject);
      child.once('close', code => {
        if (code === 0) {
          resolve();
          return;
        }
        const errorOutput = Buffer.concat(stderr).toString('utf8').trim();
        const error = new Error(errorOutput || `FFmpeg exited with code ${code}`);
        error.code = code;
        error.stderr = errorOutput;
        reject(error);
      });
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let finished = false;

    function fail(error) {
      if (finished) return;
      finished = true;
      reject(error);
    }

    request.on('data', chunk => {
      if (finished) return;
      total += chunk.length;
      if (total > maxBytes) {
        fail(Object.assign(new Error('视频文件过大'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (finished) return;
      finished = true;
      resolve(Buffer.concat(chunks, total));
    });
    request.on('error', fail);
  });
}

function writeJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

async function handleVideoTranscodeRequest(request, response, options = {}) {
  if (request.method !== 'POST') {
    writeJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const expectedOrigin = `http://${request.headers.host}`;
  if (request.headers.origin && request.headers.origin !== expectedOrigin) {
    writeJson(response, 403, { error: 'Forbidden' });
    return;
  }
  if (request.headers['x-osu-video-transcode'] !== '1') {
    writeJson(response, 400, { error: 'Missing transcode header' });
    return;
  }

  try {
    const requestUrl = new URL(request.url, expectedOrigin);
    const sourcePath = requestUrl.searchParams.get('source') || '';
    const inputBuffer = await readRequestBody(request, MAX_VIDEO_BYTES);
    const output = await transcodeVideoBuffer(inputBuffer, sourcePath, options);
    response.writeHead(200, {
      'Content-Type': 'video/webm',
      'Content-Length': output.length,
      'Cache-Control': 'no-store'
    });
    response.end(output);
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    console.warn('视频背景转码失败:', error.message);
    writeJson(response, statusCode, { error: error.message || '视频背景转码失败' });
  }
}

module.exports = {
  VIDEO_TRANSCODE_PATH,
  bundledFFmpegDir,
  handleVideoTranscodeRequest,
  transcodeVideoBuffer
};
