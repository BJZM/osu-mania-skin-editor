// ============================================================================
// video-transcoder.js - local LGPL FFmpeg fallback for unsupported video
// ============================================================================

        async function transcodeVideoBlobForBrowser(blob, sourcePath) {
            if (typeof showToast === 'function') {
                showToast('视频背景', '正在后台转换为 Chromium 可播放的 WebM（已优先呈现静态曲绘与谱面）');
            }
            const response = await fetch(
                `/__video-transcode?source=${encodeURIComponent(String(sourcePath || ''))}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'X-Osu-Video-Transcode': '1'
                    },
                    body: blob
                }
            );
            if (!response.ok) {
                let detail = '';
                try {
                    const payload = await response.json();
                    detail = payload && payload.error ? `：${payload.error}` : '';
                } catch (_) {}
                throw new Error(`本机视频转码失败${detail}`);
            }
            return new Blob([await response.arrayBuffer()], { type: 'video/webm' });
        }
