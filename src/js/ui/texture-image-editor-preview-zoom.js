// ============================================================================
// texture-image-editor-preview-zoom.js - 贴图预览缩放、选中摘要与长条控件状态
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function clampPreviewZoom(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return 1;
            const stepped = Math.round(numeric / PREVIEW_ZOOM_STEP) * PREVIEW_ZOOM_STEP;
            return Math.max(PREVIEW_ZOOM_MIN, Math.min(PREVIEW_ZOOM_MAX, stepped));
        }

        function updatePreviewZoomControls() {
            const range = byId('textureImagePreviewZoom');
            const output = byId('textureImagePreviewZoomValue');
            const zoomOut = byId('textureImagePreviewZoomOut');
            const zoomIn = byId('textureImagePreviewZoomIn');
            const zoom = clampPreviewZoom(state.previewZoom);
            state.previewZoom = zoom;

            if (range) {
                range.value = String(zoom);
                updateTextureRangeFill(range);
            }
            if (output) output.textContent = `${Math.round(zoom * 100)}%`;
            if (zoomOut) zoomOut.disabled = zoom <= PREVIEW_ZOOM_MIN + 0.001;
            if (zoomIn) zoomIn.disabled = zoom >= PREVIEW_ZOOM_MAX - 0.001;
        }

        function getLongBodyCenteredOffsetY(canvas, frame, scale) {
            const composer = state.longBodyComposer;
            const tailHeight = getLongBodyTailDisplayHeight(
                composer.tailFrame,
                frame.width
            );
            const tailBottom = composer.coverage + tailHeight;
            return canvas.height / 2 - tailBottom * scale;
        }

        function calculateZoomedPreviewViewport(frame, baseViewport, zoom) {
            const canvas = byId('textureImagePreviewCanvas');
            if (!canvas || !frame || !baseViewport) return null;
            const scale = baseViewport.scale * zoom;
            if (state.longBodyComposer.active) {
                return {
                    scale,
                    offsetX: (canvas.width - frame.width * scale) / 2,
                    offsetY: getLongBodyCenteredOffsetY(canvas, frame, scale)
                };
            }
            return {
                scale,
                offsetX: (canvas.width - frame.width * scale) / 2,
                offsetY: (canvas.height - frame.height * scale) / 2
            };
        }

        function refreshPreviewZoom(options = {}) {
            const frame = state.workingFrames[0];
            if (!frame) {
                state.previewBaseViewport = null;
                state.previewViewport = null;
            } else {
                if (!state.previewBaseViewport) {
                    state.previewBaseViewport = calculatePreviewViewport(frame);
                }
                state.previewViewport = calculateZoomedPreviewViewport(
                    frame,
                    state.previewBaseViewport,
                    state.previewZoom
                );
                if (state.previewViewport && options.anchor && options.anchor.worldX != null) {
                    state.previewViewport.offsetX =
                        options.anchor.canvasX - options.anchor.worldX * state.previewViewport.scale;
                    state.previewViewport.offsetY =
                        options.anchor.canvasY - options.anchor.worldY * state.previewViewport.scale;
                }
            }
            updatePreviewZoomControls();
            if (options.render !== false) renderPreview();
        }

        function setPreviewZoom(value, anchor = null) {
            const next = clampPreviewZoom(value);
            if (Math.abs(next - state.previewZoom) < 0.001) {
                updatePreviewZoomControls();
                return;
            }
            let zoomAnchor = null;
            if (anchor && state.previewViewport) {
                zoomAnchor = {
                    canvasX: anchor.x,
                    canvasY: anchor.y,
                    worldX: (anchor.x - state.previewViewport.offsetX) / state.previewViewport.scale,
                    worldY: (anchor.y - state.previewViewport.offsetY) / state.previewViewport.scale
                };
            }
            state.previewZoom = next;
            refreshPreviewZoom({ anchor: zoomAnchor });
        }

        function getPreviewCanvasPoint(clientX, clientY) {
            const canvas = byId('textureImagePreviewCanvas');
            if (!canvas) return null;
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return null;
            return {
                x: (clientX - rect.left) * canvas.width / rect.width,
                y: (clientY - rect.top) * canvas.height / rect.height
            };
        }

        function isHoldBodySelected() {
            if (!state.selected) return false;
            const p = (typeof getEffectiveParamForTarget === 'function')
                ? getEffectiveParamForTarget(state.selected)
                : (state.selected && state.selected.p);
            if (!p) return false;
            return p._trackLookup === LML.HoldNoteBodyImage ||
                /^holdnotebodyimage/i.test(p.key || '') ||
                /^noteimage\d*l$/i.test(p.key || '');
        }

        function getSelectedTrackIndex() {
            if (!state.selected) return null;
            const p = (typeof getEffectiveParamForTarget === 'function')
                ? getEffectiveParamForTarget(state.selected)
                : (state.selected && state.selected.p);
            if (!p) return null;
            if (p._trackCol != null) return Number(p._trackCol);
            const track = typeof getParamTrackIndex === 'function' ? getParamTrackIndex(p) : null;
            if (track != null) return track;
            const match = String(p.key || '').match(/(?:noteimage|keyimage|holdnoteheadimage|holdnotebodyimage|holdnotetailimage)(\d+)/i);
            if (match) return Number(match[1]);
            if (typeof isEditingKeyImageParam === 'function' && isEditingKeyImageParam(p)) {
                return 0;
            }
            return null;
        }

        function getTailParamForSelectedBody() {
            const column = getSelectedTrackIndex();
            if (column == null) return null;
            return getTextureTabParams().find((p) =>
                p._trackCol === column && (
                    p._trackLookup === LML.HoldNoteTailImage ||
                    /^noteimage\d*t$/i.test(p.key || '')
                )
            ) || null;
        }

        function getLongBodySourceInfo() {
            const selected = state.selected;
            if (!selected) {
                return {
                    eligible: false,
                    state: 'unset',
                    frame: null,
                    name: '',
                    bodyHeight: 0
                };
            }
            const bodyFrame = state.previewFrames[0] ||
                state.workingFrames[0] ||
                state.originalFrames[0] ||
                (selected.frames && selected.frames[0]) ||
                null;
            const bodyHeight = bodyFrame
                ? Number(bodyFrame.naturalHeight || bodyFrame.videoHeight || bodyFrame.height) || 0
                : 0;
            const canOpenLongBody = bodyHeight > 0 && bodyHeight < LONG_BODY_OPEN_HEIGHT_LIMIT;
            const tailParam = getTailParamForSelectedBody();
            if (!tailParam) {
                return {
                    eligible: canOpenLongBody,
                    state: 'unset',
                    frame: null,
                    name: '',
                    bodyHeight
                };
            }
            const resolved = resolveTextureParam(selected.keys || getActiveKeyCount(), tailParam);
            const frames = resolveTextureParamFrames(selected.keys || getActiveKeyCount(), tailParam);
            const frame = (frames && frames[0]) || (resolved && resolved.img) || null;
            const transparentTail = !frame || (
                !!frame._isBlankPlaceholder ||
                isFullyTransparentImage(frame, 48, 36)
            );
            return {
                eligible: canOpenLongBody,
                state: resolved ? resolved.state : 'unset',
                frame: transparentTail ? null : frame,
                name: resolved ? resolved.name : '',
                bodyHeight,
                isTailTransparent: transparentTail
            };
        }

        function getLongBodySessionKey(selected = state.selected) {
            if (!selected || !selected.p) return null;
            return `${getActiveKeyCount()}|${selected.p.key}`;
        }

        function updateLongBodyControlValues() {
            const composer = state.longBodyComposer;
            const coverageInput = byId('textureImageLongBodyCoverage');
            const targetInput = byId('textureImageLongBodyTargetHeight');
            const fadeInput = byId('textureImageLongBodyFade');
            const fadeValue = byId('textureImageLongBodyFadeValue');
            const presetSelect = byId('textureImageLongBodyPreset');
            const presetHeightInput = byId('textureImageLongBodyPresetHeight');
            const isTailTransparent = !composer.tailFrame ||
                !!composer.tailFrame._isBlankPlaceholder ||
                (typeof isFullyTransparentImage === 'function' && isFullyTransparentImage(composer.tailFrame, 48, 36));

            if (coverageInput) {
                coverageInput.max = String(composer.targetHeight);
                coverageInput.value = String(composer.coverage);
            }
            if (targetInput) targetInput.value = String(composer.targetHeight);
            if (fadeInput) {
                fadeInput.value = String(composer.fade);
                updateTextureRangeFill(fadeInput);
            }
            if (fadeValue) fadeValue.textContent = `${Math.round(composer.fade)}%`;

            if (presetSelect) {
                presetSelect.disabled = !composer.active || !isTailTransparent;
                if (!isTailTransparent) {
                    presetSelect.value = 'none';
                    presetSelect.title = '当前长条尾部非透明（使用尾部贴图），仅在尾部透明时可用';
                } else {
                    presetSelect.value = composer.tailPreset || 'none';
                    presetSelect.title = '';
                }
            }
            if (presetHeightInput) {
                const isPresetActive = isTailTransparent && (composer.tailPreset === 'sharp' || composer.tailPreset === 'round');
                presetHeightInput.disabled = !composer.active || !isPresetActive;
                const defaultHeight = (composer.baseFrames && composer.baseFrames[0] && typeof getLongBodyDefaultPresetHeight === 'function')
                    ? getLongBodyDefaultPresetHeight(composer.baseFrames[0])
                    : 50;
                presetHeightInput.value = String(composer.presetHeight || (isPresetActive ? defaultHeight : 0));
            }
        }

        function updateLongBodyComposerUI() {
            const section = byId('textureImageLongBodySection');
            if (!section) return;
            const isBody = isHoldBodySelected();
            section.style.display = isBody ? '' : 'none';
            if (!isBody) return;

            const toggle = byId('textureImageLongBodyEnable');
            const controls = byId('textureImageLongBodyControls');
            const status = byId('textureImageLongBodyStatus');
            const composer = state.longBodyComposer;
            const info = getLongBodySourceInfo();

            if (toggle) {
                toggle.checked = composer.active;
                toggle.disabled = !composer.active && !info.eligible;
            }
            if (controls) controls.style.display = composer.active ? 'block' : 'none';
            if (status) {
                status.classList.toggle('is-ready', composer.active || info.eligible);
                if (composer.active) {
                    status.textContent = `已开启：将生成 ${composer.targetHeight}px 高身体，并把 NoteBodyStyle 设为 1。如需修改裁切、拉伸、RGB 等基础参数，请先关闭一键投皮。`;
                } else if (info.eligible) {
                    status.textContent = `当前长条身体高度为 ${info.bodyHeight}px，小于 ${LONG_BODY_OPEN_HEIGHT_LIMIT}px，可开启一键投皮。`;
                } else if (info.bodyHeight > 0) {
                    status.textContent = `当前长条身体高度为 ${info.bodyHeight}px，需小于 ${LONG_BODY_OPEN_HEIGHT_LIMIT}px 才能开启一键投皮。`;
                } else {
                    status.textContent = `当前未读取到长条身体高度，需小于 ${LONG_BODY_OPEN_HEIGHT_LIMIT}px 才能开启一键投皮。`;
                }
            }
            updateLongBodyControlValues();
            updateImageTransformControlAvailability();
            updateRgbAdjustmentControlAvailability();
            updateSelectionSummary();
        }

        function setNoteBodyStyleOne(recordUndo = false, applyAll = true) {
            if (!state.selected) return;
            const keys = state.selected.keys || getActiveKeyCount();
            const cfg = getManiaConfigForKeys(keys);
            if (!cfg) return;
            if (!state.longBodyComposer.previousNoteBodyStyle) {
                const column = getSelectedTrackIndex();
                state.longBodyComposer.previousNoteBodyStyle = {
                    global: cfg.NoteBodyStyle,
                    column,
                    columnValue: column != null && Array.isArray(cfg.NoteBodyStyles)
                        ? cfg.NoteBodyStyles[column]
                        : null,
                    columns: Array.isArray(cfg.NoteBodyStyles)
                        ? cfg.NoteBodyStyles.slice()
                        : null
                };
            }
            if (recordUndo) recordSkinUndoBeforeChange('一键投皮: NoteBodyStyle = 1');
            cfg.NoteBodyStyle = 1;
            if (!Array.isArray(cfg.NoteBodyStyles)) cfg.NoteBodyStyles = [];
            if (applyAll) {
                for (let i = 0; i < keys; i++) {
                    cfg.NoteBodyStyles[i] = 1;
                }
            } else {
                const column = getSelectedTrackIndex();
                if (column != null) cfg.NoteBodyStyles[column] = 1;
            }
            const rawTextarea = document.getElementById('rawIniTextarea');
            if (rawTextarea && typeof generateSkinIniText === 'function') {
                rawTextarea.value = generateSkinIniText();
            }
            if (typeof renderSkinEditorParams === 'function') renderSkinEditorParams();
            drawFrame();
        }

        function restoreNoteBodyStyle() {
            const previous = state.longBodyComposer.previousNoteBodyStyle;
            if (!previous || !state.selected) return;
            const keys = state.selected.keys || getActiveKeyCount();
            const cfg = getManiaConfigForKeys(keys);
            if (!cfg) return;
            cfg.NoteBodyStyle = previous.global;
            if (previous.columns) {
                cfg.NoteBodyStyles = previous.columns.slice();
            } else if (previous.column != null) {
                if (!Array.isArray(cfg.NoteBodyStyles)) cfg.NoteBodyStyles = [];
                cfg.NoteBodyStyles[previous.column] = previous.columnValue;
            }
            const rawTextarea = document.getElementById('rawIniTextarea');
            if (rawTextarea && typeof generateSkinIniText === 'function') {
                rawTextarea.value = generateSkinIniText();
            }
            if (typeof renderSkinEditorParams === 'function') renderSkinEditorParams();
            drawFrame();
        }
