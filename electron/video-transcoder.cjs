const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const VIDEO_TRANSCODE_PATH = '/__video-transcode';
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const activeTranscodes = new Set();

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

function tokensMatch(expected, provided) {
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(String(expected));
  const providedBuffer = Buffer.from(String(provided));
  return expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function createAbortError(message = '视频转码已取消') {
  return Object.assign(new Error(message), { name: 'AbortError', statusCode: 499 });
}

function createTranscodeSession(tempDir) {
  const session = {
    tempDir,
    child: null,
    aborted: false,
    abortController: new AbortController(),
    abort(force = false) {
      if (this.aborted && !force) return;
      this.aborted = true;
      this.abortController.abort();
      if (this.child && !this.child.killed) {
        try {
          this.child.kill(force ? 'SIGKILL' : 'SIGTERM');
        } catch {}
        if (!force) {
          const childRef = this.child;
          const killTimer = setTimeout(() => {
            try {
              if (childRef && !childRef.killed) childRef.kill('SIGKILL');
            } catch {}
          }, 1000);
          if (typeof killTimer.unref === 'function') killTimer.unref();
        }
      }
    }
  };
  return session;
}

function abortAllVideoTranscodes() {
  for (const session of Array.from(activeTranscodes)) {
    session.abort(true);
    if (session.tempDir) {
      try {
        fs.rmSync(session.tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

function runProcess(command, args, session = null) {
  if (session && session.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if (session) session.child = child;
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
    child.once('error', (error) => {
      if (session && session.child === child) session.child = null;
      reject(session && session.aborted ? createAbortError() : error);
    });
    child.once('close', (code) => {
      if (session && session.child === child) session.child = null;
      if (session && session.aborted) {
        reject(createAbortError());
        return;
      }
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

async function probeDuration(ffprobePath, inputPath, session = null) {
  try {
    const result = await runProcess(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ], session);
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

async function transcodeInputFileToOutput(inputPath, outputPath, options = {}, session = null) {
  const { ffmpeg: ffmpegPath, ffprobe: ffprobePath } = getFFmpegPaths(options.ffmpegDir);
  const duration = await probeDuration(ffprobePath, inputPath, session);
  if (session && session.aborted) {
    throw createAbortError();
  }

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
    if (session) session.child = child;
    const stderr = [];
    let stderrBytes = 0;

    child.stderr.on('data', chunk => {
      parseProgress(chunk, duration, options.onProgress);
      if (stderrBytes < 8192) {
        stderr.push(chunk);
        stderrBytes += chunk.length;
      }
    });
    child.once('error', (error) => {
      if (session && session.child === child) session.child = null;
      reject(session && session.aborted ? createAbortError() : error);
    });
    child.once('close', (code) => {
      if (session && session.child === child) session.child = null;
      if (session && session.aborted) {
        reject(createAbortError());
        return;
      }
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
}

async function transcodeVideoBuffer(inputBuffer, sourcePath, options = {}) {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new Error('视频数据为空');
  }
  if (inputBuffer.length > MAX_VIDEO_BYTES) {
    throw new Error('视频文件超过 512 MB，无法在浏览器预览中转码');
  }

  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'osu-skin-video-'));
  const session = createTranscodeSession(tempDir);
  activeTranscodes.add(session);
  const inputPath = path.join(tempDir, `input.${sourceExtension(sourcePath)}`);
  const outputPath = path.join(tempDir, 'output.webm');

  try {
    await fsPromises.writeFile(inputPath, inputBuffer);
    await transcodeInputFileToOutput(inputPath, outputPath, options, session);
    return await fsPromises.readFile(outputPath);
  } finally {
    activeTranscodes.delete(session);
    await fsPromises.rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {});
  }
}

async function streamRequestToFile(request, inputPath, maxBytes, signal) {
  let total = 0;
  let sizeError = null;
  const writeStream = fs.createWriteStream(inputPath);
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        sizeError = Object.assign(new Error('视频文件过大'), { statusCode: 413 });
        callback(sizeError);
        return;
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(request, limiter, writeStream, { signal });
  } catch (error) {
    if (sizeError) {
      request.destroy();
      throw sizeError;
    }
    throw error;
  }

  if (total === 0) {
    throw Object.assign(new Error('视频数据为空'), { statusCode: 400 });
  }
  return total;
}

function writeJson(response, statusCode, payload, extraHeaders = {}) {
  if (response.headersSent || response.destroyed || !response.writable) return;
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  response.end(body);
}

function validateVideoTranscodeRequest(request, options = {}) {
  if (request.method !== 'POST') {
    return { ok: false, statusCode: 405, error: 'Method not allowed' };
  }

  const host = String(request.headers.host || '').trim();
  const hostOrigin = host ? `http://${host}` : '';
  const expectedOrigins = Array.isArray(options.expectedOrigins) && options.expectedOrigins.length > 0
    ? options.expectedOrigins
    : (hostOrigin ? [hostOrigin] : []);

  if (!hostOrigin || !expectedOrigins.includes(hostOrigin)) {
    return { ok: false, statusCode: 403, error: 'Forbidden' };
  }

  const secFetchSite = request.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return { ok: false, statusCode: 403, error: 'Forbidden' };
  }

  const origin = request.headers.origin;
  if (options.token) {
    const providedToken = request.headers['x-osu-video-transcode-token'];
    if (!tokensMatch(options.token, providedToken)) {
      return { ok: false, statusCode: 403, error: 'Forbidden' };
    }
    if (origin && !expectedOrigins.includes(origin)) {
      return { ok: false, statusCode: 403, error: 'Forbidden' };
    }
  } else if (!origin || !expectedOrigins.includes(origin)) {
    return { ok: false, statusCode: 403, error: 'Forbidden' };
  }

  if (request.headers['x-osu-video-transcode'] !== '1') {
    return { ok: false, statusCode: 400, error: 'Missing transcode header' };
  }

  let requestUrl;
  try {
    requestUrl = new URL(request.url || '/', expectedOrigins[0]);
  } catch {
    return { ok: false, statusCode: 400, error: 'Bad Request' };
  }

  if (request.headers['content-length'] !== undefined) {
    const contentLength = Number(request.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES) {
      return { ok: false, statusCode: 413, error: '视频文件过大', destroyRequest: true };
    }
  }

  return {
    ok: true,
    sourcePath: requestUrl.searchParams.get('source') || ''
  };
}

async function handleVideoTranscodeRequest(request, response, options = {}) {
  const validation = validateVideoTranscodeRequest(request, options);
  if (!validation.ok) {
    writeJson(
      response,
      validation.statusCode,
      { error: validation.error },
      validation.destroyRequest ? { Connection: 'close' } : {}
    );
    if (validation.destroyRequest) request.destroy();
    return;
  }

  let tempDir = null;
  let session = null;
  const onRequestClose = () => {
    if (!request.complete && session) session.abort(false);
  };
  const onResponseClose = () => {
    if (!response.writableFinished && session) session.abort(false);
  };

  try {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'osu-skin-video-'));
    session = createTranscodeSession(tempDir);
    activeTranscodes.add(session);

    request.on('close', onRequestClose);
    response.on('close', onResponseClose);

    const inputPath = path.join(tempDir, `input.${sourceExtension(validation.sourcePath)}`);
    const outputPath = path.join(tempDir, 'output.webm');

    await streamRequestToFile(request, inputPath, MAX_VIDEO_BYTES, session.abortController.signal);
    await transcodeInputFileToOutput(inputPath, outputPath, options, session);

    if (session.aborted || response.destroyed || !response.writable) {
      return;
    }

    const outputStats = await fsPromises.stat(outputPath);
    if (session.aborted || response.destroyed || !response.writable) {
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'video/webm',
      'Content-Length': outputStats.size,
      'Cache-Control': 'no-store'
    });

    await pipeline(
      fs.createReadStream(outputPath),
      response,
      { signal: session.abortController.signal }
    );
  } catch (error) {
    const isCancelled = (session && session.aborted) || error.name === 'AbortError';
    if (!isCancelled) {
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      console.warn('视频背景转码失败:', error.message);
      writeJson(
        response,
        statusCode,
        { error: error.message || '视频背景转码失败' },
        statusCode === 413 ? { Connection: 'close' } : {}
      );
      if (statusCode === 413) request.destroy();
    }
  } finally {
    request.off('close', onRequestClose);
    response.off('close', onResponseClose);
    if (session) activeTranscodes.delete(session);
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {});
    }
  }
}

module.exports = {
  MAX_VIDEO_BYTES,
  VIDEO_TRANSCODE_PATH,
  abortAllVideoTranscodes,
  bundledFFmpegDir,
  handleVideoTranscodeRequest,
  transcodeVideoBuffer
};
