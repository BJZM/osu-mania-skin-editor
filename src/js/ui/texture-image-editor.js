// ============================================================================
// texture-image-editor.js - 裁剪贴图与透明扩边编辑器
// 依赖：ui/texture-resolve.js、ui/texture-upload.js、parser/skin-assets.js
// ============================================================================

        let textureImageEditorUi = null;

        function initTextureImageEditorUI() {
        const openBtn = byId('openTextureImageEditorBtn');
        const closeBtn = byId('textureImageEditorCloseBtn');
        const backdrop = byId('textureImageEditorBackdrop');
        const cancelBtn = byId('textureImageCancelBtn');
        const resetBtn = byId('textureImageResetBtn');
        const blankBtn = byId('textureImageBlankBtn');
        const applyBtn = byId('textureImageApplyBtn');
        const applyMenuBtn = byId('textureImageApplyMenuBtn');
        const applyCurrentBtn = byId('textureImageApplyCurrentBtn');
        const applyAllBtn = byId('textureImageApplyAllBtn');
        const applyCurrentOnlyBtn = byId('textureImageApplyCurrentOnlyBtn');
        const applyAllOnlyBtn = byId('textureImageApplyAllOnlyBtn');
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
        const longBodyPreset = byId('textureImageLongBodyPreset');
        const longBodyPresetHeight = byId('textureImageLongBodyPresetHeight');
        const liveInputIds = [
            'textureImageCropLeft',
            'textureImageCropRight',
            'textureImageCropTop',
            'textureImageCropBottom',
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
        const undoTextureEditorAction = () => {
            if (undoEditorHistory()) return true;
            if (typeof undoStack === 'undefined' || undoStack.length === 0 ||
                typeof performSkinUndo !== 'function') {
                return false;
            }
            performSkinUndo();
            updateEditorHistoryButtons();
            return true;
        };
        const redoTextureEditorAction = () => {
            if (redoEditorHistory()) return true;
            if (typeof redoStack === 'undefined' || redoStack.length === 0 ||
                typeof performSkinRedo !== 'function') {
                return false;
            }
            performSkinRedo();
            updateEditorHistoryButtons();
            return true;
        };
        const applyCurrentTrack = () => applySelectedTexture({
            keyImageScope: 'current',
            syncKeyImagePair: true
        });
        const applyAllTracks = () => applySelectedTexture({
            keyImageScope: 'all',
            syncKeyImagePair: true
        });
        const applyCurrentTrackOnly = () => applySelectedTexture({
            keyImageScope: 'current',
            syncKeyImagePair: false
        });
        const applyAllTracksOnly = () => applySelectedTexture({
            keyImageScope: 'all',
            syncKeyImagePair: false
        });

        if (openBtn) openBtn.onclick = open;
        if (closeBtn) closeBtn.onclick = close;
        if (cancelBtn) cancelBtn.onclick = discardAndCloseEditor;
        if (backdrop) backdrop.onclick = close;
        if (resetBtn) resetBtn.onclick = resetCurrentTexture;
        if (blankBtn) blankBtn.onclick = setCurrentTextureBlank;
        if (applyBtn) applyBtn.onclick = applyCurrentTrack;
        if (applyCurrentBtn) applyCurrentBtn.onclick = applyCurrentTrack;
        if (applyAllBtn) applyAllBtn.onclick = applyAllTracks;
        if (applyCurrentOnlyBtn) applyCurrentOnlyBtn.onclick = applyCurrentTrackOnly;
        if (applyAllOnlyBtn) applyAllOnlyBtn.onclick = applyAllTracksOnly;
        if (applyMenuBtn) {
            applyMenuBtn.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleTextureImageSaveMenu();
            };
        }
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target && target.closest && target.closest('.texture-image-save-actions')) return;
            closeTextureImageSaveMenu();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeTextureImageSaveMenu();
        });
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
        if (editorUndoBtn) editorUndoBtn.onclick = undoTextureEditorAction;
        if (editorRedoBtn) editorRedoBtn.onclick = redoTextureEditorAction;
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
                updateTextureRangeFill(longBodyFade);
                scheduleLongBodyRegenerate();
            });
        }
        if (longBodyPreset) {
            longBodyPreset.addEventListener('change', () => {
                beginEditorHistory('调整尾部预设');
                const nextPreset = longBodyPreset.value || 'none';
                state.longBodyComposer.tailPreset = nextPreset;
                if (nextPreset !== 'none' && !state.longBodyComposer.presetHeight) {
                    const defaultH = (state.longBodyComposer.baseFrames[0] && typeof getLongBodyDefaultPresetHeight === 'function')
                        ? getLongBodyDefaultPresetHeight(state.longBodyComposer.baseFrames[0])
                        : 50;
                    state.longBodyComposer.presetHeight = defaultH;
                }
                updateLongBodyControlValues();
                if (state.longBodyRegenerateTimer) {
                    clearTimeout(state.longBodyRegenerateTimer);
                    state.longBodyRegenerateTimer = null;
                }
                regenerateLongBodyComposite();
                commitEditorHistory();
            });
        }
        if (longBodyPresetHeight) {
            longBodyPresetHeight.addEventListener('input', () => {
                beginEditorHistory('调整尾部预设高度', { group: 'longbody-preset-height', autoCommitMs: 450 });
                state.longBodyComposer.presetHeight = Math.max(1, Number(longBodyPresetHeight.value) || 0);
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
                            if (!Number.isFinite(value) || value < 1 || value > 5000) {
                                throw new Error('放大百分比必须在 1 到 5000 之间');
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
            for (const channel of ['r', 'g', 'b']) {
                const range = byId(`textureImageRgb${channel.toUpperCase()}`);
                const number = byId(`textureImageRgb${channel.toUpperCase()}Value`);
                const onInput = (rawValue) => {
                    if (rawValue === '') return;
                    const value = normalizeRgbAdjustmentChannel(rawValue);
                    beginEditorHistory('调整贴图RGB通道', {
                        group: 'rgb-adjustment-input',
                        autoCommitMs: 140
                    });
                    state.rgbAdjustment[channel] = value;
                    if (range && range.value !== String(value)) {
                        range.value = String(value);
                    }
                    if (number && number.value !== String(value)) {
                        number.value = String(value);
                    }
                    if (range) updateTextureRangeFill(range);
                    scheduleLivePreview();
                };
                if (range) {
                    range.addEventListener('input', () => onInput(range.value));
                    range.addEventListener('change', () => commitEditorHistory());
                }
                if (number) {
                    number.addEventListener('input', () => onInput(number.value));
                    number.addEventListener('change', () => commitEditorHistory());
                    number.addEventListener('blur', () => commitEditorHistory());
                }
            }
            const rgbResetBtn = byId('textureImageRgbResetBtn');
            if (rgbResetBtn) {
                rgbResetBtn.onclick = () => {
                    beginEditorHistory('重置贴图RGB通道', { group: 'rgb-adjustment-reset' });
                    resetRgbAdjustmentInputs();
                    scheduleLivePreview();
                };
            }

            updateImageTransformInputs();
            updateImageTransformControlAvailability();
            updateRgbAdjustmentInputs();
            updateRgbAdjustmentControlAvailability();
            updatePreviewZoomControls();
            updateLongBodyComposerUI();
            updateEditorHistoryButtons();
            initCropCanvasInteractions();
            if (typeof initTextureCreatorUI === 'function') {
                initTextureCreatorUI();
            }
            if (typeof initTextureLibraryUI === 'function') {
                initTextureLibraryUI();
            }

            textureImageEditorUi = {
                open,
                close,
                closeTab,
                openCreator: typeof openTextureCreator === 'function' ? openTextureCreator : () => {},
                openLibraryEditor: typeof openTextureLibraryGeneralEditor === 'function'
                    ? openTextureLibraryGeneralEditor
                    : () => false,
                undo: undoTextureEditorAction,
                redo: redoTextureEditorAction,
                canUndo: () => (state && Array.isArray(state.editorUndoStack) && state.editorUndoStack.length > 0) ||
                    (typeof undoStack !== 'undefined' && undoStack.length > 0),
                canRedo: () => (state && Array.isArray(state.editorRedoStack) && state.editorRedoStack.length > 0) ||
                    (typeof redoStack !== 'undefined' && redoStack.length > 0),
                refreshAfterSkinImport: refreshTextureImageEditorAfterSkinImport,
                focusParams: focusTexturePickerParams,
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
                    selectedKind: state.selected ? (state.selected.kind || 'param') : null,
                    selectedBase: state.selected ? state.selected.base : null,
                    selectedLibraryPath: state.selected && state.selected.kind === 'library'
                        ? state.selected.libraryPath
                        : null,
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
                    previewIs2x: !!(state.previewFrames[0] && state.previewFrames[0]._is2x),
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
                        left: Number((byId('textureImageCropLeft') || byId('textureImageCropX') || {}).value || 0),
                        right: Number((byId('textureImageCropRight') || {}).value || 0),
                        top: Number((byId('textureImageCropTop') || byId('textureImageCropY') || {}).value || 0),
                        bottom: Number((byId('textureImageCropBottom') || {}).value || 0),
                        x: Number((byId('textureImageCropLeft') || byId('textureImageCropX') || {}).value || 0),
                        y: Number((byId('textureImageCropTop') || byId('textureImageCropY') || {}).value || 0),
                        width: Number((byId('textureImageCropWidth') || {}).value || (
                            Number((byId('textureImageCropLeft') || {}).value || 0) +
                            Number((byId('textureImageCropRight') || {}).value || 0)
                        )),
                        height: Number((byId('textureImageCropHeight') || {}).value || (
                            Number((byId('textureImageCropTop') || {}).value || 0) +
                            Number((byId('textureImageCropBottom') || {}).value || 0)
                        ))
                    },
                    transformInputValues: {
                        scalePercent: Number((byId('textureImageScalePercent') || {}).value || 0),
                        stretchX: Number((byId('textureImageStretchX') || {}).value || 0),
                        stretchY: Number((byId('textureImageStretchY') || {}).value || 0)
                    },
                    rgbAdjustment: cloneRgbAdjustment(state.rgbAdjustment),
                    creator: {
                        active: tabs.some((tab) => tab.id === activeTabId && tab.kind === 'creator'),
                        targetKey: typeof textureCreatorState !== 'undefined' ? textureCreatorState.targetKey : '',
                        name: typeof textureCreatorState !== 'undefined' ? (textureCreatorState.name || '') : '',
                        editPath: typeof textureCreatorState !== 'undefined' ? textureCreatorState.editPath : null,
                        width: typeof textureCreatorState !== 'undefined' ? textureCreatorState.width : 256,
                        height: typeof textureCreatorState !== 'undefined' ? textureCreatorState.height : 256,
                        shape: typeof textureCreatorState !== 'undefined' ? textureCreatorState.shape : 'rectangle',
                        arrowThickness: typeof textureCreatorState !== 'undefined' ? textureCreatorState.arrowThickness : 20,
                        arrowRoundness: typeof textureCreatorState !== 'undefined' ? textureCreatorState.arrowRoundness : 50,
                        cornerRadius: typeof textureCreatorState !== 'undefined' ? textureCreatorState.cornerRadius : 24,
                        color: typeof textureCreatorState !== 'undefined' ? textureCreatorState.color : '#ffffff',
                        alpha: typeof textureCreatorState !== 'undefined' ? textureCreatorState.alpha : 100,
                        strokeEnabled: typeof textureCreatorState !== 'undefined' ? (textureCreatorState.strokeWidth > 0 && !!textureCreatorState.strokeEnabled) : false,
                        strokeWidth: typeof textureCreatorState !== 'undefined' ? textureCreatorState.strokeWidth : 0,
                        strokeColor: typeof textureCreatorState !== 'undefined' ? textureCreatorState.strokeColor : '#000000',
                        strokeAlpha: typeof textureCreatorState !== 'undefined' ? textureCreatorState.strokeAlpha : 100,
                        fillTransparentEnabled: typeof textureCreatorState !== 'undefined' ? !!textureCreatorState.fillTransparentEnabled : false,
                        fillTransparentColor: typeof textureCreatorState !== 'undefined' ? (textureCreatorState.fillTransparentColor || '#000000') : '#000000',
                        fillTransparentAlpha: typeof textureCreatorState !== 'undefined' ? (Number.isFinite(textureCreatorState.fillTransparentAlpha) ? textureCreatorState.fillTransparentAlpha : 100) : 100,
                        spec: typeof textureCreatorState !== 'undefined' ? textureCreatorState.spec : '1x'
                    },
                    longBody: {
                        active: state.longBodyComposer.active,
                        targetHeight: state.longBodyComposer.targetHeight,
                        coverage: state.longBodyComposer.coverage,
                        fade: state.longBodyComposer.fade,
                        tailScaledHeight: state.longBodyComposer.tailScaledHeight,
                        tailPreset: state.longBodyComposer.tailPreset || 'none',
                        presetHeight: state.longBodyComposer.presetHeight || 0,
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
