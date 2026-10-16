// ============================================================================
// texture-image-editor-frame-edit.js - 编辑帧构建、预览帧与等比拉伸修复
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function getCurrentEditParams() {
            return {
                cropX: -parseIntegerInput('textureImageCropX', '左边界', -MAX_TEXTURE_DIMENSION),
                cropY: -parseIntegerInput('textureImageCropY', '上边界', -MAX_TEXTURE_DIMENSION),
                widthDelta: parseIntegerInput('textureImageCropWidth', '宽度变化'),
                heightDelta: parseIntegerInput('textureImageCropHeight', '高度变化'),
                imageTransform: cloneImageTransform(state.imageTransform)
            };
        }

        function buildEditedFrames(sourceFrames, params) {
            if (!sourceFrames || sourceFrames.length === 0 || !params) return null;
            const baseFrame = sourceFrames[0];
            const cropX = Number(params.cropX) || 0;
            const cropY = Number(params.cropY) || 0;
            const cropWidth = baseFrame.width + (Number(params.widthDelta) || 0);
            const cropHeight = baseFrame.height + (Number(params.heightDelta) || 0);
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
            return result.frames;
        }

        function updateStretchFixUI() {
            const button = byId('textureImageStretchFixBtn');
            const targetEl = byId('textureImageStretchTarget');
            if (!button || !targetEl) return;

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
                targetEl.textContent = '当前贴图尺寸无效，无法计算修复结果。';
                return;
            }

            const currentAxisSize = target.axis === 'width' ? frame.width : frame.height;
            const alreadyFixed = Math.abs(currentAxisSize - target.size) <= 0.5;
            button.disabled = alreadyFixed;
            button.title = target.detail;
            targetEl.classList.add('is-ready');
            targetEl.textContent = alreadyFixed
                ? `当前 ${frame.width} × ${frame.height}px 已符合${target.label}目标。`
                : `${target.label} ${target.size}px：${frame.width} × ${frame.height}px → ${result.width} × ${result.height}px。${target.detail}`;
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
                const sourceFrames = buildPreviewFrames();
                const target = getStretchFixTarget(state.selected, sourceFrames[0]);
                if (!target || !target.axis) {
                    state.editorHistoryTransaction = null;
                    updateEditorHistoryButtons();
                    showToast('无需修复', target && target.reason ? target.reason : '当前贴图没有可修复的单轴拉伸。');
                    return;
                }

                const before = sourceFrames[0];
                state.workingFrames = resizeFramesUniform(sourceFrames, target);
                state.previewFrames = state.workingFrames.map(cloneFrame);
                resetTransformInputs();
                installFramesToStores(state.previewFrames, state.selected, { persist: false });
                updateMeta();
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
