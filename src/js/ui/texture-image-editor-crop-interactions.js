// ============================================================================
// texture-image-editor-crop-interactions.js - 裁剪画布拖动、缩放、平移与调整把手交互
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function initCropCanvasInteractions() {
            const canvas = byId('textureImagePreviewCanvas');
            if (!canvas) return;

            canvas.addEventListener('wheel', (event) => {
                if (!state.workingFrames[0] || state.cropDragState || state.transformDragState || state.longBodyDragState || state.previewPanState) return;
                event.preventDefault();
                const anchor = getPreviewCanvasPoint(event.clientX, event.clientY);
                const delta = event.deltaY < 0 ? PREVIEW_ZOOM_STEP : -PREVIEW_ZOOM_STEP;
                setPreviewZoom(state.previewZoom + delta, anchor);
            }, { passive: false });

            canvas.addEventListener('pointerdown', (event) => {
                if (event.button === 1) {
                    if (!state.previewViewport) return;
                    state.previewPanState = {
                        pointerId: event.pointerId,
                        startClientX: event.clientX,
                        startClientY: event.clientY,
                        startOffsetX: state.previewViewport.offsetX,
                        startOffsetY: state.previewViewport.offsetY
                    };
                    canvas.setPointerCapture(event.pointerId);
                    canvas.style.cursor = 'grabbing';
                    event.preventDefault();
                    return;
                }
                if (event.button !== 0) return;
                if (state.longBodyComposer.active) {
                    const tailHit = getLongBodyTailPointerState(event);
                    if (!tailHit) return;
                    state.longBodyDragState = {
                        pointerId: event.pointerId,
                        startClientY: event.clientY,
                        startCoverage: state.longBodyComposer.coverage
                    };
                    canvas.setPointerCapture(event.pointerId);
                    canvas.style.cursor = 'grabbing';
                    event.preventDefault();
                    return;
                }
                if (event.shiftKey) {
                    const transformHit = getTransformPointerState(event);
                    if (!transformHit || !state.cropRect) return;
                    const isCorner = transformHit.mode.length === 2;
                    beginEditorHistory(
                        isCorner ? '等比例缩放图片' : '拉伸图片',
                        { group: 'image-transform-drag' }
                    );
                    state.snapGuides = null;
                    state.transformDragState = {
                        pointerId: event.pointerId,
                        mode: transformHit.mode,
                        startWorldX: transformHit.worldX,
                        startWorldY: transformHit.worldY,
                        startCropRect: { ...state.cropRect },
                        startTransform: cloneImageTransform(state.imageTransform)
                    };
                    canvas.setPointerCapture(event.pointerId);
                    event.preventDefault();
                    return;
                }
                const hit = getCropPointerState(event);
                if (!hit || !state.cropRect) return;
                beginEditorHistory('拖动裁剪框', { group: 'crop-drag' });
                state.snapGuides = null;
                state.cropDragState = {
                    pointerId: event.pointerId,
                    mode: hit.mode,
                    startWorldX: hit.worldX,
                    startWorldY: hit.worldY,
                    startRect: { ...getTransformedOutputRect(state.cropRect, state.imageTransform) },
                    startTransform: cloneImageTransform(state.imageTransform)
                };
                canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
            });

            canvas.addEventListener('pointermove', (event) => {
                if (state.previewPanState && state.previewPanState.pointerId === event.pointerId) {
                    const viewport = state.previewViewport;
                    if (!viewport) return;
                    const rect = canvas.getBoundingClientRect();
                    const dx = (event.clientX - state.previewPanState.startClientX) * canvas.width / rect.width;
                    const dy = (event.clientY - state.previewPanState.startClientY) * canvas.height / rect.height;
                    viewport.offsetX = state.previewPanState.startOffsetX + dx;
                    viewport.offsetY = state.previewPanState.startOffsetY + dy;
                    renderPreview();
                    event.preventDefault();
                    return;
                }
                if (state.longBodyDragState && state.longBodyDragState.pointerId === event.pointerId) {
                    const viewport = state.previewViewport;
                    if (!viewport) return;
                    const rect = canvas.getBoundingClientRect();
                    const deltaPixels = (event.clientY - state.longBodyDragState.startClientY) * canvas.height / rect.height;
                    const nextCoverage = state.longBodyDragState.startCoverage + deltaPixels / viewport.scale;
                    state.longBodyComposer.coverage = Math.max(
                        0,
                        Math.min(state.longBodyComposer.targetHeight, Math.round(nextCoverage))
                    );
                    regenerateLongBodyComposite();
                    event.preventDefault();
                    return;
                }
                if (state.transformDragState && state.transformDragState.pointerId === event.pointerId) {
                    const drag = state.transformDragState;
                    const viewport = state.previewViewport;
                    if (!viewport) return;
                    const rect = canvas.getBoundingClientRect();
                    const px = (event.clientX - rect.left) * canvas.width / rect.width;
                    const py = (event.clientY - rect.top) * canvas.height / rect.height;
                    const worldX = (px - viewport.offsetX) / viewport.scale;
                    const worldY = (py - viewport.offsetY) / viewport.scale;
                    const dx = worldX - drag.startWorldX;
                    const dy = worldY - drag.startWorldY;
                    const next = cloneImageTransform(drag.startTransform);

                    if (drag.mode.length === 1) {
                        const outputScale = Math.max(0.01, drag.startTransform.scalePercent / 100);
                        const currentStretchX = drag.startTransform.scaleAfterStretch
                            ? drag.startTransform.stretchX * outputScale
                            : drag.startTransform.stretchX;
                        const currentStretchY = drag.startTransform.scaleAfterStretch
                            ? drag.startTransform.stretchY * outputScale
                            : drag.startTransform.stretchY;
                        if (drag.mode === 'e') {
                            next.stretchX = currentStretchX + dx * 2;
                            next.anchorX = 0.5;
                        } else if (drag.mode === 'w') {
                            next.stretchX = currentStretchX - dx * 2;
                            next.anchorX = 0.5;
                        } else if (drag.mode === 's') {
                            next.stretchY = currentStretchY + dy * 2;
                            next.anchorY = 0.5;
                        } else if (drag.mode === 'n') {
                            next.stretchY = currentStretchY - dy * 2;
                            next.anchorY = 0.5;
                        }
                    } else {
                        const startOutputRect = getTransformedOutputRect(
                            drag.startCropRect,
                            drag.startTransform
                        );
                        const widthDelta = (drag.mode.includes('e') ? dx : -dx) * 2;
                        const heightDelta = (drag.mode.includes('s') ? dy : -dy) * 2;
                        const scaleFromWidth = drag.startTransform.scaleAfterStretch
                            ? (startOutputRect.width + widthDelta) /
                                Math.max(1, drag.startCropRect.width + drag.startTransform.stretchX) * 100
                            : (startOutputRect.width + widthDelta -
                                drag.startTransform.stretchX) /
                                Math.max(1, drag.startCropRect.width) * 100;
                        const scaleFromHeight = drag.startTransform.scaleAfterStretch
                            ? (startOutputRect.height + heightDelta) /
                                Math.max(1, drag.startCropRect.height + drag.startTransform.stretchY) * 100
                            : (startOutputRect.height + heightDelta -
                                drag.startTransform.stretchY) /
                                Math.max(1, drag.startCropRect.height) * 100;
                        const widthChange = Math.abs(
                            (scaleFromWidth - drag.startTransform.scalePercent) /
                            Math.max(1, drag.startTransform.scalePercent)
                        );
                        const heightChange = Math.abs(
                            (scaleFromHeight - drag.startTransform.scalePercent) /
                            Math.max(1, drag.startTransform.scalePercent)
                        );
                        next.scalePercent = widthChange >= heightChange
                            ? scaleFromWidth
                            : scaleFromHeight;
                        next.anchorX = 0.5;
                        next.anchorY = 0.5;
                    }

                    try {
                        setImageTransform(next);
                    } catch (_) {
                        // 拖动过程中超过上限时保持上一帧有效状态。
                    }
                    event.preventDefault();
                    return;
                }
                if (state.longBodyComposer.active) {
                    canvas.style.cursor = getLongBodyTailPointerState(event) ? 'grab' : 'default';
                    return;
                }
                if (!state.cropDragState || state.cropDragState.pointerId !== event.pointerId) {
                    const hoverHit = event.shiftKey
                        ? getTransformPointerState(event)
                        : getCropPointerState(event);
                    updateCropCursor((hoverHit || {}).mode);
                    return;
                }
                const drag = state.cropDragState;
                const viewport = state.previewViewport;
                if (!viewport) return;
                const rect = canvas.getBoundingClientRect();
                const px = (event.clientX - rect.left) * canvas.width / rect.width;
                const py = (event.clientY - rect.top) * canvas.height / rect.height;
                const worldX = (px - viewport.offsetX) / viewport.scale;
                const worldY = (py - viewport.offsetY) / viewport.scale;
                const dx = worldX - drag.startWorldX;
                const dy = worldY - drag.startWorldY;
                const start = drag.startRect;
                const next = { ...start };
                const transformed = hasImageTransform(drag.startTransform);
                const frame = state.workingFrames[0];
                const bounds = transformed ? null : getNonTransparentContentBounds();
                const xTargets = transformed ? [] : getSnapTargets('x', frame, bounds);
                const yTargets = transformed ? [] : getSnapTargets('y', frame, bounds);
                const snapThreshold = Math.max(1, 10 / viewport.scale);
                let guideX = null;
                let guideY = null;

                if (drag.mode.includes('w')) {
                    const rawX = start.x + dx;
                    const snap = findSnap(rawX, xTargets, snapThreshold);
                    next.x = Math.round(snap ? snap.value : rawX);
                    next.width = Math.round(start.x + start.width - next.x);
                    if (snap) guideX = snap.value;
                }
                if (drag.mode.includes('e')) {
                    const rawRight = start.x + start.width + dx;
                    const snap = findSnap(rawRight, xTargets, snapThreshold);
                    const right = Math.round(snap ? snap.value : rawRight);
                    next.width = right - start.x;
                    if (snap) guideX = snap.value;
                }
                if (drag.mode.includes('n')) {
                    const rawY = start.y + dy;
                    const snap = findSnap(rawY, yTargets, snapThreshold);
                    next.y = Math.round(snap ? snap.value : rawY);
                    next.height = Math.round(start.y + start.height - next.y);
                    if (snap) guideY = snap.value;
                }
                if (drag.mode.includes('s')) {
                    const rawBottom = start.y + start.height + dy;
                    const snap = findSnap(rawBottom, yTargets, snapThreshold);
                    const bottom = Math.round(snap ? snap.value : rawBottom);
                    next.height = bottom - start.y;
                    if (snap) guideY = snap.value;
                }
                next.width = Math.max(1, next.width);
                next.height = Math.max(1, next.height);

                state.snapGuides = (guideX != null || guideY != null)
                    ? { x: guideX, y: guideY }
                    : null;
                try {
                    if (transformed) {
                        const nextTransform = cloneImageTransform(drag.startTransform);
                        const nextCrop = getCropRectForOutputRect(next, nextTransform);
                        state.imageTransform = nextTransform;
                        updateImageTransformInputs();
                        setCropRect(nextCrop, { refresh: false });
                    } else {
                        setCropRect(next, { refresh: false });
                    }
                    refreshLivePreview();
                } catch (_) {
                    // 拖动过程中超过上限时保持上一帧有效状态。
                }
                event.preventDefault();
            });

            const finishDrag = (event) => {
                if (!state.cropDragState || state.cropDragState.pointerId !== event.pointerId) return;
                state.cropDragState = null;
                state.snapGuides = null;
                try { canvas.releasePointerCapture(event.pointerId); } catch (_) { }
                commitEditorHistory();
                renderPreview();
                const hoverHit = event.shiftKey
                    ? getTransformPointerState(event)
                    : getCropPointerState(event);
                updateCropCursor((hoverHit || {}).mode);
            };
            const finishTransformDrag = (event) => {
                if (!state.transformDragState || state.transformDragState.pointerId !== event.pointerId) return;
                state.transformDragState = null;
                try { canvas.releasePointerCapture(event.pointerId); } catch (_) { }
                commitEditorHistory();
                renderPreview();
                const hoverHit = event.shiftKey
                    ? getTransformPointerState(event)
                    : getCropPointerState(event);
                updateCropCursor((hoverHit || {}).mode);
            };
            const finishLongBodyDrag = (event) => {
                if (!state.longBodyDragState || state.longBodyDragState.pointerId !== event.pointerId) return;
                state.longBodyDragState = null;
                try { canvas.releasePointerCapture(event.pointerId); } catch (_) { }
                canvas.style.cursor = getLongBodyTailPointerState(event) ? 'grab' : 'default';
            };
            const finishPreviewPan = (event) => {
                if (!state.previewPanState || state.previewPanState.pointerId !== event.pointerId) return;
                state.previewPanState = null;
                try { canvas.releasePointerCapture(event.pointerId); } catch (_) { }
                if (state.longBodyComposer.active) {
                    canvas.style.cursor = getLongBodyTailPointerState(event) ? 'grab' : 'default';
                } else {
                    updateCropCursor((getCropPointerState(event) || {}).mode);
                }
            };
            canvas.addEventListener('pointerup', finishPreviewPan);
            canvas.addEventListener('pointercancel', finishPreviewPan);
            canvas.addEventListener('pointerup', finishLongBodyDrag);
            canvas.addEventListener('pointercancel', finishLongBodyDrag);
            canvas.addEventListener('pointerup', finishTransformDrag);
            canvas.addEventListener('pointercancel', finishTransformDrag);
            canvas.addEventListener('pointerup', finishDrag);
            canvas.addEventListener('pointercancel', finishDrag);
            canvas.addEventListener('pointerleave', () => {
                if (state.previewPanState) return;
                if (state.transformDragState) return;
                if (state.longBodyComposer.active) {
                    if (!state.longBodyDragState) canvas.style.cursor = 'default';
                    return;
                }
                if (!state.cropDragState) updateCropCursor(null);
            });
        }
