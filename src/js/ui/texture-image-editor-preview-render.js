// ============================================================================
// texture-image-editor-preview-render.js - 贴图预览画布与贴图选择器渲染
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function setViews(showPicker) {
            const picker = byId('textureImagePickerView');
            const editor = byId('textureImageEditorView');
            if (picker) picker.style.display = showPicker ? 'flex' : 'none';
            if (editor) editor.style.display = showPicker ? 'none' : 'flex';
        }

        function updateSelectionSummary() {
            const applyBtn = byId('textureImageApplyBtn');
            const resetBtn = byId('textureImageResetBtn');
            const blankBtn = byId('textureImageBlankBtn');
            if (!state.selected) {
                if (applyBtn) applyBtn.disabled = true;
                if (resetBtn) resetBtn.disabled = true;
                if (blankBtn) blankBtn.disabled = true;
                return;
            }

            if (applyBtn) applyBtn.disabled = false;
            if (resetBtn) resetBtn.disabled = false;
            if (blankBtn) blankBtn.disabled = false;
        }

        function resetTransformInputs() {
            const frame = state.workingFrames[0];
            if (!frame) return;
            state.cropRect = {
                x: 0,
                y: 0,
                width: frame.width,
                height: frame.height
            };
            state.imageTransform = createDefaultImageTransform();
            updateCropInputs(state.cropRect);
            updateImageTransformInputs();
            state.previewBaseViewport = null;
            state.previewViewport = null;
            state.snapGuides = null;
        }

        function calculatePreviewViewport(frame) {
            const canvas = byId('textureImagePreviewCanvas');
            if (!canvas || !frame) return null;
            if (state.longBodyComposer.active) {
                const scale = Math.min((canvas.width - 40) / frame.width, 2.5);
                return {
                    scale,
                    offsetX: (canvas.width - frame.width * scale) / 2,
                    offsetY: getLongBodyCenteredOffsetY(canvas, frame, scale)
                };
            }
            const margin = Math.max(12, Math.round(Math.max(frame.width, frame.height) * 0.08));
            const workspace = {
                x: -margin,
                y: -margin,
                width: frame.width + margin * 2,
                height: frame.height + margin * 2
            };
            const scale = Math.min(
                (canvas.width - 20) / workspace.width,
                (canvas.height - 20) / workspace.height,
                4
            );
            return {
                scale,
                offsetX: (canvas.width - workspace.width * scale) / 2 - workspace.x * scale,
                offsetY: (canvas.height - workspace.height * scale) / 2 - workspace.y * scale
            };
        }

        function drawPreviewTransparencyBackground(ctx, left, top, width, height) {
            const right = left + width;
            const bottom = top + height;
            const visibleLeft = Math.max(0, Math.floor(left));
            const visibleTop = Math.max(0, Math.floor(top));
            const visibleRight = Math.min(ctx.canvas.width, Math.ceil(right));
            const visibleBottom = Math.min(ctx.canvas.height, Math.ceil(bottom));
            if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return;

            const tileSize = 9;
            const originX = Math.floor(left / tileSize) * tileSize;
            const originY = Math.floor(top / tileSize) * tileSize;
            const startColumn = Math.floor((visibleLeft - originX) / tileSize);
            const endColumn = Math.ceil((visibleRight - originX) / tileSize);
            const startRow = Math.floor((visibleTop - originY) / tileSize);
            const endRow = Math.ceil((visibleBottom - originY) / tileSize);

            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, width, height);
            ctx.clip();
            for (let row = startRow; row < endRow; row++) {
                const tileTop = originY + row * tileSize;
                const fillTop = Math.max(visibleTop, tileTop);
                const fillBottom = Math.min(visibleBottom, tileTop + tileSize);
                if (fillBottom <= fillTop) continue;
                for (let column = startColumn; column < endColumn; column++) {
                    const tileLeft = originX + column * tileSize;
                    const fillLeft = Math.max(visibleLeft, tileLeft);
                    const fillRight = Math.min(visibleRight, tileLeft + tileSize);
                    if (fillRight <= fillLeft) continue;
                    ctx.fillStyle = (row + column) % 2 === 0 ? '#1c1a20' : '#0e0d13';
                    ctx.fillRect(fillLeft, fillTop, fillRight - fillLeft, fillBottom - fillTop);
                }
            }
            ctx.restore();
        }

        function fillPreviewOutsideBounds(ctx, left, top, right, bottom) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, ctx.canvas.width, Math.max(0, top));
            ctx.fillRect(0, bottom, ctx.canvas.width, Math.max(0, ctx.canvas.height - bottom));
            ctx.fillRect(0, Math.max(0, top), Math.max(0, left), Math.max(0, bottom - top));
            ctx.fillRect(right, Math.max(0, top), Math.max(0, ctx.canvas.width - right), Math.max(0, bottom - top));
        }

        function renderPreview() {
            const canvas = byId('textureImagePreviewCanvas');
            const frame = state.workingFrames[0];
            const cropRect = state.cropRect;
            if (!canvas || !frame || !cropRect) return;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (!state.previewBaseViewport) {
                state.previewBaseViewport = calculatePreviewViewport(frame);
            }
            if (!state.previewViewport) {
                state.previewViewport = calculateZoomedPreviewViewport(
                    frame,
                    state.previewBaseViewport,
                    state.previewZoom
                );
            }
            if (!state.previewViewport) return;
            const { scale, offsetX, offsetY } = state.previewViewport;

            if (state.longBodyComposer.active) {
                const previewLeft = offsetX;
                const previewTop = offsetY;
                const previewWidth = Math.max(1, frame.width * scale);
                const previewHeight = Math.max(1, frame.height * scale);
                drawPreviewTransparencyBackground(
                    ctx,
                    previewLeft,
                    previewTop,
                    previewWidth,
                    previewHeight
                );
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(frame, previewLeft, previewTop, previewWidth, previewHeight);
                fillPreviewOutsideBounds(
                    ctx,
                    previewLeft,
                    previewTop,
                    previewLeft + previewWidth,
                    previewTop + previewHeight
                );

                const cutoffY = previewTop + state.longBodyComposer.coverage * scale;
                if (cutoffY >= 0 && cutoffY <= canvas.height) {
                    ctx.save();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = 'rgba(120, 220, 255, 0.95)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(0, cutoffY);
                    ctx.lineTo(canvas.width, cutoffY);
                    ctx.stroke();
                    ctx.restore();
                }
                return;
            }

            const outputRect = getTransformedOutputRect(cropRect);
            const outputLeft = offsetX + outputRect.x * scale;
            const outputTop = offsetY + outputRect.y * scale;
            const outputWidth = Math.max(1, outputRect.width * scale);
            const outputHeight = Math.max(1, outputRect.height * scale);
            const outputRight = outputLeft + outputWidth;
            const outputBottom = outputTop + outputHeight;
            const renderedFrame = state.previewFrames[0] || frame;

            drawPreviewTransparencyBackground(
                ctx,
                outputLeft,
                outputTop,
                outputWidth,
                outputHeight
            );
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
                renderedFrame,
                outputLeft,
                outputTop,
                outputWidth,
                outputHeight
            );

            ctx.save();
            fillPreviewOutsideBounds(
                ctx,
                outputLeft,
                outputTop,
                outputRight,
                outputBottom
            );

            ctx.strokeStyle = 'rgba(255, 102, 170, 0.95)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(outputLeft, outputTop, outputWidth, outputHeight);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 1;
            for (let i = 1; i <= 2; i++) {
                const gx = outputLeft + outputWidth * i / 3;
                const gy = outputTop + outputHeight * i / 3;
                ctx.beginPath();
                ctx.moveTo(gx, outputTop);
                ctx.lineTo(gx, outputBottom);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(outputLeft, gy);
                ctx.lineTo(outputRight, gy);
                ctx.stroke();
            }

            const handles = getCropHandlePoints(
                outputLeft,
                outputTop,
                outputRight,
                outputBottom
            );
            ctx.fillStyle = '#f4f4f5';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 1;
            for (const point of Object.values(handles)) {
                const size = 7;
                ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
                ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
            }

            if (state.snapGuides) {
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = 'rgba(120, 220, 255, 0.95)';
                ctx.lineWidth = 1.25;
                if (Number.isFinite(state.snapGuides.x)) {
                    const guideX = outputLeft +
                        (state.snapGuides.x - cropRect.x) *
                        (outputRect.width / Math.max(1, cropRect.width)) * scale;
                    ctx.beginPath();
                    ctx.moveTo(guideX, 0);
                    ctx.lineTo(guideX, canvas.height);
                    ctx.stroke();
                }
                if (Number.isFinite(state.snapGuides.y)) {
                    const guideY = outputTop +
                        (state.snapGuides.y - cropRect.y) *
                        (outputRect.height / Math.max(1, cropRect.height)) * scale;
                    ctx.beginPath();
                    ctx.moveTo(0, guideY);
                    ctx.lineTo(canvas.width, guideY);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
            }
            ctx.restore();
        }

        function updateMeta() {
            const frame = state.previewFrames[0] || state.workingFrames[0];
            const original = state.originalFrames[0];
            if (!frame || !original) return;
            const sourceSize = byId('textureImageSourceSize');
            const workingSize = byId('textureImageWorkingSize');
            if (sourceSize) sourceSize.textContent = `原始: ${original.width} × ${original.height}px`;
            if (workingSize) workingSize.textContent = `当前: ${frame.width} × ${frame.height}px`;
            renderPreview();
            updateStretchFixUI();
        }

        function renderPicker() {
            const grid = byId('textureImagePickerGrid');
            const count = byId('textureImagePickerCount');
            if (!grid) return;
            grid.innerHTML = '';
            const targets = getTextureTabParams().map(buildEditorTarget);
            if (count) count.textContent = `${targets.length} 项`;

            for (const target of targets) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'texture-image-picker-item';
                item.dataset.paramKey = target.p.key;
                item.disabled = !target.selectable;
                if (state.selected && state.selected.p.key === target.p.key) {
                    item.classList.add('selected');
                }

                const preview = document.createElement('div');
                preview.className = 'texture-image-picker-preview';
                renderTextureThumbnail(
                    preview,
                    target.frames[0] || null,
                    target.state === 'missing' ? '未找到' : '未配置',
                    48,
                    36,
                    target.frames.length > 1 ? target.frames : null
                );

                const meta = document.createElement('div');
                meta.className = 'texture-image-picker-meta';
                const name = document.createElement('span');
                name.className = 'texture-image-picker-name';
                name.textContent = target.p.zhName;
                const file = document.createElement('span');
                file.className = 'texture-image-picker-file';
                file.textContent = target.resolved && target.resolved.name ? target.resolved.name : target.p.default;
                meta.appendChild(name);
                meta.appendChild(file);

                const badge = document.createElement('span');
                badge.className = 'texture-image-picker-badge';
                if (!target.selectable) {
                    badge.textContent = target.state === 'missing' ? '缺失' : '不可用';
                } else if (target.frames.length > 1) {
                    badge.textContent = `${target.frames.length} 帧`;
                } else {
                    badge.textContent = target.frames[0]._is2x ? '@2x' : '1x';
                }

                item.appendChild(preview);
                item.appendChild(meta);
                item.appendChild(badge);
                if (target.selectable) {
                    item.onclick = () => selectTarget(target);
                }
                grid.appendChild(item);
            }
        }
