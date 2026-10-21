// ============================================================================
// texture-image-editor-frame-edit.js - 编辑帧构建、预览帧与等比拉伸修复
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function getCurrentEditParams() {
            const baseFrame = state.workingFrames[0];
            const hasNewCropInputs = !!(byId('textureImageCropLeft') ||
                byId('textureImageCropRight') ||
                byId('textureImageCropTop') ||
                byId('textureImageCropBottom'));
            if (hasNewCropInputs) {
                const left = parseIntegerInput('textureImageCropLeft', '左边界', -MAX_TEXTURE_DIMENSION);
                const right = parseIntegerInput('textureImageCropRight', '右边界', -MAX_TEXTURE_DIMENSION);
                const top = parseIntegerInput('textureImageCropTop', '上边界', -MAX_TEXTURE_DIMENSION);
                const bottom = parseIntegerInput('textureImageCropBottom', '下边界', -MAX_TEXTURE_DIMENSION);
                const cropRect = getCropRectFromInputValues({
                    left,
                    right,
                    top,
                    bottom,
                    width: null,
                    height: null
                }, baseFrame);
                return {
                    left: -cropRect.x,
                    right: cropRect.x + cropRect.width - baseFrame.width,
                    top: -cropRect.y,
                    bottom: cropRect.y + cropRect.height - baseFrame.height,
                    cropLeft: -cropRect.x,
                    cropRight: cropRect.x + cropRect.width - baseFrame.width,
                    cropTop: -cropRect.y,
                    cropBottom: cropRect.y + cropRect.height - baseFrame.height,
                    cropX: cropRect.x,
                    cropY: cropRect.y,
                    imageTransform: cloneImageTransform(state.imageTransform)
                };
            }
            const widthDelta = parseIntegerInput('textureImageCropWidth', '宽度变化');
            const heightDelta = parseIntegerInput('textureImageCropHeight', '高度变化');
            const cropRect = getCropRectFromInputValues({
                left: null,
                right: null,
                top: null,
                bottom: null,
                width: widthDelta,
                height: heightDelta
            }, baseFrame);
            return {
                cropX: cropRect.x,
                cropY: cropRect.y,
                widthDelta: cropRect.width - baseFrame.width,
                heightDelta: cropRect.height - baseFrame.height,
                imageTransform: cloneImageTransform(state.imageTransform)
            };
        }
        function buildEditedFrames(sourceFrames, params) {
            if (!sourceFrames || sourceFrames.length === 0 || !params) return null;
            const baseFrame = sourceFrames[0];
            let cropX, cropY, cropWidth, cropHeight;
            if (params.left != null || params.right != null || params.top != null || params.bottom != null) {
                const left = Number(params.left) || 0;
                const right = Number(params.right) || 0;
                const top = Number(params.top) || 0;
                const bottom = Number(params.bottom) || 0;
                cropX = -left;
                cropY = -top;
                cropWidth = baseFrame.width + left + right;
                cropHeight = baseFrame.height + top + bottom;
            } else {
                cropX = Number(params.cropX) || 0;
                cropY = Number(params.cropY) || 0;
                cropWidth = baseFrame.width + (Number(params.widthDelta) || 0);
                cropHeight = baseFrame.height + (Number(params.heightDelta) || 0);
            }
            if (cropWidth < 1 || cropHeight < 1) {
                throw new Error('输出宽度和高度必须至少为 1px');
            }
            const cropRect = {
                x: cropX,
                y: cropY,
                width: cropWidth,
                height: cropHeight
            };
            const outputRect = getTransformedOutputRect(
                cropRect,
                params.imageTransform,
                baseFrame
            );
            validateOutputSize(cropWidth, cropHeight);
            validateOutputSize(outputRect.width, outputRect.height);
            const identityTransform = !hasImageTransform(params.imageTransform);
            const scaleX = outputRect.width / cropWidth;
            const scaleY = outputRect.height / cropHeight;
            const drawX = -cropX * scaleX;
            const drawY = -cropY * scaleY;
            const frames = sourceFrames.map((frame) => {
                const output = document.createElement('canvas');
                output.width = outputRect.width;
                output.height = outputRect.height;
                output._is2x = frame._is2x;
                output._isRootLevel = !!frame._isRootLevel;
                output._isTransparent1x1 = !!frame._isTransparent1x1;
                output._isBlankPlaceholder = !!frame._isBlankPlaceholder;
                output._keyImageHeightOffset1x = 0;
                output._keyImageHeightPadding1x = 0;
                const ctx = output.getContext('2d');
                if (identityTransform) {
                    // Keep ordinary crop/extension pixel-exact. This path must not
                    // pass through the scaler, otherwise some browsers slightly
                    // resample even when the destination dimensions are unchanged.
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(frame, drawX, drawY);
                } else {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(
                        frame,
                        drawX,
                        drawY,
                        frame.width * scaleX,
                        frame.height * scaleY
                    );
                }
                return output;
            });
            return { frames, cropRect, outputRect };
        }

        function buildPreviewFrames() {
            if (state.workingFrames.length === 0) return [];
            const params = getCurrentEditParams();
            const result = buildEditedFrames(state.workingFrames, params);
            if (!result) return [];
            state.cropRect = result.cropRect;
            updateCropInputs(state.cropRect);
            return result.frames;
        }

        function updateStretchFixUI() {
            const button = byId('textureImageStretchFixBtn');
            const targetEl = byId('textureImageStretchTarget');
            if (!button || !targetEl) return;
            if (state.longBodyComposer.active) {
                button.disabled = true;
                button.title = LONG_BODY_EDIT_LOCK_MESSAGE;
                targetEl.classList.add('is-idle');
                targetEl.textContent = '如需使用拉伸修复，请先关闭一键投皮。';
                return;
            }

            const frame = state.previewFrames[0] || state.workingFrames[0];
            const target = getStretchFixTarget(state.selected, frame);
            targetEl.classList.remove('is-ready', 'is-idle');

            if (!state.selected || !frame || !target) {
                button.disabled = true;
                button.title = '';
                targetEl.classList.add('is-idle');
                targetEl.textContent = '';
                return;
            }

            if (!target.axis) {
                button.disabled = true;
                button.title = target.reason;
                targetEl.classList.add('is-idle');
                targetEl.textContent = target.reason;
                return;
            }

            const result = getUniformResizeResult(frame, target);
            if (!result) {
                button.disabled = true;
                button.title = '';
                targetEl.classList.add('is-idle');
                targetEl.textContent = window.I18n.t('当前贴图尺寸无效，无法计算修复结果。');
                return;
            }

            const currentAxisSize = target.axis === 'width' ? frame.width : frame.height;
            const alreadyFixed = Math.abs(currentAxisSize - target.size) <= 0.5;
            const targetLabel = window.I18n.t(target.label);
            const targetDetail = window.I18n.t(target.detail);
            button.disabled = alreadyFixed;
            button.title = targetDetail;
            targetEl.classList.add('is-ready');
            targetEl.textContent = alreadyFixed
                ? window.I18n.t('当前 {size} 已符合{label}目标。', {
                    size: `${frame.width} × ${frame.height}px`,
                    label: targetLabel
                })
                : window.I18n.t('{label} {target}px：{before} → {after}。{detail}', {
                    label: targetLabel,
                    target: target.size,
                    before: `${frame.width} × ${frame.height}px`,
                    after: `${result.width} × ${result.height}px`,
                    detail: targetDetail
                });
        }

        function resizeFramesUniform(frames, target) {
            return frames.map((frame) => {
                const result = getUniformResizeResult(frame, target);
                if (!result) throw new Error('无法计算拉伸修复后的尺寸');
                validateOutputSize(result.width, result.height);

                const resized = document.createElement('canvas');
                resized.width = result.width;
                resized.height = result.height;
                resized._is2x = frame._is2x;
                resized._isRootLevel = !!frame._isRootLevel;
                resized._isTransparent1x1 = !!frame._isTransparent1x1;
                resized._isBlankPlaceholder = !!frame._isBlankPlaceholder;
                const resizedCtx = resized.getContext('2d');
                resizedCtx.imageSmoothingEnabled = true;
                resizedCtx.imageSmoothingQuality = 'high';
                resizedCtx.drawImage(frame, 0, 0, result.width, result.height);
                return resized;
            });
        }

        function applyStretchFix() {
            if (!state.selected) return;
            try {
                commitEditorHistory();
                beginEditorHistory('拉伸修复', { group: 'stretch-fix' });
                if (!state.cropRect) {
                    buildPreviewFrames();
                }
                const currentPreview = state.previewFrames[0] || (buildPreviewFrames()[0] || state.workingFrames[0]);
                if (!currentPreview) return;
                const target = getStretchFixTarget(state.selected, currentPreview);
                if (!target || !target.axis) {
                    state.editorHistoryTransaction = null;
                    updateEditorHistoryButtons();
                    showToast('无需修复', target && target.reason ? target.reason : '当前贴图没有可修复的单轴拉伸。');
                    return;
                }

                const currentAxisSize = target.axis === 'width' ? currentPreview.width : currentPreview.height;
                if (Math.abs(currentAxisSize - target.size) <= 0.5) {
                    state.editorHistoryTransaction = null;
                    updateEditorHistoryButtons();
                    showToast('无需修复', window.I18n.t('当前尺寸已符合{label}目标。', {
                        label: window.I18n.t(target.label)
                    }));
                    return;
                }

                const before = currentPreview;
                const baseCropDim = target.axis === 'width'
                    ? ((state.cropRect && state.cropRect.width) || currentPreview.width)
                    : ((state.cropRect && state.cropRect.height) || currentPreview.height);
                const nextScale = (target.size / Math.max(1, baseCropDim)) * 100;
                const nextTransform = {
                    ...cloneImageTransform(state.imageTransform),
                    scalePercent: nextScale,
                    stretchX: 0,
                    stretchY: 0
                };
                setImageTransform(nextTransform, { centerAnchor: true, refresh: false });
                updateImageTransformInputs();
                refreshLivePreview();
                updateStretchFixUI();
                commitEditorHistory();
                const after = state.previewFrames[0];
                showToast(
                    '拉伸修复完成',
                    `${before.width} × ${before.height}px 已等比缩放为 ${after.width} × ${after.height}px`
                );
            } catch (err) {
                console.error('拉伸修复失败', err);
                showToast('拉伸修复失败', err.message || '无法处理当前贴图');
            }
        }
