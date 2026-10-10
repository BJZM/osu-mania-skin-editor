// ============================================================================
// storyboard-composite.js - cached rendering for expensive storyboard/video backgrounds
// 依赖：render/storyboard-assets.js、render/storyboard.js、core/state.js
// ============================================================================

        function drawStoryboardBackgroundComposite(ctx, timeMs, width, height) {
            const state = storyboardPlaybackState;
            if (!state || !state.storyboard || !state.storyboard.hasContent) return false;

            const isSbEnabled = (typeof enableStoryboard === 'undefined' || enableStoryboard);
            const isVidEnabled = (typeof enableVideo === 'undefined' || enableVideo);
            if (!isSbEnabled && !isVidEnabled) return false;

            const elementCount = state.elements ? state.elements.length : 0;
            const hasVideo = !!(isVidEnabled && state.storyboard.video && state.storyboard.video.path && !state.videoFailed);
            const shouldCache = hasVideo || (isSbEnabled && elementCount > 400);

            if (!shouldCache) {
                let videoDrawn = false;
                if (hasVideo) {
                    videoDrawn = drawStoryboardVideo(ctx, timeMs, width, height);
                }
                if (isSbEnabled && elementCount > 0) {
                    drawStoryboardFrame(ctx, timeMs, width, height, 3, 0);
                }
                return videoDrawn || (isSbEnabled && elementCount > 0);
            }

            if (!state.compositeCanvas) {
                state.compositeCanvas = document.createElement('canvas');
                state.compositeCtx = state.compositeCanvas.getContext('2d');
                state.compositeDirty = true;
                state.compositeLastDraw = 0;
                state.compositeHasContent = false;
            }

            const compositeCanvas = state.compositeCanvas;
            const compositeCtx = state.compositeCtx;
            if (compositeCanvas.width !== width || compositeCanvas.height !== height) {
                compositeCanvas.width = width;
                compositeCanvas.height = height;
                state.compositeDirty = true;
            }

            const now = performance.now();
            const targetFps = hasVideo ? 30 : 60;
            const interval = 1000 / targetFps;
            const force = !isPlaying || isSeeking || state.compositeDirty;
            if (force || now - state.compositeLastDraw >= interval) {
                compositeCtx.clearRect(0, 0, width, height);
                let videoDrawn = false;
                if (hasVideo) {
                    videoDrawn = drawStoryboardVideo(compositeCtx, timeMs, width, height);
                }
                if (isSbEnabled && elementCount > 0) {
                    drawStoryboardFrame(compositeCtx, timeMs, width, height, 3, 0);
                }
                state.compositeHasContent = videoDrawn || (isSbEnabled && elementCount > 0);
                state.compositeDirty = false;
                state.compositeLastDraw = now;
            }

            if (!state.compositeHasContent) return false;
            ctx.drawImage(compositeCanvas, 0, 0, width, height);
            return true;
        }

        function drawStoryboardForeground(ctx, timeMs, width, height) {
            // 在 osu!mania stable 模式下，所有的故事板层（包括 Foreground）均处于 Mania 轨道舞台与音符下方。
            // 背景合成已完整绘制全部故事板图层并应用统一背景暗化，此处保持无遮挡以防音符与轨道被前景层遮蔽。
            return false;
        }

        function drawStoryboardComposite(ctx, timeMs, width, height) {
            return drawStoryboardBackgroundComposite(ctx, timeMs, width, height);
        }
