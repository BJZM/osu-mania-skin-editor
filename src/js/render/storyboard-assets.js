// ============================================================================
// storyboard-assets.js - storyboard resource and video playback lifecycle
// 依赖：parser/storyboard.js、parser/zip-timing.js、core/state.js
// ============================================================================

        let storyboardPlaybackState = null;
        let storyboardPlaybackGeneration = 0;

        const STORYBOARD_DEFAULT_ASSET_CACHE_BYTES = 192 * 1024 * 1024;
        const STORYBOARD_DEFAULT_TINT_CACHE_BYTES = 64 * 1024 * 1024;
        const STORYBOARD_MAX_QUEUED_ASSET_LOADS = 64;

        function storyboardAnimationFramePath(path, frameIndex) {
            const dot = path.lastIndexOf('.');
            if (dot < 0) return `${path}${frameIndex}`;
            return `${path.slice(0, dot)}${frameIndex}${path.slice(dot)}`;
        }

        function revokeStoryboardUrl(url) {
            if (!url) return;
            try { URL.revokeObjectURL(url); } catch (_) {}
        }

        function storyboardImageDecodedBytes(image) {
            if (!image) return 0;
            const width = image.naturalWidth || image.videoWidth || image.width || 0;
            const height = image.naturalHeight || image.videoHeight || image.height || 0;
            return Math.max(0, width * height * 4);
        }

        function storyboardCanvasBytes(canvas) {
            if (!canvas) return 0;
            return Math.max(0, (canvas.width || 0) * (canvas.height || 0) * 4);
        }

        function clearStoryboardTintCache(state, asset) {
            if (!asset || !asset.tintCache) return;
            for (const canvas of asset.tintCache.values()) {
                if (state) {
                    state.tintCacheBytes = Math.max(
                        0,
                        state.tintCacheBytes - (canvas._storyboardBytes || storyboardCanvasBytes(canvas))
                    );
                }
                try {
                    canvas.width = 1;
                    canvas.height = 1;
                } catch (_) {}
            }
            asset.tintCache.clear();
        }

        function releaseStoryboardAsset(state, asset, force = false) {
            if (!state || !asset) return false;
            if (!force && (asset.loading || asset.queued || asset.lastUsedFrame === state.assetFrameSerial)) {
                return false;
            }

            clearStoryboardTintCache(state, asset);
            revokeStoryboardUrl(asset.url);
            asset.url = null;

            if (asset.image) {
                try { asset.image.src = ''; } catch (_) {}
                asset.image = null;
            }

            state.assetCacheBytes = Math.max(0, state.assetCacheBytes - (asset.decodedBytes || 0));
            asset.decodedBytes = 0;
            asset.ready = false;
            if (asset.cacheKey) state.assets.delete(asset.cacheKey);
            return true;
        }

        function pruneStoryboardAssetCache(state) {
            if (!state || state.assetCacheBytes <= state.maxAssetCacheBytes) return;

            const candidates = [];
            for (const asset of state.assets.values()) {
                if (!asset.ready || asset.loading || asset.queued) continue;
                if (asset.lastUsedFrame === state.assetFrameSerial) continue;
                candidates.push(asset);
            }
            candidates.sort((a, b) => (a.lastUsedFrame || 0) - (b.lastUsedFrame || 0));

            for (const asset of candidates) {
                if (state.assetCacheBytes <= state.maxAssetCacheBytes) break;
                releaseStoryboardAsset(state, asset);
            }
        }

        function pruneStoryboardTintCache(state) {
            if (!state || state.tintCacheBytes <= state.maxTintCacheBytes) return;

            const candidates = [];
            for (const asset of state.assets.values()) {
                if (!asset.tintCache) continue;
                for (const [key, canvas] of asset.tintCache) {
                    if (canvas._storyboardLastUsedFrame === state.assetFrameSerial) continue;
                    candidates.push({ asset, key, canvas });
                }
            }
            candidates.sort((a, b) => (
                (a.canvas._storyboardLastUsedFrame || 0) - (b.canvas._storyboardLastUsedFrame || 0)
            ));

            for (const entry of candidates) {
                if (state.tintCacheBytes <= state.maxTintCacheBytes) break;
                const bytes = entry.canvas._storyboardBytes || storyboardCanvasBytes(entry.canvas);
                entry.asset.tintCache.delete(entry.key);
                state.tintCacheBytes = Math.max(0, state.tintCacheBytes - bytes);
                try {
                    entry.canvas.width = 1;
                    entry.canvas.height = 1;
                } catch (_) {}
            }
        }

        function disposeStoryboardPlayback() {
            storyboardPlaybackGeneration++;
            const state = storyboardPlaybackState;
            storyboardPlaybackState = null;
            if (!state) return;

            if (state.video && state.video.element) {
                const video = state.video.element;
                try { video.pause(); } catch (_) {}
                try {
                    video.removeAttribute('src');
                    video.load();
                } catch (_) {}
                revokeStoryboardUrl(state.video.url);
            }
            state.video = null;

            if (state.assets) {
                for (const asset of Array.from(state.assets.values())) {
                    releaseStoryboardAsset(state, asset, true);
                }
                state.assets.clear();
            }

            state.assetLoadQueue = [];
            state.activeAssetLoads = 0;
            state.assetCacheBytes = 0;
            state.tintCacheBytes = 0;

            if (state.compositeCanvas) {
                try {
                    state.compositeCanvas.width = 1;
                    state.compositeCanvas.height = 1;
                } catch (_) {}
            }
            state.compositeCanvas = null;
            state.compositeCtx = null;
            state.elementsByLayer = null;
            state.activeElementsByLayer = null;
        }

        function storyboardVideoMime(path) {
            const extension = String(path || '').split('.').pop().toLowerCase();
            if (extension === 'webm') return 'video/webm';
            if (extension === 'mp4' || extension === 'm4v') return 'video/mp4';
            if (extension === 'ogv' || extension === 'ogg') return 'video/ogg';
            return '';
        }

        function canAttemptStoryboardVideo(path) {
            const mime = storyboardVideoMime(path);
            if (!mime) return false;
            const probe = document.createElement('video');
            return probe.canPlayType(mime) !== '';
        }

        function failStoryboardVideo(state, message) {
            if (!state) return;
            state.videoFailed = true;
            if (state.video) state.video.failed = true;
            if (state.videoFailureNotified) return;
            state.videoFailureNotified = true;
            if (message) console.warn(message);
            if (typeof showToast === 'function') {
                showToast('提示', '视频背景无法播放，已回退到静态背景或故事板图片');
            }
        }

        function requestStoryboardRedraw(state) {
            if (!state) return;
            state.compositeDirty = true;
            // 播放中由 requestAnimationFrame 动画主循环连续驱动，无需因单张贴图就绪频繁打断
            if (typeof isPlaying !== 'undefined' && isPlaying) return;
            if (state.redrawPending) return;
            state.redrawPending = true;
            requestAnimationFrame(() => {
                state.redrawPending = false;
                if (storyboardPlaybackState === state && typeof drawFrame === 'function') {
                    drawFrame();
                }
            });
        }

        function getStoryboardFileKey(state, path) {
            if (!state || !state.zip || !path) return null;
            const normalized = String(path).trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/').toLowerCase();
            if (state.fileKeyCache.has(normalized)) {
                return state.fileKeyCache.get(normalized);
            }

            if (!state.zipEntriesMap) {
                const map = new Map();
                const files = state.zip.files || {};
                for (const k of Object.keys(files)) {
                    map.set(k.replace(/\\/g, '/').toLowerCase(), k);
                }
                state.zipEntriesMap = map;
            }

            let fileKey = state.zipEntriesMap.get(normalized) || null;
            if (!fileKey) {
                fileKey = findZipEntry(state.zip, path);
            }
            state.fileKeyCache.set(normalized, fileKey);
            return fileKey;
        }

        function attachStoryboardVideoElement(
            state,
            blob,
            videoEvent,
            fileKey,
            generation,
            transcoded,
            sourceBlob
        ) {
            const url = URL.createObjectURL(blob);
            const element = document.createElement('video');
            element.muted = true;
            element.playsInline = true;
            element.preload = 'auto';
            element.src = url;

            state.video = {
                element,
                url,
                fileKey,
                offset: Number.isFinite(videoEvent.offset) ? videoEvent.offset : 0,
                duration: 0,
                ready: false,
                failed: false,
                transcoded,
                sourceBlob
            };

            element.addEventListener('loadedmetadata', () => {
                if (generation !== storyboardPlaybackGeneration || storyboardPlaybackState !== state) return;
                state.video.duration = Number.isFinite(element.duration) ? element.duration : 0;
                state.video.ready = true;
                syncStoryboardVideoToTime(audio.currentTime * 1000, isPlaying);
                requestStoryboardRedraw(state);
            });
            element.addEventListener('canplay', () => {
                if (generation !== storyboardPlaybackGeneration || storyboardPlaybackState !== state) return;
                state.video.ready = true;
                requestStoryboardRedraw(state);
            });
            element.addEventListener('seeked', () => {
                if (generation !== storyboardPlaybackGeneration || storyboardPlaybackState !== state) return;
                requestStoryboardRedraw(state);
            });
            element.addEventListener('error', () => {
                if (generation !== storyboardPlaybackGeneration || storyboardPlaybackState !== state) return;
                const current = state.video;
                if (!current || current.transcoded || !current.sourceBlob) {
                    failStoryboardVideo(state, `故事板视频无法解码: ${videoEvent.path}`);
                    return;
                }

                const sourceBlob = current.sourceBlob;
                try {
                    current.element.pause();
                    current.element.removeAttribute('src');
                    current.element.load();
                } catch (_) {}
                revokeStoryboardUrl(current.url);
                state.video = null;
                state.videoLoading = true;
                void transcodeVideoBlobForBrowser(sourceBlob, videoEvent.path)
                    .then(transcodedBlob => {
                        if (generation !== storyboardPlaybackGeneration || storyboardPlaybackState !== state) return;
                        attachStoryboardVideoElement(
                            state,
                            transcodedBlob,
                            videoEvent,
                            fileKey,
                            generation,
                            true,
                            null
                        );
                    })
                    .catch(error => {
                        console.warn('故事板视频转码失败:', videoEvent.path, error);
                        failStoryboardVideo(state, '');
                    })
                    .finally(() => {
                        if (storyboardPlaybackState === state) state.videoLoading = false;
                    });
            });
            element.load();
        }

        async function prepareStoryboardVideo(state, videoEvent, generation) {
            if (!state || state.videoLoading || state.video || state.videoFailed) return;

            const fileKey = getStoryboardFileKey(state, videoEvent.path);
            if (!fileKey) {
                failStoryboardVideo(state, `故事板视频资源不存在: ${videoEvent.path}`);
                return;
            }

            state.videoLoading = true;
            try {
                const sourceBlob = await state.zip.file(fileKey).async('blob');
                if (generation !== storyboardPlaybackGeneration || storyboardPlaybackState !== state) return;

                if (canAttemptStoryboardVideo(videoEvent.path)) {
                    attachStoryboardVideoElement(
                        state,
                        sourceBlob,
                        videoEvent,
                        fileKey,
                        generation,
                        false,
                        sourceBlob
                    );
                    return;
                }

                const transcodedBlob = await transcodeVideoBlobForBrowser(sourceBlob, videoEvent.path);
                if (generation !== storyboardPlaybackGeneration || storyboardPlaybackState !== state) return;
                attachStoryboardVideoElement(
                    state,
                    transcodedBlob,
                    videoEvent,
                    fileKey,
                    generation,
                    true,
                    null
                );
            } catch (error) {
                console.warn('故事板视频加载/转码失败:', videoEvent.path, error);
                failStoryboardVideo(state, '');
            } finally {
                if (storyboardPlaybackState === state) state.videoLoading = false;
            }
        }

        function ensureStoryboardVideoLoaded(state = storyboardPlaybackState, force = false) {
            if (!state || !state.storyboard || !state.storyboard.video) return;
            if (typeof enableVideo !== 'undefined' && !enableVideo) return;
            if (state.video || state.videoLoading || state.videoFailed) return;
            if (!force && !isPlaying && !(typeof isSeeking !== 'undefined' && isSeeking)) return;
            void prepareStoryboardVideo(state, state.storyboard.video, state.generation);
        }

        async function loadStoryboardPlayback(zip, storyboard) {
            disposeStoryboardPlayback();

            const generation = storyboardPlaybackGeneration;
            const state = {
                generation,
                zip,
                storyboard,
                video: null,
                videoLoading: false,
                videoFailed: false,
                videoFailureNotified: false,
                assets: new Map(),
                fileKeyCache: new Map(),
                assetLoadQueue: [],
                activeAssetLoads: 0,
                maxConcurrentAssetLoads: 6,
                maxQueuedAssetLoads: STORYBOARD_MAX_QUEUED_ASSET_LOADS,
                assetCacheBytes: 0,
                maxAssetCacheBytes: STORYBOARD_DEFAULT_ASSET_CACHE_BYTES,
                tintCacheBytes: 0,
                maxTintCacheBytes: STORYBOARD_DEFAULT_TINT_CACHE_BYTES,
                assetFrameSerial: 0,
                redrawPending: false,
                compositeCanvas: null,
                compositeCtx: null,
                compositeDirty: true,
                compositeLastDraw: 0,
                compositeHasContent: false,
                lastVideoCorrectionAt: 0,
                elements: []
            };
            storyboardPlaybackState = state;

            if (!zip || !storyboard || !storyboard.hasContent) return state;

            state.elements = (storyboard.sprites || []).map(sprite => ({
                data: sprite,
                frames: []
            }));
            return state;
        }

        function getStoryboardAsset(state, path) {
            if (!state || !state.zip || !path) return null;
            const fileKey = getStoryboardFileKey(state, path);
            if (!fileKey) return null;

            const cacheKey = fileKey.replace(/\\/g, '/').toLowerCase();
            let asset = state.assets.get(cacheKey);
            if (asset) return asset;

            asset = {
                cacheKey,
                fileKey,
                url: null,
                image: null,
                ready: false,
                loading: false,
                queued: false,
                error: false,
                decodedBytes: 0,
                lastUsedFrame: -1,
                lastUsedTime: 0,
                tintCache: new Map()
            };
            state.assets.set(cacheKey, asset);
            return asset;
        }

        function pumpStoryboardAssetQueue(state) {
            if (!state || storyboardPlaybackState !== state) return;
            while (state.activeAssetLoads < state.maxConcurrentAssetLoads &&
                   state.assetLoadQueue.length > 0) {
                const asset = state.assetLoadQueue.shift();
                asset.queued = false;
                if (!asset || asset.ready || asset.loading || asset.error) continue;

                state.activeAssetLoads++;
                void loadStoryboardAsset(state, asset).finally(() => {
                    if (storyboardPlaybackState !== state) return;
                    state.activeAssetLoads = Math.max(0, state.activeAssetLoads - 1);
                    pumpStoryboardAssetQueue(state);
                });
            }
        }

        function queueStoryboardAssetLoad(state, asset) {
            if (!state || !asset || asset.ready || asset.loading || asset.queued || asset.error) return;
            if (state.assetLoadQueue.length >= state.maxQueuedAssetLoads) return;
            asset.queued = true;
            state.assetLoadQueue.push(asset);
            pumpStoryboardAssetQueue(state);
        }

        async function loadStoryboardAsset(state, asset) {
            if (!state || !asset || asset.loading || asset.ready || asset.error) return;
            asset.loading = true;

            try {
                const blob = await state.zip.file(asset.fileKey).async('blob');
                if (storyboardPlaybackState !== state || state.generation !== storyboardPlaybackGeneration) return;

                asset.url = URL.createObjectURL(blob);
                const image = new Image();
                image.onload = () => {
                    if (storyboardPlaybackState !== state || state.generation !== storyboardPlaybackGeneration) {
                        revokeStoryboardUrl(asset.url);
                        asset.url = null;
                        return;
                    }
                    asset.image = image;
                    asset.ready = true;
                    asset.loading = false;
                    asset.decodedBytes = storyboardImageDecodedBytes(image);
                    state.assetCacheBytes += asset.decodedBytes;
                    revokeStoryboardUrl(asset.url);
                    asset.url = null;
                    pruneStoryboardAssetCache(state);
                    requestStoryboardRedraw(state);
                };
                image.onerror = () => {
                    asset.error = true;
                    asset.loading = false;
                    revokeStoryboardUrl(asset.url);
                    asset.url = null;
                    console.warn('故事板图片加载失败:', asset.fileKey);
                };
                image.src = asset.url;
            } catch (error) {
                asset.error = true;
                asset.loading = false;
                console.warn('故事板图片读取失败:', asset.fileKey, error);
            }
        }

        function getStoryboardImage(state, path, timeMs = 0) {
            const asset = getStoryboardAsset(state, path);
            if (!asset) return null;
            if (!asset.ready && !asset.loading && !asset.error) {
                queueStoryboardAssetLoad(state, asset);
            }
            return asset.ready ? asset.image : null;
        }

        function syncStoryboardVideoToTime(timeMs, playing) {
            const state = storyboardPlaybackState;
            if (!state || !state.storyboard || !state.storyboard.video || state.videoFailed) return;
            if (typeof enableVideo !== 'undefined' && !enableVideo) {
                if (state.video && state.video.element && !state.video.element.paused) {
                    try { state.video.element.pause(); } catch (_) {}
                }
                return;
            }
            if (!state.video) {
                ensureStoryboardVideoLoaded(state);
                return;
            }
            if (state.video.failed) return;

            const video = state.video.element;
            const target = Math.max(0, (timeMs - state.video.offset) / 1000);
            const duration = state.video.duration || (Number.isFinite(video.duration) ? video.duration : 0);
            if (duration > 0 && target > duration) {
                try { video.pause(); } catch (_) {}
                return;
            }

            if (playing) {
                if (!state.video.ready) return;
                const drift = Math.abs(video.currentTime - target);
                const now = performance.now();
                const forceCorrection = typeof isSeeking !== 'undefined' && isSeeking;
                if (drift > 0.35 && (forceCorrection || now - state.lastVideoCorrectionAt > 1000)) {
                    try { video.currentTime = target; } catch (_) {}
                    state.lastVideoCorrectionAt = now;
                }
                if (video.paused) {
                    const playResult = video.play();
                    if (playResult && typeof playResult.catch === 'function') {
                        playResult.catch(() => {});
                    }
                }
            } else {
                if (!video.paused) {
                    try { video.pause(); } catch (_) {}
                }
                if (state.video.ready && Math.abs(video.currentTime - target) > 0.03) {
                    try { video.currentTime = target; } catch (_) {}
                }
            }
        }

        function drawStoryboardVideo(ctx, timeMs, width, height) {
            if (typeof enableVideo !== 'undefined' && !enableVideo) return false;
            const state = storyboardPlaybackState;
            if (!state || !state.storyboard || !state.storyboard.video || state.videoFailed) return false;
            if (!state.video) return false;
            if (state.video.failed) return false;

            const video = state.video.element;
            const localTime = timeMs - state.video.offset;
            if (localTime < 0 || video.readyState < 2) return false;

            const duration = state.video.duration || (Number.isFinite(video.duration) ? video.duration : 0);
            if (duration > 0 && localTime / 1000 > duration + 0.05) return false;

            drawCoverImage(ctx, video, width, height);
            return true;
        }

        function resumeStoryboardPlayback() {
            if (storyboardPlaybackState) {
                ensureStoryboardVideoLoaded(storyboardPlaybackState, true);
                syncStoryboardVideoToTime(audio.currentTime * 1000, true);
            }
        }

        function pauseStoryboardPlayback() {
            if (storyboardPlaybackState) {
                syncStoryboardVideoToTime(audio.currentTime * 1000, false);
            }
        }

        function resetStoryboardPlayback() {
            const state = storyboardPlaybackState;
            if (!state || !state.video) return;
            try {
                state.video.element.pause();
                state.video.element.currentTime = 0;
            } catch (_) {}
        }
