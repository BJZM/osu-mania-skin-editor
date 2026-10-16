// ============================================================================
// texture-image-editor.js - 裁剪贴图与透明扩边编辑器
// 依赖：ui/texture-resolve.js、ui/texture-upload.js、parser/skin-assets.js
// ============================================================================

        let textureImageEditorUi = null;

        function initTextureImageEditorUI() {
        const openBtn = byId('openTextureImageEditorBtn');
        const closeBtn = byId('textureImageEditorCloseBtn');
        const cancelBtn = byId('textureImageCancelBtn');
        const backdrop = byId('textureImageEditorBackdrop');
        const resetBtn = byId('textureImageResetBtn');
        const blankBtn = byId('textureImageBlankBtn');
        const applyBtn = byId('textureImageApplyBtn');
        const stretchFixBtn = byId('textureImageStretchFixBtn');
        const previewZoomRange = byId('textureImagePreviewZoom');
        const previewZoomOut = byId('textureImagePreviewZoomOut');
        const previewZoomIn = byId('textureImagePreviewZoomIn');
        const editorUndoBtn = byId('textureImageUndoBtn');
        const editorRedoBtn = byId('textureImageRedoBtn');
        const longBodyToggle = byId('textureImageLongBodyEnable');
        const longBodyCoverage = byId('textureImageLongBodyCoverage');
        const longBodyTargetHeight = byId('textureImageLongBodyTargetHeight');
        const longBodyFade = byId('textureImageLongBodyFade');
        const liveInputIds = [
            'textureImageCropX',
            'textureImageCropY',
            'textureImageCropWidth',
            'textureImageCropHeight'
        ];
        const transformInputIds = [
            'textureImageScalePercent',
            'textureImageStretchX',
            'textureImageStretchY'
        ];

        if (openBtn) openBtn.onclick = open;
        if (closeBtn) closeBtn.onclick = close;
        if (cancelBtn) cancelBtn.onclick = discardAndCloseEditor;
        if (backdrop) backdrop.onclick = close;
        if (resetBtn) resetBtn.onclick = resetCurrentTexture;
        if (blankBtn) blankBtn.onclick = setCurrentTextureBlank;
        if (applyBtn) applyBtn.onclick = applySelectedTexture;
        if (stretchFixBtn) stretchFixBtn.onclick = applyStretchFix;
        if (previewZoomRange) {
            previewZoomRange.addEventListener('input', () => setPreviewZoom(previewZoomRange.value));
        }
        if (previewZoomOut) {
            previewZoomOut.onclick = () => setPreviewZoom(state.previewZoom - PREVIEW_ZOOM_STEP);
        }
        if (previewZoomIn) {
            previewZoomIn.onclick = () => setPreviewZoom(state.previewZoom + PREVIEW_ZOOM_STEP);
        }
        if (editorUndoBtn) editorUndoBtn.onclick = undoEditorHistory;
        if (editorRedoBtn) editorRedoBtn.onclick = redoEditorHistory;
        if (longBodyToggle) {
            longBodyToggle.onchange = () => {
                if (longBodyToggle.checked) enableLongBodyComposer();
                else disableLongBodyComposer();
            };
        }
        if (longBodyCoverage) {
            longBodyCoverage.addEventListener('input', () => {
                state.longBodyComposer.coverage = Math.max(0, Number(longBodyCoverage.value) || 0);
                scheduleLongBodyRegenerate();
            });
        }
        if (longBodyTargetHeight) {
            longBodyTargetHeight.addEventListener('input', () => {
                state.longBodyComposer.targetHeight = Math.max(1, Number(longBodyTargetHeight.value) || LONG_BODY_DEFAULT_HEIGHT);
                scheduleLongBodyRegenerate();
            });
        }
        if (longBodyFade) {
            longBodyFade.addEventListener('input', () => {
                state.longBodyComposer.fade = Math.max(0, Math.min(LONG_BODY_FADE_MAX, Number(longBodyFade.value) || 0));
                const fadeValue = byId('textureImageLongBodyFadeValue');
                if (fadeValue) fadeValue.textContent = `${Math.round(state.longBodyComposer.fade)}%`;
                scheduleLongBodyRegenerate();
            });
        }
        for (const id of liveInputIds) {
            const input = byId(id);
            if (input) {
                input.addEventListener('input', () => {
                    beginEditorHistory('调整裁剪与扩边', { group: 'crop-input', autoCommitMs: 450 });
                    scheduleLivePreview();
                });
            }
        }
        for (const id of transformInputIds) {
            const input = byId(id);
            if (input) {
                input.addEventListener('input', () => {
                    if (input.value === '') return;
                    beginEditorHistory('调整拉伸与缩放', {
                        group: 'image-transform-input',
                        autoCommitMs: 450
                    });
                    try {
                        const next = cloneImageTransform(state.imageTransform);
                        if (id === 'textureImageScalePercent') {
                            const value = Number(input.value);
                            if (!Number.isFinite(value) || value < 1 || value > 1000) {
                                throw new Error('放大百分比必须在 1 到 1000 之间');
                            }
                            next.scalePercent = value;
                        } else if (id === 'textureImageStretchX') {
                            const value = Number(input.value);
                            if (!Number.isFinite(value) || !Number.isInteger(value)) {
                                throw new Error('横向拉伸必须是整数');
                            }
                            next.stretchX = value;
                        } else {
                            const value = Number(input.value);
                            if (!Number.isFinite(value) || !Number.isInteger(value)) {
                                throw new Error('纵向拉伸必须是整数');
                            }
                            next.stretchY = value;
                        }
                        setImageTransform(next, { centerAnchor: true, refresh: false });
                        scheduleLivePreview();
                    } catch (err) {

                            updateImageTransformInputs();
                            showToast('拉伸与缩放参数无效', err.message || '请检查输入值');
                        }
                    });
                }
            }
            updateImageTransformInputs();
            updateImageTransformControlAvailability();
            updatePreviewZoomControls();
            updateLongBodyComposerUI();
            updateEditorHistoryButtons();
            initCropCanvasInteractions();

            textureImageEditorUi = {
                open,
                close,
                closeTab,
                undo: undoEditorHistory,
                redo: redoEditorHistory,
                syncExternalFrames,
                commitExternalChanges: absorbExternalChanges,
                getLongBodyPreviewCanvas: () => state.longBodyComposer.active
                    ? state.previewFrames[0]
                    : null,
                selectByParamKey: (paramKey) => {
                    const target = getTextureTabParams().map(buildEditorTarget)
                        .find((item) => item.p.key === paramKey && item.selectable);
                    if (!target) return false;
                    selectTarget(target);
                    return true;
                },
                getState: () => ({
                    activeTabId,
                    tabCount: tabs.length,
                    dirtyTabCount: tabs.filter(isTabDirty).length,
                    selectedKey: state.selected ? state.selected.p.key : null,
                    selectedBase: state.selected ? state.selected.base : null,
                    frameCount: state.workingFrames.length,
                    sourceSize: state.originalFrames[0]
                        ? { width: state.originalFrames[0].width, height: state.originalFrames[0].height }
                        : null,
                    workingSize: state.workingFrames[0]
                        ? { width: state.workingFrames[0].width, height: state.workingFrames[0].height }
                        : null,
                    previewSize: state.previewFrames[0]
                        ? { width: state.previewFrames[0].width, height: state.previewFrames[0].height }
                        : null,
                    cropRect: state.cropRect ? { ...state.cropRect } : null,
                    imageTransform: cloneImageTransform(state.imageTransform),
                    transformRect: (() => {
                        const rect = getTransformedOutputRect();
                        return rect ? { ...rect } : null;
                    })(),
                    previewViewport: state.previewViewport ? { ...state.previewViewport } : null,
                    previewZoom: state.previewZoom,
                    contentBounds: (() => {
                        const bounds = getNonTransparentContentBounds();
                        return bounds ? { ...bounds } : null;
                    })(),
                    inputValues: {
                        x: Number((byId('textureImageCropX') || {}).value || 0),
                        y: Number((byId('textureImageCropY') || {}).value || 0),
                        width: Number((byId('textureImageCropWidth') || {}).value || 0),
                        height: Number((byId('textureImageCropHeight') || {}).value || 0)
                    },
                    transformInputValues: {
                        scalePercent: Number((byId('textureImageScalePercent') || {}).value || 0),
                        stretchX: Number((byId('textureImageStretchX') || {}).value || 0),
                        stretchY: Number((byId('textureImageStretchY') || {}).value || 0)
                    },
                    longBody: {
                        active: state.longBodyComposer.active,
                        targetHeight: state.longBodyComposer.targetHeight,
                        coverage: state.longBodyComposer.coverage,
                        fade: state.longBodyComposer.fade,
                        tailScaledHeight: state.longBodyComposer.tailScaledHeight,
                        sessionKey: state.longBodyComposer.sessionKey
                    },
                    canUndo: state.editorUndoStack.length > 0,
                    canRedo: state.editorRedoStack.length > 0,
                    stretchFix: (() => {
                        const frame = state.previewFrames[0] || state.workingFrames[0];
                        const target = getStretchFixTarget(state.selected, frame);
                        return target ? {
                            axis: target.axis,
                            size: target.size,
                            detail: target.detail || null,
                            reason: target.reason || null
                        } : null;
                    })()
                })
            };
        }
