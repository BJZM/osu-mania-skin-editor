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

            if (range) range.value = String(zoom);
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
            const p = state.selected && state.selected.p;
            if (!p) return false;
            return p._trackLookup === LML.HoldNoteBodyImage ||
                /^holdnotebodyimage/i.test(p.key || '') ||
                /^noteimage\d*l$/i.test(p.key || '');
        }

        function getSelectedTrackIndex() {
            const p = state.selected && state.selected.p;
            if (!p) return null;
            if (p._trackCol != null) return Number(p._trackCol);
            const match = String(p.key || '').match(/^noteimage(\d+)l$/i);
            return match ? Number(match[1]) : null;
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

        function getLongBodyTailInfo() {
            const selected = state.selected;
            if (!selected) return { eligible: false, state: 'unset', frame: null, name: '' };
            const tailParam = getTailParamForSelectedBody();
            if (!tailParam) return { eligible: true, state: 'unset', frame: null, name: '' };
            const resolved = resolveTextureParam(selected.keys || getActiveKeyCount(), tailParam);
            const frames = resolveTextureParamFrames(selected.keys || getActiveKeyCount(), tailParam);
            const frame = (frames && frames[0]) || (resolved && resolved.img) || null;
            const transparent = !!frame && (
                !!frame._isBlankPlaceholder ||
                isFullyTransparentImage(frame, 48, 36)
            );
            const hasOpaqueTail = !!(resolved && resolved.state === 'ok' && frame && !transparent);
            return {
                eligible: hasOpaqueTail,
                state: resolved ? resolved.state : 'unset',
                frame,
                name: resolved ? resolved.name : ''
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
            if (coverageInput) {
                coverageInput.max = String(composer.targetHeight);
                coverageInput.value = String(composer.coverage);
            }
            if (targetInput) targetInput.value = String(composer.targetHeight);
            if (fadeInput) fadeInput.value = String(composer.fade);
            if (fadeValue) fadeValue.textContent = `${Math.round(composer.fade)}%`;
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
            const info = getLongBodyTailInfo();

            if (toggle) {
                toggle.checked = composer.active;
                toggle.disabled = !composer.active && !info.eligible;
            }
            if (controls) controls.style.display = composer.active ? 'block' : 'none';
            if (status) {
                status.classList.toggle('is-ready', composer.active || info.eligible);
                if (composer.active) {
                    status.textContent = `已开启：将生成 ${composer.targetHeight}px 高身体，并把 NoteBodyStyle 设为 1。`;
                } else if (info.eligible) {
                    status.textContent = '当前轨道已找到不透明长条尾部，可开启一键投皮。';
                } else if (info.frame && isFullyTransparentImage(info.frame, 48, 36)) {
                    status.textContent = '当前轨道长条尾部为透明贴图，无法开启一键投皮。';
                } else {
                    status.textContent = '当前轨道未找到不透明长条尾部，无法开启一键投皮。';
                }
            }
            updateLongBodyControlValues();
            updateImageTransformControlAvailability();
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
