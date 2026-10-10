// ============================================================================
// video-transcoder.js - browser-side fallback transcoding for unsupported video
// 依赖：vendor/ffmpeg/ffmpeg.min.js
// ============================================================================

        let ffmpegWasmInstance = null;
        let ffmpegWasmLoadPromise = null;

        async function getFFmpegWasmInstance() {
            if (ffmpegWasmInstance) return ffmpegWasmInstance;
            if (ffmpegWasmLoadPromise) return ffmpegWasmLoadPromise;

            ffmpegWasmLoadPromise = (async () => {
                const FFmpegClass = window.FFmpegWASM && window.FFmpegWASM.FFmpeg;
                if (!FFmpegClass) {
                    throw new Error('ffmpeg.wasm 未加载');
                }

                const ffmpeg = new FFmpegClass();
                await ffmpeg.load({
                    coreURL: new URL('vendor/ffmpeg/ffmpeg-core.js', location.href).href,
                    wasmURL: new URL('vendor/ffmpeg/ffmpeg-core.wasm', location.href).href
                });
                ffmpegWasmInstance = ffmpeg;
                return ffmpeg;
            })().catch(error => {
                ffmpegWasmLoadPromise = null;
                throw error;
            });

            return ffmpegWasmLoadPromise;
        }

        async function transcodeVideoBlobForBrowser(blob, sourcePath) {
            const ffmpeg = await getFFmpegWasmInstance();
            const extension = String(sourcePath || '').split('.').pop().toLowerCase() || 'bin';
            const inputPath = `storyboard-input.${extension}`;
            const outputPath = 'storyboard-output.mp4';

            const progressHandler = ({ progress }) => {
                const percent = Math.max(0, Math.min(100, Math.round((progress || 0) * 100)));
                const modal = document.getElementById('progressModal');
                if (modal && modal.classList.contains('visible') && typeof updateProgress === 'function') {
                    updateProgress(percent, 100, `视频背景转码 ${percent}%`);
                }
            };

            if (typeof showToast === 'function') {
                showToast('视频背景', '正在后台转换视频背景（已优先呈现静态曲绘与谱面）');
            }
            ffmpeg.on('progress', progressHandler);

            try {
                const source = new Uint8Array(await blob.arrayBuffer());
                await ffmpeg.writeFile(inputPath, source);
                await ffmpeg.exec([
                    '-i', inputPath,
                    '-map', '0:v:0',
                    '-vf', 'scale=min(1280\\,iw):-2:flags=fast_bilinear',
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-crf', '28',
                    '-pix_fmt', 'yuv420p',
                    '-an',
                    '-movflags', '+faststart',
                    outputPath
                ]);
                const output = await ffmpeg.readFile(outputPath);
                return new Blob([output], { type: 'video/mp4' });
            } finally {
                ffmpeg.off('progress', progressHandler);
                try { await ffmpeg.deleteFile(inputPath); } catch (_) {}
                try { await ffmpeg.deleteFile(outputPath); } catch (_) {}
            }
        }
