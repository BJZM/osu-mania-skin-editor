// ============================================================================
// texture-control-thumbnails.js - 贴图缩略图与动画播放
// 从 texture-controls.js 按职责拆分。
// ============================================================================

        function drawThumbFrameToCanvas(canvas, imgObj, targetW, targetH) {
            const c = canvas.getContext('2d');
            if (!c || !imgObj) return;
            c.clearRect(0, 0, targetW, targetH);
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = 'high';
            const w = imgObj.naturalWidth || imgObj.videoWidth || imgObj.width || 0;
            const h = imgObj.naturalHeight || imgObj.videoHeight || imgObj.height || 0;
            if (w <= 0 || h <= 0) return;
            const scale = Math.min(targetW / w, targetH / h);
            const dw = Math.max(1, Math.round(w * scale));
            const dh = Math.max(1, Math.round(h * scale));
            c.drawImage(imgObj, Math.round((targetW - dw) / 2), Math.round((targetH - dh) / 2), dw, dh);
        }

        // 按键发光 (StageLight) 缩略图专用：底边对齐 + 纵向缩放 + 淡出，
        // 复刻 osu!lazer 里写死的按下(立即) / 松开(250ms 收缩淡出) 动画。

        function drawStageLightPreviewFrame(canvas, imgObj, targetW, targetH, scaleY, alpha) {
            const c = canvas.getContext('2d');
            if (!c || !imgObj) return;
            c.clearRect(0, 0, targetW, targetH);
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = 'high';
            const w = imgObj.naturalWidth || imgObj.videoWidth || imgObj.width || 0;
            const h = imgObj.naturalHeight || imgObj.videoHeight || imgObj.height || 0;
            if (w <= 0 || h <= 0) return;
            const scale = Math.min(targetW / w, targetH / h);
            const dw = Math.max(1, Math.round(w * scale));
            const fullH = Math.max(1, Math.round(h * scale));
            const dh = Math.max(1, Math.round(fullH * Math.max(0, Math.min(1, scaleY))));
            const x = Math.round((targetW - dw) / 2);
            const y = Math.max(0, Math.round(targetH - dh)); // Origin = BottomCentre：底边固定
            c.globalAlpha = Math.max(0, Math.min(1, alpha));
            c.drawImage(imgObj, x, y, dw, dh);
            c.globalAlpha = 1;
        }

        function pumpAnimatedThumbnails() {
            const now = performance.now();
            for (let i = animatedThumbnails.length - 1; i >= 0; i--) {
                const it = animatedThumbnails[i];
                if (!it.canvas.isConnected) { animatedThumbnails.splice(i, 1); continue; }

                // 按键发光缩略图：循环「出现 → 保持 → 250ms 收缩淡出」（引擎写死的固定动画）
                if (it.mode === 'stagelight') {
                    if (it.frames.length > 1 && now >= it.nextDue) {
                        it.nextDue = now + it.frameMs;
                        it.idx = (it.idx + 1) % it.frames.length;
                    }
                    const cycle = STAGE_LIGHT_PREVIEW_HOLD_MS + STAGE_LIGHT_FADE_DURATION_MS;
                    const t = (now - it.start) % cycle;
                    let scaleY = 1;
                    let alpha = 1;
                    if (t >= STAGE_LIGHT_PREVIEW_HOLD_MS) {
                        const p = (t - STAGE_LIGHT_PREVIEW_HOLD_MS) / STAGE_LIGHT_FADE_DURATION_MS;
                        scaleY = Math.max(0, 1 - p);
                        alpha = Math.max(0, 1 - p);
                    }
                    drawStageLightPreviewFrame(it.canvas, it.frames[it.idx], it.targetW, it.targetH, scaleY, alpha);
                    continue;
                }

                if (now < it.nextDue) continue;
                it.nextDue = now + it.frameMs;
                it.idx = (it.idx + 1) % it.frames.length;
                drawThumbFrameToCanvas(it.canvas, it.frames[it.idx], it.targetW, it.targetH);
            }
            if (animatedThumbnails.length === 0 && animatedThumbTimer) {
                clearInterval(animatedThumbTimer);
                animatedThumbTimer = null;
            }
        }

        function registerAnimatedThumbnail(canvas, frames, targetW, targetH, opts) {
            animatedThumbnails.push({
                canvas, frames, idx: 0,
                mode: (opts && opts.mode) || 'frames',
                start: performance.now(),
                // 一轮播放控制在 0.4~0.8s 之间：明显是动画，又不会闪得刺眼
                frameMs: Math.max(45, Math.min(160, Math.round(800 / frames.length))),
                nextDue: performance.now() + 300,
                targetW, targetH
            });
            if (!animatedThumbTimer) animatedThumbTimer = setInterval(pumpAnimatedThumbnails, 60);
        }

        function renderTextureThumbnail(container, imgObj, fallbackText = '未配置', targetW = 44, targetH = 32, frames = null, badgeHost = null, opts = null) {
            if (!container) return;
            container.innerHTML = '';
            if (!imgObj) {
                container.innerHTML = `<span class="no-img">${fallbackText}</span>`;
                return;
            }

            const w = imgObj.naturalWidth || imgObj.videoWidth || imgObj.width || 0;
            const h = imgObj.naturalHeight || imgObj.videoHeight || imgObj.height || 0;

            if (imgObj._isBlankPlaceholder) {
                container.innerHTML = '<span class="hud-glyph-placeholder" style="font-size:0.65rem; color:rgba(255,255,255,0.45); font-weight:500;">透明</span>';
                return;
            }

            if (w <= 0 || h <= 0) {
                container.innerHTML = `<span class="no-img">${fallbackText}</span>`;
                return;
            }

            if (w <= 1 && h <= 1) {
                container.innerHTML = '<span class="hud-glyph-placeholder" style="font-size:0.65rem; color:rgba(255,255,255,0.45); font-weight:500;">透明</span>';
                return;
            }

            // 整体全透明的贴图 → 同样标注「透明」，而不是显示一个空白框
            if (isFullyTransparentImage(imgObj, targetW, targetH)) {
                container.innerHTML = '<span class="hud-glyph-placeholder" style="font-size:0.65rem; color:rgba(255,255,255,0.45); font-weight:500;" title="该贴图整体全透明（皮肤作者用透明 PNG 隐藏了此元素）">透明</span>';
                return;
            }

            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = targetW;
            thumbCanvas.height = targetH;

            // 多帧贴图 → 缩略图逐帧循环播放；单帧 → 静态绘制
            const animFrames = (frames && frames.length > 1) ? frames : null;

            // 规格角标 (1x / @2x) 的落点：优先用调用方指定的 badgeHost（缩略图右侧的容器），
            // 其次若缩略图外层就是 .texture-preview-wrap 也放进去，否则退回贴在缩略图内部角落。
            const badgeTarget = badgeHost
                || ((container.parentElement && container.parentElement.classList.contains('texture-preview-wrap'))
                    ? container.parentElement : container);
            // 清掉上一次渲染残留的角标（缩略图容器已被 innerHTML 清空，外层容器需要手动清）
            if (badgeTarget !== container) {
                badgeTarget.querySelectorAll('.thumb-badge').forEach(el => el.remove());
            }

            try {
                if (opts && opts.stageLightPreview) {
                    // 按键发光：缩略图循环播放引擎写死的「按下 → 保持 → 250ms 收缩淡出」动画，
                    // 即使是单帧贴图也能直观看到按下 / 松开的动态效果。
                    const list = (frames && frames.length > 0) ? frames : [imgObj];
                    drawStageLightPreviewFrame(thumbCanvas, list[0], targetW, targetH, 1, 1);
                    registerAnimatedThumbnail(thumbCanvas, list, targetW, targetH, { mode: 'stagelight' });
                } else if (animFrames) {
                    drawThumbFrameToCanvas(thumbCanvas, animFrames[0], targetW, targetH);
                    registerAnimatedThumbnail(thumbCanvas, animFrames, targetW, targetH);
                } else {
                    drawThumbFrameToCanvas(thumbCanvas, imgObj, targetW, targetH);
                }
                container.appendChild(thumbCanvas);
                // 贴图规格角标：1x 与 @2x 使用**同一种**低调样式，且默认放在缩略图右侧、绝不遮挡缩略图。
                // 注：动态贴图不再额外标注帧数（帧数信息由缩略图本身的逐帧播放体现）。
                const is2x = !!imgObj._is2x;
                const badge = document.createElement('span');
                badge.className = 'thumb-badge badge-spec';
                badge.textContent = is2x ? '@2x' : '1x';
                badge.title = is2x ? '当前为 @2x 高清贴图 (在480p画布中以 0.5x 尺寸抗锯齿渲染)' : '当前为普通贴图 (以 1x 原始像素映射渲染)';
                badgeTarget.appendChild(badge);
            } catch (err) {
                console.warn('绘制缩略图失败:', err);
                container.innerHTML = `<span class="no-img">${fallbackText}</span>`;
            }
        }
