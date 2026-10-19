// ============================================================================
// texture-image-editor-longbody-compose.js - 长条身体合成、进度提示与异步构建
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function getLongBodyTailDisplayHeight(tailFrame, targetWidth, fade) {
            if (!tailFrame || tailFrame._isBlankPlaceholder) return 0;
            const naturalHeight = Math.max(1, Math.round(tailFrame.height * targetWidth / Math.max(1, tailFrame.width)));
            return naturalHeight;
        }

        function drawTailForLongBody(ctx, tailFrame, targetWidth, offsetY = 0) {
            if (!tailFrame || tailFrame._isBlankPlaceholder) return;
            const scaledHeight = getLongBodyTailDisplayHeight(tailFrame, targetWidth);
            const tailCanvas = document.createElement('canvas');
            tailCanvas.width = targetWidth;
            tailCanvas.height = scaledHeight;
            const tailCtx = tailCanvas.getContext('2d');
            tailCtx.imageSmoothingEnabled = true;
            tailCtx.imageSmoothingQuality = 'high';
            tailCtx.save();
            tailCtx.translate(0, scaledHeight);
            tailCtx.scale(1, -1);
            tailCtx.drawImage(tailFrame, 0, 0, targetWidth, scaledHeight);
            tailCtx.restore();
            ctx.drawImage(tailCanvas, 0, offsetY);
        }

        function applyLongBodyOverallFade(
            ctx,
            width,
            outputHeight,
            tailTop,
            fade,
            tailFrame = state.longBodyComposer.tailFrame
        ) {
            if (!(fade > 0) || tailTop >= outputHeight) return;
            const fadeRatio = Math.max(0, Math.min(1, fade / LONG_BODY_FADE_MAX));
            const tailHeight = getLongBodyTailDisplayHeight(
                tailFrame,
                width
            );
            const maxFadeRange = Math.max(1, Math.max(200, tailHeight * 3));
            const fadeRange = Math.max(1, maxFadeRange * fadeRatio);
            const gradient = ctx.createLinearGradient(0, tailTop, 0, tailTop + fadeRange);
            gradient.addColorStop(0, `rgba(255,255,255,${Math.max(0, 1 - fadeRatio)})`);
            gradient.addColorStop(1, 'rgba(255,255,255,1)');
            ctx.save();
            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = gradient;
            // 渐变结束后保持 alpha=1，因此更下方的身体不会被一起淡化。
            ctx.fillRect(0, tailTop, width, Math.max(0, outputHeight - tailTop));
            ctx.restore();
        }

        function getLongBodyBaseContentBounds(baseFrame) {
            if (!baseFrame || !(baseFrame.width > 0) || !(baseFrame.height > 0)) {
                return { left: 0, right: 0, width: 0, center: 0 };
            }
            if (baseFrame._contentBoundsCache) {
                return baseFrame._contentBoundsCache;
            }
            const width = baseFrame.width;
            const height = baseFrame.height;
            let minX = Infinity;
            let maxX = -1;
            try {
                let ctx = null;
                if (typeof baseFrame.getContext === 'function') {
                    ctx = baseFrame.getContext('2d');
                } else {
                    const temp = document.createElement('canvas');
                    temp.width = width;
                    temp.height = height;
                    const tCtx = temp.getContext('2d');
                    tCtx.drawImage(baseFrame, 0, 0);
                    ctx = tCtx;
                }
                if (ctx) {
                    const data = ctx.getImageData(0, 0, width, height).data;
                    for (let y = 0; y < height; y++) {
                        const row = y * width * 4;
                        for (let x = 0; x < width; x++) {
                            if (data[row + x * 4 + 3] > 0) {
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                            }
                        }
                    }
                }
            } catch (e) {
                // Ignore fallback to full width
            }
            const bounds = (maxX >= minX && minX !== Infinity)
                ? {
                    left: minX,
                    right: maxX + 1,
                    width: maxX + 1 - minX,
                    center: (minX + maxX + 1) / 2
                }
                : {
                    left: 0,
                    right: width,
                    width,
                    center: width / 2
                };
            baseFrame._contentBoundsCache = bounds;
            return bounds;
        }

        function getLongBodyDefaultPresetHeight(baseFrame) {
            const bounds = getLongBodyBaseContentBounds(baseFrame);
            return Math.max(2, Math.round(bounds.width / 2));
        }

        function applyLongBodyTailPreset(
            ctx,
            width,
            outputHeight,
            tailTop,
            preset,
            presetHeight,
            baseBounds
        ) {
            if (!preset || preset === 'none' || tailTop >= outputHeight) return;
            const contentLeft = baseBounds ? baseBounds.left : 0;
            const contentRight = baseBounds ? baseBounds.right : width;
            const contentWidth = Math.max(2, contentRight - contentLeft);
            const centerX = baseBounds ? baseBounds.center : (width / 2);

            const h = Math.max(2, Math.min(outputHeight - tailTop, Math.round(presetHeight || (contentWidth / 2))));
            if (h <= 0) return;

            const useOffscreenCanvas = typeof OffscreenCanvas === 'function';
            const mask = useOffscreenCanvas
                ? new OffscreenCanvas(width, h)
                : document.createElement('canvas');
            if (!useOffscreenCanvas) {
                mask.width = width;
                mask.height = h;
            }
            const mCtx = mask.getContext('2d');
            mCtx.imageSmoothingEnabled = true;

            mCtx.fillStyle = '#ffffff';
            mCtx.beginPath();
            if (preset === 'sharp') {
                mCtx.moveTo(contentLeft, h);
                mCtx.lineTo(centerX, 0);
                mCtx.lineTo(contentRight, h);
                mCtx.closePath();
                mCtx.fill();
            } else if (preset === 'round') {
                const rx = contentWidth / 2;
                const ry = h;
                mCtx.ellipse(centerX, h, rx, ry, 0, Math.PI, 0, false);
                mCtx.lineTo(contentRight, h);
                mCtx.lineTo(contentLeft, h);
                mCtx.closePath();
                mCtx.fill();
            } else {
                return;
            }

            mCtx.globalCompositeOperation = 'source-out';
            mCtx.fillStyle = '#ffffff';
            mCtx.fillRect(0, 0, width, h);

            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.drawImage(mask, 0, tailTop);
            ctx.restore();
        }

        function buildLongBodyComposite(maxHeight = null) {
            const composer = state.longBodyComposer;
            if (!composer.active || !state.selected || composer.baseFrames.length === 0) return null;
            const base = composer.baseFrames[0];
            composer.targetHeight = Math.max(1, Math.min(MAX_TEXTURE_DIMENSION, Math.round(composer.targetHeight || LONG_BODY_DEFAULT_HEIGHT)));
            composer.coverage = Math.max(0, Math.min(composer.targetHeight, Math.round(composer.coverage || 0)));
            composer.fade = Math.max(0, Math.min(LONG_BODY_FADE_MAX, Number(composer.fade) || 0));
            const outputHeight = Math.max(1, Math.min(
                composer.targetHeight,
                Math.round(Number(maxHeight) || composer.targetHeight)
            ));

            const output = document.createElement('canvas');
            output.width = base.width;
            output.height = outputHeight;
            output._is2x = !!base._is2x;
            const ctx = output.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            for (let y = 0; y < outputHeight; y += base.height) {
                ctx.drawImage(base, 0, y, base.width, base.height);
            }
            const hiddenHeight = Math.min(outputHeight, composer.coverage);
            if (hiddenHeight > 0) {
                ctx.clearRect(0, 0, base.width, hiddenHeight);
            }
            const isTailTransparent = !composer.tailFrame ||
                !!composer.tailFrame._isBlankPlaceholder ||
                (typeof isFullyTransparentImage === 'function' && isFullyTransparentImage(composer.tailFrame, 48, 36));
            if (isTailTransparent && composer.tailPreset && composer.tailPreset !== 'none') {
                const baseBounds = getLongBodyBaseContentBounds(base);
                applyLongBodyTailPreset(
                    ctx,
                    base.width,
                    outputHeight,
                    composer.coverage,
                    composer.tailPreset,
                    composer.presetHeight,
                    baseBounds
                );
            } else {
                drawTailForLongBody(ctx, composer.tailFrame, base.width, composer.coverage);
            }
            applyLongBodyOverallFade(
                ctx,
                base.width,
                outputHeight,
                composer.coverage,
                composer.fade
            );
            return output;
        }

        function waitForUiPaint() {
            return new Promise((resolve) => {
                requestAnimationFrame(resolve);
            });
        }

        function setLongBodyProgress(label, value, indeterminate = false) {
            const wrap = byId('textureImageLongBodyProgress');
            const labelEl = byId('textureImageLongBodyProgressLabel');
            const valueEl = byId('textureImageLongBodyProgressValue');
            const bar = byId('textureImageLongBodyProgressBar');
            if (!wrap) return;
            wrap.style.display = 'block';
            wrap.classList.toggle('is-indeterminate', !!indeterminate);
            if (labelEl) labelEl.textContent = label;
            if (valueEl) valueEl.textContent = indeterminate ? '' : `${Math.round(value)}%`;
            if (bar && !indeterminate) bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
        }

        function hideLongBodyProgress() {
            const wrap = byId('textureImageLongBodyProgress');
            const bar = byId('textureImageLongBodyProgressBar');
            if (wrap) {
                wrap.style.display = 'none';
                wrap.classList.remove('is-indeterminate');
            }
            if (bar) bar.style.width = '0%';
        }

        function requestUnsavedDecision(options = {}) {
            const modal = byId('textureImageUnsavedModal');
            if (!modal) return Promise.resolve(options.count > 1 ? 'save' : 'discard');
            const titleEl = byId('textureImageUnsavedTitle');
            const textEl = byId('textureImageUnsavedText');
            const saveBtn = byId('textureImageUnsavedSaveBtn');
            const discardBtn = byId('textureImageUnsavedDiscardBtn');
            const cancelBtn = byId('textureImageUnsavedCancelBtn');
            const backdrop = byId('textureImageUnsavedBackdrop');

            if (titleEl) titleEl.textContent = '保存未提交的编辑？';
            if (textEl) {
                textEl.textContent = options.count > 1
                    ? `有 ${options.count} 个贴图标签包含未保存的编辑。`
                    : `“${options.title || '当前贴图'}”有未保存的编辑。`;
            }
            if (saveBtn) saveBtn.textContent = options.count > 1 ? '保存全部' : '保存';

            return new Promise((resolve) => {
                const finish = (decision) => {
                    modal.style.display = 'none';
                    if (saveBtn) saveBtn.onclick = null;
                    if (discardBtn) discardBtn.onclick = null;
                    if (cancelBtn) cancelBtn.onclick = null;
                    if (backdrop) backdrop.onclick = null;
                    window.removeEventListener('keydown', onKeyDown, true);
                    resolve(decision);
                };
                const onKeyDown = (event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    event.stopPropagation();
                    finish('cancel');
                };
                if (saveBtn) saveBtn.onclick = () => finish('save');
                if (discardBtn) discardBtn.onclick = () => finish('discard');
                if (cancelBtn) cancelBtn.onclick = () => finish('cancel');
                if (backdrop) backdrop.onclick = () => finish('cancel');
                window.addEventListener('keydown', onKeyDown, true);
                modal.style.display = 'flex';
            });
        }

        function requestLongBodyApplyScope(options = {}) {
            const modal = byId('textureImageApplyScopeModal');
            if (!modal) return Promise.resolve('current');
            const editorModal = byId('textureImageEditorModal');
            const wasEditorModalHidden = editorModal && (editorModal.style.display === 'none' || !editorModal.classList.contains('active'));
            if (wasEditorModalHidden && modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }
            const title = byId('textureImageApplyScopeTitle');
            const text = byId('textureImageApplyScopeText');
            const currentBtn = byId('textureImageApplyScopeCurrentBtn');
            const allBtn = byId('textureImageApplyScopeAllBtn');
            const cancelBtn = byId('textureImageApplyScopeCancelBtn');
            const backdrop = byId('textureImageApplyScopeBackdrop');
            if (title) title.textContent = options.title || '选择应用范围';
            if (text) {
                text.textContent = options.text ||
                    '完整长条身体要只替换当前轨道，还是同时应用到全部轨道？';
            }
            if (currentBtn) currentBtn.textContent = options.currentLabel || '仅当前轨道';
            if (allBtn) allBtn.textContent = options.allLabel || '应用到全部轨道';
            return new Promise((resolve) => {
                const finish = (scope) => {
                    modal.style.display = 'none';
                    if (currentBtn) currentBtn.onclick = null;
                    if (allBtn) allBtn.onclick = null;
                    if (cancelBtn) cancelBtn.onclick = null;
                    if (backdrop) backdrop.onclick = null;
                    window.removeEventListener('keydown', onKeyDown, true);
                    if (wasEditorModalHidden && editorModal && modal.parentElement === document.body) {
                        editorModal.appendChild(modal);
                    }
                    resolve(scope);
                };
                const onKeyDown = (event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    event.stopPropagation();
                    finish(null);
                };
                if (currentBtn) currentBtn.onclick = () => finish('current');
                if (allBtn) allBtn.onclick = () => finish('all');
                if (cancelBtn) cancelBtn.onclick = () => finish(null);
                if (backdrop) backdrop.onclick = () => finish(null);
                window.addEventListener('keydown', onKeyDown, true);
                modal.style.display = 'flex';
                if (allBtn) allBtn.focus();
            });
        }

        async function buildLongBodyCompositeForSourceAsync(source, maxHeight, onProgress) {
            if (!source || !source.baseFrames || source.baseFrames.length === 0) return null;
            const base = source.baseFrames[0];
            const targetHeight = Math.max(1, Math.min(
                MAX_TEXTURE_DIMENSION,
                Math.round(source.targetHeight || LONG_BODY_DEFAULT_HEIGHT)
            ));
            const coverage = Math.max(0, Math.min(targetHeight, Math.round(source.coverage || 0)));
            const fade = Math.max(0, Math.min(LONG_BODY_FADE_MAX, Number(source.fade) || 0));
            const outputHeight = Math.max(1, Math.min(
                targetHeight,
                Math.round(Number(maxHeight) || targetHeight)
            ));

            const useOffscreenCanvas = typeof OffscreenCanvas === 'function';
            const output = useOffscreenCanvas
                ? new OffscreenCanvas(base.width, outputHeight)
                : document.createElement('canvas');
            if (!useOffscreenCanvas) {
                output.width = base.width;
                output.height = outputHeight;
            }
            output._is2x = !!base._is2x;
            const ctx = output.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const totalTiles = Math.max(1, Math.ceil(outputHeight / base.height));
            let tileIndex = 0;
            for (let y = 0; y < outputHeight; y += base.height) {
                ctx.drawImage(base, 0, y, base.width, base.height);
                tileIndex++;
                if (tileIndex % 24 === 0 || tileIndex === totalTiles) {
                    if (onProgress) onProgress(5 + (tileIndex / totalTiles) * 45);
                    await waitForUiPaint();
                }
            }

            const hiddenHeight = Math.min(outputHeight, coverage);
            if (hiddenHeight > 0) {
                ctx.clearRect(0, 0, base.width, hiddenHeight);
            }
            if (onProgress) onProgress(55);
            await waitForUiPaint();
            const isTailTransparent = !source.tailFrame ||
                !!source.tailFrame._isBlankPlaceholder ||
                (typeof isFullyTransparentImage === 'function' && isFullyTransparentImage(source.tailFrame, 48, 36));
            if (isTailTransparent && source.tailPreset && source.tailPreset !== 'none') {
                const baseBounds = getLongBodyBaseContentBounds(base);
                applyLongBodyTailPreset(
                    ctx,
                    base.width,
                    outputHeight,
                    coverage,
                    source.tailPreset,
                    source.presetHeight,
                    baseBounds
                );
            } else {
                drawTailForLongBody(ctx, source.tailFrame, base.width, coverage);
            }
            applyLongBodyOverallFade(
                ctx,
                base.width,
                outputHeight,
                coverage,
                fade,
                source.tailFrame
            );
            if (onProgress) onProgress(60);
            await waitForUiPaint();
            return output;
        }

        async function buildLongBodyCompositeAsync(maxHeight, onProgress) {
            const composer = state.longBodyComposer;
            if (!composer.active || !state.selected || composer.baseFrames.length === 0) return null;
            return buildLongBodyCompositeForSourceAsync(composer, maxHeight, onProgress);
        }

        function regenerateLongBodyComposite() {
            const composer = state.longBodyComposer;
            const output = buildLongBodyComposite(LONG_BODY_PREVIEW_HEIGHT);
            if (!output) return;

            state.workingFrames = [output];
            state.previewFrames = [output];
            state.cropRect = { x: 0, y: 0, width: output.width, height: output.height };
            updateCropInputs(state.cropRect);
            state.snapGuides = null;
            state.contentBoundsCache = null;
            installFramesToStores(state.previewFrames, state.selected, { persist: false });
            updateMeta();
            updateLongBodyComposerUI();
        }

        function scheduleLongBodyRegenerate() {
            if (state.longBodyRegenerateTimer) clearTimeout(state.longBodyRegenerateTimer);
            state.longBodyRegenerateTimer = setTimeout(() => {
                state.longBodyRegenerateTimer = null;
                regenerateLongBodyComposite();
            }, 100);
        }

        const longBodySourceFrameIds = new WeakMap();
        let nextLongBodySourceFrameId = 1;
