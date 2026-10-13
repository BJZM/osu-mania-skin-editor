// ============================================================================
// texture-image-editor.js - 裁剪贴图与透明扩边编辑器
// 依赖：ui/texture-resolve.js、ui/texture-upload.js、parser/skin-assets.js
// ============================================================================

        let textureImageEditorUi = null;

        function initTextureImageEditorUI() {
            const MAX_TEXTURE_DIMENSION = 50000;
            const MAX_TEXTURE_PIXELS = 64 * 1024 * 1024;
            const PREVIEW_ZOOM_MIN = 0.1;
            const PREVIEW_ZOOM_MAX = 4;
            const PREVIEW_ZOOM_STEP = 0.1;
            const LONG_BODY_DEFAULT_HEIGHT = 40000;
            const LONG_BODY_PREVIEW_HEIGHT = 800;
            const LONG_BODY_FADE_MAX = 100;
            const longBodyComposerSessions = new Map();

            function createEditorState() {
                return {
                    selected: null,
                    originalFrames: [],
                    workingFrames: [],
                    previewFrames: [],
                    cropRect: null,
                    previewViewport: null,
                    cropDragState: null,
                    previewPanState: null,
                    previewSnapshot: null,
                    livePreviewTimer: null,
                    previewZoom: 1,
                    previewBaseViewport: null,
                    snapGuides: null,
                    contentBoundsCache: null,
                    editorUndoStack: [],
                    editorRedoStack: [],
                    editorHistoryTransaction: null,
                    editorHistoryTimer: null,
                    longBodyComposer: {
                        active: false,
                        sessionKey: null,
                        baseFrames: [],
                        tailFrame: null,
                        bodySourceName: '',
                        tailSourceName: '',
                        tailScaledHeight: 0,
                        targetHeight: LONG_BODY_DEFAULT_HEIGHT,
                        coverage: 0,
                        fade: 0,
                        previousNoteBodyStyle: null
                    },
                    longBodyRegenerateTimer: null,
                    longBodyDragState: null
                };
            }

            const menuState = createEditorState();
            const menuTab = { id: 'menu', kind: 'menu', title: '菜单', state: menuState };
            let state = menuState;
            let editorBaseSnapshot = null;
            let tabs = [menuTab];
            let activeTabId = menuTab.id;
            let nextTextureTabId = 1;

            const byId = (id) => document.getElementById(id);
            const MAX_EDITOR_HISTORY = 40;

            function getTabById(tabId) {
                return tabs.find((tab) => tab.id === tabId) || null;
            }

            function getActiveTab() {
                return getTabById(activeTabId);
            }

            function getTextureTabs() {
                return tabs.filter((tab) => tab.kind === 'texture');
            }

            function getTabTitle(tab) {
                if (!tab) return '';
                if (tab.kind === 'menu') return '菜单';
                const target = tab.target || {};
                const p = target.p || {};
                const base = target.base || (target.resolved && target.resolved.name) || p.default || '';
                return base ? `${p.zhName || p.key || '贴图'} · ${base}` : (p.zhName || p.key || '贴图');
            }

            function isTabDirty(tab) {
                if (!tab || tab.kind !== 'texture' || !tab.state.selected) return false;
                const tabState = tab.state;
                return tabState.longBodyComposer.active ||
                    !!tabState.editorHistoryTransaction ||
                    tabState.editorUndoStack.length > 0;
            }

            function clearEditorStateTimers(editorState) {
                if (!editorState) return;
                if (editorState.livePreviewTimer) {
                    clearTimeout(editorState.livePreviewTimer);
                    editorState.livePreviewTimer = null;
                }
                if (editorState.longBodyRegenerateTimer) {
                    clearTimeout(editorState.longBodyRegenerateTimer);
                    editorState.longBodyRegenerateTimer = null;
                }
                if (editorState.editorHistoryTimer) {
                    clearTimeout(editorState.editorHistoryTimer);
                    editorState.editorHistoryTimer = null;
                }
            }

            function renderTabs() {
                const list = byId('textureImageTabList');
                if (!list) return;
                list.innerHTML = '';

                for (const tab of tabs) {
                    const tabEl = document.createElement('div');
                    tabEl.className = 'texture-image-tab';
                    tabEl.dataset.tabId = tab.id;
                    if (tab.target && tab.target.p) {
                        tabEl.dataset.paramKey = tab.target.p.key;
                    }
                    tabEl.setAttribute('role', 'tab');
                    tabEl.setAttribute('aria-selected', String(tab.id === activeTabId));
                    tabEl.tabIndex = tab.id === activeTabId ? 0 : -1;
                    if (tab.id === activeTabId) tabEl.classList.add('is-active');

                    const label = document.createElement('span');
                    label.className = 'texture-image-tab-label';
                    label.textContent = tab.kind === 'menu' ? '菜单' : (tab.target && tab.target.p
                        ? tab.target.p.zhName
                        : tab.title);
                    label.title = getTabTitle(tab);
                    tabEl.appendChild(label);

                    if (isTabDirty(tab)) {
                        const dirty = document.createElement('span');
                        dirty.className = 'texture-image-tab-dirty';
                        dirty.title = '有未保存的编辑';
                        tabEl.appendChild(dirty);
                    }

                    tabEl.addEventListener('click', () => activateTab(tab.id));
                    tabEl.addEventListener('keydown', (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        activateTab(tab.id);
                    });

                    if (tab.kind !== 'menu') {
                        const close = document.createElement('button');
                        close.type = 'button';
                        close.className = 'texture-image-tab-close';
                        close.title = `关闭 ${label.textContent}`;
                        close.setAttribute('aria-label', `关闭 ${label.textContent}`);
                        close.textContent = '✕';
                        close.addEventListener('click', (event) => {
                            event.stopPropagation();
                            closeTab(tab.id);
                        });
                        tabEl.appendChild(close);
                    }

                    list.appendChild(tabEl);
                }
            }

            function flushActiveTabState() {
                const tab = getActiveTab();
                if (!tab || tab.kind !== 'texture') return false;
                if (state.longBodyRegenerateTimer) {
                    clearTimeout(state.longBodyRegenerateTimer);
                    state.longBodyRegenerateTimer = null;
                    regenerateLongBodyComposite();
                }
                return commitEditorHistory();
            }

            function commitActiveTabState() {
                return flushActiveTabState();
            }

            function syncActiveTabView() {
                const tab = getActiveTab();
                renderTabs();

                if (!tab || tab.kind === 'menu') {
                    setViews(true);
                    updateSelectionSummary();
                    updateEditorHistoryButtons();
                    updateStretchFixUI();
                    return;
                }

                updateCropInputs(state.cropRect);
                updatePreviewZoomControls();
                updateSelectionSummary();
                updateLongBodyComposerUI();
                updateEditorHistoryButtons();
                if (state.selected && state.previewFrames.length > 0) {
                    installFramesToStores(state.previewFrames, state.selected, { persist: false });
                }
                setViews(false);
                updateMeta();
            }

            function activateTab(tabId, options = {}) {
                const nextTab = getTabById(tabId);
                if (!nextTab) return false;
                if (!options.force && nextTab.id === activeTabId) {
                    renderTabs();
                    return true;
                }

                const currentTab = getActiveTab();
                if (currentTab && currentTab.kind === 'texture') {
                    flushActiveTabState();
                    if (currentTab.state.previewSnapshot) {
                        applySkinSnapshot(currentTab.state.previewSnapshot);
                    }
                }

                activeTabId = nextTab.id;
                state = nextTab.kind === 'menu' ? menuState : nextTab.state;
                syncActiveTabView();
                return true;
            }

            function updateEditorBaseAfterSave() {
                editorBaseSnapshot = createSkinSnapshot('贴图编辑基线');
                for (const tab of getTextureTabs()) {
                    tab.state.previewSnapshot = editorBaseSnapshot;
                }
            }

            function removeTab(tabId, options = {}) {
                const index = tabs.findIndex((tab) => tab.id === tabId);
                if (index < 0) return false;
                const tab = tabs[index];
                if (tab.kind === 'menu') return false;

                const wasActive = tab.id === activeTabId;
                clearEditorStateTimers(tab.state);
                if (wasActive && options.restorePreview !== false && tab.state.previewSnapshot) {
                    applySkinSnapshot(tab.state.previewSnapshot);
                }

                tabs.splice(index, 1);
                if (!wasActive) {
                    renderTabs();
                    return true;
                }

                const nextIndex = Math.min(index, tabs.length - 1);
                const nextTab = tabs[Math.max(0, nextIndex)] || menuTab;
                activeTabId = '';
                return activateTab(nextTab.id, { force: true });
            }

            function finalizeEditorClose() {
                for (const tab of tabs) {
                    if (tab.kind === 'texture') clearEditorStateTimers(tab.state);
                }
                if (editorBaseSnapshot) {
                    applySkinSnapshot(editorBaseSnapshot);
                }

                Object.assign(menuState, createEditorState());
                menuState.previewSnapshot = null;
                state = menuState;
                tabs = [menuTab];
                activeTabId = menuTab.id;
                editorBaseSnapshot = null;

                const modal = byId('textureImageEditorModal');
                if (modal) {
                    modal.classList.remove('active');
                    modal.style.display = 'none';
                }
                renderTabs();
                setViews(true);
                updateSelectionSummary();
                updateEditorHistoryButtons();
                updateStretchFixUI();
            }

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
                drawTailForLongBody(ctx, composer.tailFrame, base.width, composer.coverage);
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

            function requestLongBodyApplyScope() {
                const modal = byId('textureImageApplyScopeModal');
                if (!modal) return Promise.resolve('current');
                const currentBtn = byId('textureImageApplyScopeCurrentBtn');
                const allBtn = byId('textureImageApplyScopeAllBtn');
                const cancelBtn = byId('textureImageApplyScopeCancelBtn');
                const backdrop = byId('textureImageApplyScopeBackdrop');
                return new Promise((resolve) => {
                    const finish = (scope) => {
                        modal.style.display = 'none';
                        if (currentBtn) currentBtn.onclick = null;
                        if (allBtn) allBtn.onclick = null;
                        if (cancelBtn) cancelBtn.onclick = null;
                        if (backdrop) backdrop.onclick = null;
                        window.removeEventListener('keydown', onKeyDown, true);
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
                drawTailForLongBody(ctx, source.tailFrame, base.width, coverage);
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

            function normalizeLongBodyTextureSourceName(value) {
                return String(value || '')
                    .trim()
                    .replace(/\.(png|jpg|jpeg)$/i, '')
                    .replace(/@2x$/i, '')
                    .replace(/\\/g, '/')
                    .toLowerCase();
            }

            function getLongBodySourceFrameKey(frame) {
                if (!frame || (typeof frame !== 'object' && typeof frame !== 'function')) return '';
                let id = longBodySourceFrameIds.get(frame);
                if (!id) {
                    id = nextLongBodySourceFrameId++;
                    longBodySourceFrameIds.set(frame, id);
                }
                return `frame:${id}`;
            }

            function getLongBodyTextureSourceKey(sourceName, frame) {
                const normalized = normalizeLongBodyTextureSourceName(sourceName);
                return normalized ? `name:${normalized}` : getLongBodySourceFrameKey(frame);
            }

            function getLongBodyParamForTrack(lookup, column) {
                return getTextureTabParams().find((p) =>
                    p._trackLookup === lookup && Number(p._trackCol) === Number(column)
                ) || null;
            }

            function readLongBodyTrackSource(column) {
                const keys = getActiveKeyCount();
                const bodyParam = getLongBodyParamForTrack(LML.HoldNoteBodyImage, column);
                const tailParam = getLongBodyParamForTrack(LML.HoldNoteTailImage, column);
                const bodyResolved = bodyParam ? resolveTextureParam(keys, bodyParam) : null;
                const tailResolved = tailParam ? resolveTextureParam(keys, tailParam) : null;
                const bodyFrames = bodyParam ? resolveTextureParamFrames(keys, bodyParam) : null;
                const tailFrames = tailParam ? resolveTextureParamFrames(keys, tailParam) : null;
                const bodyFrame = (bodyFrames && bodyFrames[0]) || (bodyResolved && bodyResolved.img) || null;
                const tailFrame = (tailFrames && tailFrames[0]) || (tailResolved && tailResolved.img) || null;
                return {
                    baseFrames: bodyFrame && !bodyFrame._isBlankPlaceholder ? [bodyFrame] : [],
                    bodySourceName: bodyResolved ? bodyResolved.name : '',
                    tailFrame: tailFrame && !tailFrame._isBlankPlaceholder ? tailFrame : null,
                    tailSourceName: tailResolved ? tailResolved.name : ''
                };
            }

            function getLongBodyComposerSource() {
                const composer = state.longBodyComposer;
                return {
                    baseFrames: composer.baseFrames,
                    bodySourceName: composer.bodySourceName,
                    tailFrame: composer.tailFrame,
                    tailSourceName: composer.tailSourceName
                };
            }

            function getLongBodyApplyPlan(column, selectedColumn, selectedSource) {
                const session = column === selectedColumn
                    ? null
                    : longBodyComposerSessions.get(`${getActiveKeyCount()}|NoteImage${column}L`);
                const source = column === selectedColumn
                    ? getLongBodyComposerSource()
                    : (session && session.baseFrames && session.baseFrames.length > 0
                        ? {
                            baseFrames: session.baseFrames,
                            bodySourceName: session.bodySourceName || '',
                            tailFrame: session.tailFrame || null,
                            tailSourceName: session.tailSourceName || ''
                        }
                        : readLongBodyTrackSource(column));
                const sourceKey = getLongBodyTextureSourceKey(
                    source.bodySourceName,
                    source.baseFrames && source.baseFrames[0]
                ) || `track:${column}`;
                const selectedSourceKey = getLongBodyTextureSourceKey(
                    selectedSource.bodySourceName,
                    selectedSource.baseFrames && selectedSource.baseFrames[0]
                ) || `track:${selectedColumn}`;
                const reusesSelectedOutput = sourceKey === selectedSourceKey;
                const compositeSource = reusesSelectedOutput ? selectedSource : source;
                return {
                    column,
                    sourceKey,
                    reusesSelectedOutput,
                    baseFrames: compositeSource.baseFrames || [],
                    bodySourceName: compositeSource.bodySourceName || '',
                    tailFrame: compositeSource.tailFrame || null,
                    tailSourceName: compositeSource.tailSourceName || ''
                };
            }

            function createLongBodyApplyPlans(columns) {
                const selectedColumn = getSelectedTrackIndex();
                const selectedSource = getLongBodyComposerSource();
                const targetColumns = columns.length > 0
                    ? columns
                    : [selectedColumn].filter((column) => column != null);
                return targetColumns.map((column) =>
                    getLongBodyApplyPlan(column, selectedColumn, selectedSource)
                );
            }

            function getLongBodyGeneratedBaseName(column) {
                return `longbody-body_col${Number(column) + 1}L`;
            }

            function setLongBodyTrackReference(column, base) {
                if (!base) return false;
                const keys = getActiveKeyCount();
                let cfg = maniaSkinConfigurations.get(keys);
                if (!cfg) {
                    cfg = ensureManiaConfigForKeys(keys);
                    maniaSkinConfigurations.set(keys, cfg);
                }
                if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
                for (const alias of getTextureParamAliases(`NoteImage${column}L`, keys)) {
                    cfg[alias] = base;
                    cfg.ImageLookups.set(alias, base);
                    cfg.ImageLookups.set(alias.toLowerCase(), base);
                }
                if (typeof syncParamInputValue === 'function') {
                    syncParamInputValue(`NoteImage${column}L`, base);
                }
                return true;
            }

            function enableLongBodyComposer(session = null) {
                if (!isHoldBodySelected()) return false;
                const info = session ? null : getLongBodyTailInfo();
                if (!session && info && !info.eligible) {
                    showToast('无法开启', '当前轨道需要先配置一张不透明的长条尾部贴图。');
                    updateLongBodyComposerUI();
                    return false;
                }
                const composer = state.longBodyComposer;
                composer.active = true;
                composer.sessionKey = getLongBodySessionKey();
                composer.baseFrames = (session ? session.baseFrames : state.workingFrames).map(cloneFrame);
                composer.tailFrame = session && session.tailFrame
                    ? cloneFrame(session.tailFrame)
                    : (info && info.frame ? cloneFrame(info.frame) : null);
                composer.bodySourceName = session
                    ? (session.bodySourceName || '')
                    : ((state.selected.resolved && state.selected.resolved.name) || state.selected.base || '');
                composer.tailSourceName = session
                    ? (session.tailSourceName || '')
                    : ((info && info.name) || '');
                composer.tailScaledHeight = composer.tailFrame
                    ? Math.max(1, Math.round(composer.tailFrame.height * composer.baseFrames[0].width / Math.max(1, composer.tailFrame.width)))
                    : 0;
                composer.targetHeight = session ? session.targetHeight : LONG_BODY_DEFAULT_HEIGHT;
                composer.coverage = session
                    ? session.coverage
                    : (composer.tailScaledHeight || Math.min(120, composer.baseFrames[0].height));
                composer.fade = session ? session.fade : 0;
                composer.previousNoteBodyStyle = null;
                state.previewBaseViewport = null;
                state.previewViewport = null;
                setNoteBodyStyleOne(false, false);
                regenerateLongBodyComposite();
                updateLongBodyComposerUI();
                renderTabs();
                return true;
            }

            function disableLongBodyComposer() {
                const composer = state.longBodyComposer;
                if (!composer.active) return;
                const baseFrames = composer.baseFrames.length > 0
                    ? composer.baseFrames.map(cloneFrame)
                    : state.originalFrames.map(cloneFrame);
                composer.active = false;
                state.workingFrames = baseFrames;
                state.previewFrames = baseFrames.map(cloneFrame);
                restoreNoteBodyStyle();
                resetTransformInputs();
                installFramesToStores(state.previewFrames, state.selected, { persist: false });
                updateMeta();
                updateLongBodyComposerUI();
                renderTabs();
            }

            function persistLongBodyComposerSessions(plans, settings) {
                if (!plans || plans.length === 0 || !settings) return;
                const keys = getActiveKeyCount();
                for (const plan of plans) {
                    if (!plan || !plan.baseFrames || plan.baseFrames.length === 0) continue;
                    longBodyComposerSessions.set(`${keys}|NoteImage${plan.column}L`, {
                        baseFrames: plan.baseFrames.map(cloneFrame),
                        tailFrame: plan.tailFrame ? cloneFrame(plan.tailFrame) : null,
                        bodySourceName: plan.bodySourceName || '',
                        tailSourceName: plan.tailSourceName || '',
                        targetHeight: settings.targetHeight,
                        coverage: settings.coverage,
                        fade: settings.fade
                    });
                }
            }

            async function applyLongBodyToTracks(bodyFrame, plans, settings, onProgress) {
                if (!bodyFrame || !textureUploadUi || typeof textureUploadUi.applyEditedTexture !== 'function') return false;
                const targetPlans = plans && plans.length > 0
                    ? plans
                    : createLongBodyApplyPlans([]);
                const generatedAssets = new Map();
                for (let index = 0; index < targetPlans.length; index++) {
                    const plan = targetPlans[index];
                    const column = plan.column;
                    const pKey = `NoteImage${column}L`;
                    // 同一来源只保留一份生成资产，后续同源轨道直接复用该引用。
                    const existingAsset = generatedAssets.get(plan.sourceKey);
                    if (existingAsset) {
                        if (!setLongBodyTrackReference(column, existingAsset.base)) return false;
                    } else {
                        let serialized = plan.reusesSelectedOutput ? bodyFrame : null;
                        if (!serialized) {
                            const source = {
                                baseFrames: plan.baseFrames,
                                tailFrame: plan.tailFrame,
                                targetHeight: settings.targetHeight,
                                coverage: settings.coverage,
                                fade: settings.fade
                            };
                            const generated = await buildLongBodyCompositeForSourceAsync(
                                source,
                                settings.targetHeight
                            );
                            if (!generated) return false;
                            serialized = await serializeLongBodyFrame(generated);
                        }
                        const applied = await textureUploadUi.applyEditedTexture(
                            new File([serialized.blob], 'longbody-body.png', { type: 'image/png' }),
                            serialized.arrayBuffer,
                            serialized.img,
                            !!serialized.img._is2x,
                            'longbody-body',
                            pKey,
                            pKey,
                            column,
                            { recordUndo: false, notify: false, refresh: false }
                        );
                        if (!applied) return false;
                        generatedAssets.set(plan.sourceKey, {
                            serialized,
                            base: getLongBodyGeneratedBaseName(column)
                        });
                    }
                    if (onProgress) onProgress(82 + ((index + 1) / targetPlans.length) * 8);
                    await waitForUiPaint();
                }
                return true;
            }

            async function applyTransparentTailsToTracks(columns, onProgress) {
                if (!textureUploadUi || typeof textureUploadUi.applyEditedTexture !== 'function') return false;
                const transparent = document.createElement('canvas');
                transparent.width = 1;
                transparent.height = 1;
                const blob = await canvasToBlob(transparent);
                const arrayBuffer = await blob.arrayBuffer();
                const img = await loadImageFromBlob(blob);
                img._is2x = false;
                const targetColumns = columns.length > 0 ? columns : [getSelectedTrackIndex()].filter((v) => v != null);
                for (let index = 0; index < targetColumns.length; index++) {
                    const column = targetColumns[index];
                    const pKey = `NoteImage${column}T`;
                    const applied = await textureUploadUi.applyEditedTexture(
                        new File([blob], 'longbody-tail-transparent.png', { type: 'image/png' }),
                        arrayBuffer,
                        img,
                        false,
                        'longbody-tail-transparent',
                        pKey,
                        pKey,
                        column,
                        { recordUndo: false, notify: false, refresh: false }
                    );
                    if (!applied) return false;
                    if (onProgress) onProgress(92 + ((index + 1) / targetColumns.length) * 6);
                    await waitForUiPaint();
                }
                return true;
            }

            function captureEditorHistoryState() {
                return {
                    workingFrames: state.workingFrames.slice(),
                    cropRect: state.cropRect ? { ...state.cropRect } : null
                };
            }

            function editorHistoryStatesEqual(a, b) {
                if (!a || !b) return false;
                const aRect = a.cropRect;
                const bRect = b.cropRect;
                const rectsEqual = aRect === bRect || (
                    aRect && bRect &&
                    aRect.x === bRect.x &&
                    aRect.y === bRect.y &&
                    aRect.width === bRect.width &&
                    aRect.height === bRect.height
                );
                if (!rectsEqual) return false;
                if (a.workingFrames.length !== b.workingFrames.length) return false;
                return a.workingFrames.every((frame, index) => frame === b.workingFrames[index]);
            }

            function updateEditorHistoryButtons() {
                const undoBtn = byId('textureImageUndoBtn');
                const redoBtn = byId('textureImageRedoBtn');
                const undoEntry = state.editorUndoStack[state.editorUndoStack.length - 1];
                const redoEntry = state.editorRedoStack[state.editorRedoStack.length - 1];

                if (undoBtn) {
                    undoBtn.disabled = state.editorUndoStack.length === 0;
                    undoBtn.title = undoEntry
                        ? `撤回: ${undoEntry.desc} (Ctrl+Z)`
                        : '暂无可撤回的贴图编辑 (Ctrl+Z)';
                }
                if (redoBtn) {
                    redoBtn.disabled = state.editorRedoStack.length === 0;
                    redoBtn.title = redoEntry
                        ? `重做: ${redoEntry.desc} (Ctrl+Y / Ctrl+Shift+Z)`
                        : '暂无可重做的贴图编辑 (Ctrl+Y / Ctrl+Shift+Z)';
                }
                renderTabs();
            }

            function resetEditorHistory() {
                if (state.editorHistoryTimer) {
                    clearTimeout(state.editorHistoryTimer);
                    state.editorHistoryTimer = null;
                }
                state.editorUndoStack = [];
                state.editorRedoStack = [];
                state.editorHistoryTransaction = null;
                updateEditorHistoryButtons();
            }

            function beginEditorHistory(desc, options = {}) {
                const group = options.group || desc;
                if (state.editorHistoryTransaction && state.editorHistoryTransaction.group !== group) {
                    commitEditorHistory();
                }
                if (!state.editorHistoryTransaction) {
                    state.editorHistoryTransaction = {
                        desc,
                        group,
                        before: captureEditorHistoryState()
                    };
                }
                if (state.editorHistoryTimer) {
                    clearTimeout(state.editorHistoryTimer);
                    state.editorHistoryTimer = null;
                }
                if (options.autoCommitMs) {
                    state.editorHistoryTimer = setTimeout(() => {
                        state.editorHistoryTimer = null;
                        commitEditorHistory();
                    }, options.autoCommitMs);
                }
            }

            function commitEditorHistory() {
                if (state.editorHistoryTimer) {
                    clearTimeout(state.editorHistoryTimer);
                    state.editorHistoryTimer = null;
                }
                const transaction = state.editorHistoryTransaction;
                if (!transaction) return false;
                state.editorHistoryTransaction = null;

                if (state.livePreviewTimer) {
                    clearTimeout(state.livePreviewTimer);
                    state.livePreviewTimer = null;
                    refreshLivePreview();
                }
                const after = captureEditorHistoryState();
                if (editorHistoryStatesEqual(transaction.before, after)) {
                    updateEditorHistoryButtons();
                    return false;
                }

                state.editorUndoStack.push({
                    desc: transaction.desc,
                    state: transaction.before
                });
                if (state.editorUndoStack.length > MAX_EDITOR_HISTORY) {
                    state.editorUndoStack.shift();
                }
                state.editorRedoStack.length = 0;
                updateEditorHistoryButtons();
                return true;
            }

            function applyEditorHistoryState(snapshot) {
                if (!snapshot || !state.selected) return;
                state.workingFrames = snapshot.workingFrames.slice();
                state.cropRect = snapshot.cropRect ? { ...snapshot.cropRect } : null;
                updateCropInputs(state.cropRect);
                state.previewBaseViewport = null;
                state.previewViewport = null;
                state.snapGuides = null;
                state.contentBoundsCache = null;
                state.previewFrames = buildPreviewFrames();
                installFramesToStores(state.previewFrames, state.selected, { persist: false });
                updateMeta();
            }

            function undoEditorHistory() {
                const hadTransaction = !!state.editorHistoryTransaction;
                commitEditorHistory();
                if (state.editorUndoStack.length === 0) {
                    if (!hadTransaction) showToast('提示', '贴图编辑没有可撤回的操作');
                    return false;
                }
                const entry = state.editorUndoStack.pop();
                state.editorRedoStack.push({
                    desc: entry.desc,
                    state: captureEditorHistoryState()
                });
                applyEditorHistoryState(entry.state);
                updateEditorHistoryButtons();
                showToast('已撤回贴图编辑', `已撤回: ${entry.desc}`);
                return true;
            }

            function redoEditorHistory() {
                commitEditorHistory();
                if (state.editorRedoStack.length === 0) {
                    showToast('提示', '贴图编辑没有可重做的操作');
                    return false;
                }
                const entry = state.editorRedoStack.pop();
                state.editorUndoStack.push({
                    desc: entry.desc,
                    state: captureEditorHistoryState()
                });
                if (state.editorUndoStack.length > MAX_EDITOR_HISTORY) {
                    state.editorUndoStack.shift();
                }
                applyEditorHistoryState(entry.state);
                updateEditorHistoryButtons();
                showToast('已重做贴图编辑', `已重做: ${entry.desc}`);
                return true;
            }

            function cloneFrame(source) {
                const width = source.naturalWidth || source.videoWidth || source.width || 0;
                const height = source.naturalHeight || source.videoHeight || source.height || 0;
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(source, 0, 0);
                canvas._is2x = !!source._is2x;
                return canvas;
            }

            function stripTextureName(value) {
                return String(value || '')
                    .trim()
                    .replace(/\.(png|jpg|jpeg)$/i, '')
                    .replace(/@2x$/i, '')
                    .replace(/-\d+$/, '');
            }

            function getTargetBaseName(p, resolvedName) {
                let base = stripTextureName(resolvedName || p.default || p.key || 'texture');
                if (!base || isDummyBlankName(base)) base = stripTextureName(p.key || 'texture');

                if (p._trackCol == null) return base;

                const col = p._trackCol;
                const colRegex = new RegExp(`(?:col|track|轨)[-_]?${col + 1}\\b`, 'i');
                if (colRegex.test(base)) return base;

                const lookup = p._trackLookup;
                const suffix = (lookup === LML.HoldNoteHeadImage) ? 'H'
                    : (lookup === LML.HoldNoteBodyImage) ? 'L'
                    : (lookup === LML.HoldNoteTailImage) ? 'T'
                    : (lookup === LML.KeyImageDown) ? 'D'
                    : '';

                if (suffix && !base.toLowerCase().endsWith(suffix.toLowerCase())) {
                    return `${base}_col${col + 1}${suffix}`;
                }
                return `${base}_col${col + 1}`;
            }

            function getTextureTabParams() {
                const keys = getActiveKeyCount();
                const items = [];
                for (const schemaItem of SKIN_INI_PARAM_SCHEMA) {
                    if (schemaItem.tab !== 'textures' || schemaItem.type !== 'texture' || schemaItem.virtual) continue;
                    const expanded = expandPerTrackTextureParams(schemaItem, keys, true);
                    if (expanded && expanded.length > 0) items.push(...expanded);
                    else items.push(schemaItem);
                }
                return items;
            }

            function buildEditorTarget(p) {
                const keys = getActiveKeyCount();
                const resolved = resolveTextureParam(keys, p);
                let frames = resolveTextureParamFrames(keys, p);
                if ((!frames || frames.length === 0) && resolved && resolved.img) {
                    frames = [resolved.img];
                }
                const usableFrames = (frames || []).filter((frame) => {
                    const w = frame.naturalWidth || frame.videoWidth || frame.width || 0;
                    const h = frame.naturalHeight || frame.videoHeight || frame.height || 0;
                    return w > 1 && h > 1 && !frame._isBlankPlaceholder;
                });

                return {
                    p,
                    keys,
                    resolved,
                    frames: usableFrames,
                    selectable: usableFrames.length > 0,
                    base: getTargetBaseName(p, resolved && resolved.name),
                    state: resolved ? resolved.state : 'unset'
                };
            }

            function getParamTrackIndex(p) {
                if (p && p._trackCol != null) return Number(p._trackCol);
                const match = String((p && p.key) || '').match(
                    /(?:NoteImage|HoldNoteHeadImage|HoldNoteBodyImage|HoldNoteTailImage|KeyImageDown|KeyImage|StageHint|HitTarget)(\d+)/i
                );
                return match ? Number(match[1]) : null;
            }

            function getConfiguredColumnWidth(keys, columnIndex) {
                const res = getManiaSkinConfig(keys, LML.ColumnWidth, columnIndex);
                return (res && Number(res.value) > 0) ? Number(res.value) : 30;
            }

            function getUniformResizeResult(frame, target) {
                if (!frame || !target || (target.axis !== 'width' && target.axis !== 'height')) return null;
                const current = target.axis === 'width' ? frame.width : frame.height;
                if (!(current > 0) || !(target.size > 0)) return null;
                const scale = target.size / current;
                return {
                    width: Math.max(1, Math.round(frame.width * scale)),
                    height: Math.max(1, Math.round(frame.height * scale))
                };
            }

            function getStretchFixTarget(selected, frame) {
                if (!selected || !frame) return null;
                const p = selected.p;
                const rawKey = String(p.key || '');
                const key = rawKey.toLowerCase();
                const keys = selected.keys || getActiveKeyCount();
                const dpr = frame._is2x ? 2 : 1;
                const trackIndex = getParamTrackIndex(p);
                const columnIndex = trackIndex != null ? trackIndex : 0;
                const rawColW = getConfiguredColumnWidth(keys, columnIndex);

                if (key.startsWith('keyimage')) {
                    const multiplier = dpr === 2 ? 3.2 : 1.6;
                    return {
                        axis: 'width',
                        size: Math.round(rawColW * multiplier),
                        label: '固定宽度',
                        detail: `按键横向拉满 ${rawColW}px 轨道，源图宽度需匹配 stable 的 ${multiplier} 倍列宽。`
                    };
                }

                if (key === 'stageleft' || key === 'stageright') {
                    const size = 768 * dpr;
                    return {
                        axis: 'height',
                        size,
                        label: '固定高度',
                        detail: `舞台边框横向保持原宽、纵向拉满画面；${dpr === 2 ? '@2x' : '1x'} 目标高度为 ${size}px。`
                    };
                }

                if (key === 'stagelight') {
                    const multiplier = dpr === 2 ? 3.2 : 1.6;
                    return {
                        axis: 'width',
                        size: Math.round(rawColW * multiplier),
                        label: '固定宽度',
                        detail: `按键光柱横向拉满第 ${columnIndex + 1} 轨（${rawColW}px）。各轨列宽不一致时需分别使用对应宽度的贴图。`
                    };
                }

                if (key === 'stagehint' || key === 'hittarget') {
                    const cfg = getManiaConfigForKeys(keys);
                    const stageWidth = Math.max(1, computeTrackBlockWidth480(cfg, keys));
                    return {
                        axis: 'width',
                        size: Math.round(stageWidth * dpr),
                        label: '固定宽度',
                        detail: `判定线光条横向覆盖 ${stageWidth}px 舞台宽度；开启双舞台且两侧宽度不一致时无法用单张贴图同时完全修复。`
                    };
                }

                if (/^(noteimage|holdnoteheadimage|holdnotetailimage)/i.test(rawKey)) {
                    return {
                        axis: null,
                        size: 0,
                        reason: '该贴图在 stable 中按原图宽高比计算高度，不需要通过改贴图尺寸修复单向拉伸。'
                    };
                }

                if (/^holdnotebodyimage/i.test(rawKey) || /^noteimage\d*l$/i.test(rawKey)) {
                    return {
                        axis: null,
                        size: 0,
                        reason: '长条身体在平铺模式下由 stable 等比计算；整段拉伸模式的高度由长条长度决定，需在画布中观察实际效果。'
                    };
                }

                return {
                    axis: null,
                    size: 0,
                    reason: '该贴图没有可自动计算的单轴拉伸规则。'
                };
            }

            function setViews(showPicker) {
                const picker = byId('textureImagePickerView');
                const editor = byId('textureImageEditorView');
                if (picker) picker.style.display = showPicker ? 'flex' : 'none';
                if (editor) editor.style.display = showPicker ? 'none' : 'flex';
            }

            function updateSelectionSummary() {
                const applyBtn = byId('textureImageApplyBtn');
                const resetBtn = byId('textureImageResetBtn');
                if (!state.selected) {
                    if (applyBtn) applyBtn.disabled = true;
                    if (resetBtn) resetBtn.disabled = true;
                    return;
                }

                if (applyBtn) applyBtn.disabled = false;
                if (resetBtn) resetBtn.disabled = false;
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
                updateCropInputs(state.cropRect);
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

                const left = offsetX + cropRect.x * scale;
                const top = offsetY + cropRect.y * scale;
                const width = Math.max(1, cropRect.width * scale);
                const height = Math.max(1, cropRect.height * scale);
                const right = left + width;
                const bottom = top + height;

                drawPreviewTransparencyBackground(ctx, left, top, width, height);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(
                    frame,
                    offsetX,
                    offsetY,
                    Math.max(1, frame.width * scale),
                    Math.max(1, frame.height * scale)
                );

                ctx.save();
                fillPreviewOutsideBounds(ctx, left, top, right, bottom);

                ctx.strokeStyle = 'rgba(255, 102, 170, 0.95)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(left, top, width, height);

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.lineWidth = 1;
                for (let i = 1; i <= 2; i++) {
                    const gx = left + width * i / 3;
                    const gy = top + height * i / 3;
                    ctx.beginPath();
                    ctx.moveTo(gx, top);
                    ctx.lineTo(gx, bottom);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(left, gy);
                    ctx.lineTo(right, gy);
                    ctx.stroke();
                }

                const handles = getCropHandlePoints(left, top, right, bottom);
                ctx.fillStyle = '#f4f4f5';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.lineWidth = 1;
                for (const point of Object.values(handles)) {
                    ctx.fillRect(point.x - 3.5, point.y - 3.5, 7, 7);
                    ctx.strokeRect(point.x - 3.5, point.y - 3.5, 7, 7);
                }

                if (state.snapGuides) {
                    ctx.setLineDash([5, 4]);
                    ctx.strokeStyle = 'rgba(120, 220, 255, 0.95)';
                    ctx.lineWidth = 1.25;
                    if (Number.isFinite(state.snapGuides.x)) {
                        const guideX = offsetX + state.snapGuides.x * scale;
                        ctx.beginPath();
                        ctx.moveTo(guideX, 0);
                        ctx.lineTo(guideX, canvas.height);
                        ctx.stroke();
                    }
                    if (Number.isFinite(state.snapGuides.y)) {
                        const guideY = offsetY + state.snapGuides.y * scale;
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

            function initializeTextureTab(tab) {
                const target = tab.target;
                state = tab.state;
                state.selected = target;
                const session = longBodyComposerSessions.get(getLongBodySessionKey(target));
                const sourceFrames = session && session.baseFrames
                    ? session.baseFrames
                    : target.frames;
                state.originalFrames = sourceFrames.map(cloneFrame);
                state.workingFrames = state.originalFrames.map(cloneFrame);
                state.previewFrames = state.workingFrames.map(cloneFrame);
                state.previewZoom = 1;
                state.previewBaseViewport = null;
                state.previewViewport = null;
                state.snapGuides = null;
                state.contentBoundsCache = null;
                state.longBodyComposer.active = false;
                state.previewSnapshot = editorBaseSnapshot || createSkinSnapshot('贴图编辑基线');
                resetTransformInputs();
                resetEditorHistory();
                if (session) {
                    enableLongBodyComposer(session);
                } else {
                    updateLongBodyComposerUI();
                }
            }

            function selectTarget(target) {
                const existing = tabs.find((tab) => tab.kind === 'texture' &&
                    tab.target && tab.target.p && tab.target.p.key === target.p.key);
                if (existing) {
                    activateTab(existing.id);
                    return existing;
                }

                const tab = {
                    id: `texture-${nextTextureTabId++}`,
                    kind: 'texture',
                    title: target.p.zhName,
                    target,
                    state: createEditorState()
                };
                tabs.push(tab);
                activeTabId = '';
                initializeTextureTab(tab);
                activeTabId = tab.id;
                syncActiveTabView();
                return tab;
            }

            function parseIntegerInput(id, label, min) {
                const input = byId(id);
                const value = input ? Number(input.value) : NaN;
                if (!Number.isFinite(value) || !Number.isInteger(value) || (min != null && value < min)) {
                    throw new Error(min != null
                        ? `${label}必须是大于等于 ${min} 的整数`
                        : `${label}必须是整数`);
                }
                return value;
            }

            function validateOutputSize(width, height) {
                if (width > MAX_TEXTURE_DIMENSION || height > MAX_TEXTURE_DIMENSION ||
                    width * height > MAX_TEXTURE_PIXELS) {
                    throw new Error(`输出尺寸过大，单边不能超过 ${MAX_TEXTURE_DIMENSION}px`);
                }
            }

            function getCropHandlePoints(left, top, right, bottom) {
                const centerX = (left + right) / 2;
                const centerY = (top + bottom) / 2;
                return {
                    nw: { x: left, y: top },
                    n: { x: centerX, y: top },
                    ne: { x: right, y: top },
                    e: { x: right, y: centerY },
                    se: { x: right, y: bottom },
                    s: { x: centerX, y: bottom },
                    sw: { x: left, y: bottom },
                    w: { x: left, y: centerY }
                };
            }

            function getNonTransparentContentBounds() {
                const frames = state.workingFrames;
                if (!frames || frames.length === 0) return null;
                const cached = state.contentBoundsCache;
                if (cached &&
                    cached.frames.length === frames.length &&
                    cached.frames.every((frame, index) => frame === frames[index])) {
                    return cached.bounds;
                }

                let minX = Infinity;
                let minY = Infinity;
                let maxX = -1;
                let maxY = -1;
                try {
                    for (const frame of frames) {
                        const width = frame.width;
                        const height = frame.height;
                        if (!(width > 0) || !(height > 0)) continue;
                        const data = frame.getContext('2d').getImageData(0, 0, width, height).data;
                        for (let y = 0; y < height; y++) {
                            const row = y * width * 4;
                            for (let x = 0; x < width; x++) {
                                if (data[row + x * 4 + 3] === 0) continue;
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                                if (y < minY) minY = y;
                                if (y > maxY) maxY = y;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('读取贴图透明边缘失败:', err);
                }

                const bounds = maxX >= 0 && maxY >= 0
                    ? { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 }
                    : null;
                state.contentBoundsCache = {
                    frames: frames.slice(),
                    bounds
                };
                return bounds;
            }

            function getSnapTargets(axis, frame, bounds) {
                const targets = new Set([0, axis === 'x' ? frame.width : frame.height]);
                if (bounds) {
                    targets.add(axis === 'x' ? bounds.left : bounds.top);
                    targets.add(axis === 'x' ? bounds.right : bounds.bottom);
                }
                return Array.from(targets).sort((a, b) => a - b);
            }

            function findSnap(value, targets, threshold) {
                let best = null;
                for (const target of targets) {
                    const distance = Math.abs(target - value);
                    if (distance > threshold) continue;
                    if (!best || distance < best.distance) {
                        best = { value: target, distance };
                    }
                }
                return best;
            }

            function snapMovingAxis(start, size, targets, threshold) {
                let best = null;
                for (const edge of [start, start + size]) {
                    const snap = findSnap(edge, targets, threshold);
                    if (!snap) continue;
                    const delta = snap.value - edge;
                    if (!best || Math.abs(delta) < Math.abs(best.delta)) {
                        best = { delta, guide: snap.value };
                    }
                }
                return best || { delta: 0, guide: null };
            }

            function updateCropInputs(rect) {
                const baseFrame = state.workingFrames[0];
                const cropX = byId('textureImageCropX');
                const cropY = byId('textureImageCropY');
                const cropW = byId('textureImageCropWidth');
                const cropH = byId('textureImageCropHeight');
                if (!rect || !baseFrame) return;
                if (cropX) cropX.value = String(-rect.x);
                if (cropY) cropY.value = String(-rect.y);
                if (cropW) {
                    cropW.min = String(1 - baseFrame.width);
                    cropW.value = String(rect.width - baseFrame.width);
                }
                if (cropH) {
                    cropH.min = String(1 - baseFrame.height);
                    cropH.value = String(rect.height - baseFrame.height);
                }
            }

            function setCropRect(rect, options = {}) {
                const next = {
                    x: Math.round(Number(rect.x) || 0),
                    y: Math.round(Number(rect.y) || 0),
                    width: Math.max(1, Math.round(Number(rect.width) || 1)),
                    height: Math.max(1, Math.round(Number(rect.height) || 1))
                };
                validateOutputSize(next.width, next.height);
                state.cropRect = next;
                updateCropInputs(next);
                if (options.refresh !== false) refreshLivePreview();
            }

            function getCropPointerState(event) {
                const canvas = byId('textureImagePreviewCanvas');
                const cropRect = state.cropRect;
                const viewport = state.previewViewport;
                if (!canvas || !cropRect || !viewport) return null;

                const rect = canvas.getBoundingClientRect();
                const px = (event.clientX - rect.left) * canvas.width / rect.width;
                const py = (event.clientY - rect.top) * canvas.height / rect.height;
                const left = viewport.offsetX + cropRect.x * viewport.scale;
                const top = viewport.offsetY + cropRect.y * viewport.scale;
                const right = left + cropRect.width * viewport.scale;
                const bottom = top + cropRect.height * viewport.scale;
                const handles = getCropHandlePoints(left, top, right, bottom);
                const hitRadius = 9;

                for (const [mode, point] of Object.entries(handles)) {
                    if (Math.abs(px - point.x) <= hitRadius && Math.abs(py - point.y) <= hitRadius) {
                        return { mode, px, py, worldX: (px - viewport.offsetX) / viewport.scale, worldY: (py - viewport.offsetY) / viewport.scale };
                    }
                }
                if (px >= left && px <= right && py >= top && py <= bottom) {
                    return { mode: 'move', px, py, worldX: (px - viewport.offsetX) / viewport.scale, worldY: (py - viewport.offsetY) / viewport.scale };
                }
                return null;
            }

            function updateCropCursor(mode) {
                const canvas = byId('textureImagePreviewCanvas');
                if (!canvas) return;
                const cursor = mode === 'move' ? 'move'
                    : mode === 'nw' || mode === 'se' ? 'nwse-resize'
                    : mode === 'ne' || mode === 'sw' ? 'nesw-resize'
                    : mode === 'n' || mode === 's' ? 'ns-resize'
                    : mode === 'e' || mode === 'w' ? 'ew-resize'
                    : 'default';
                canvas.style.cursor = cursor;
            }

            function getLongBodyTailPointerState(event) {
                const canvas = byId('textureImagePreviewCanvas');
                const composer = state.longBodyComposer;
                const viewport = state.previewViewport;
                const frame = state.previewFrames[0];
                if (!canvas || !viewport || !frame || !composer.active || !composer.tailFrame) return null;
                const rect = canvas.getBoundingClientRect();
                const px = (event.clientX - rect.left) * canvas.width / rect.width;
                const py = (event.clientY - rect.top) * canvas.height / rect.height;
                const left = viewport.offsetX;
                const right = left + frame.width * viewport.scale;
                const top = viewport.offsetY + composer.coverage * viewport.scale;
                const tailDisplayHeight = getLongBodyTailDisplayHeight(
                    composer.tailFrame,
                    frame.width,
                    composer.fade / LONG_BODY_FADE_MAX
                );
                const bottom = top + tailDisplayHeight * viewport.scale;
                if (px < left || px > right || py < top - 8 || py > bottom + 8) return null;
                return { px, py };
            }

            function initCropCanvasInteractions() {
                const canvas = byId('textureImagePreviewCanvas');
                if (!canvas) return;

                canvas.addEventListener('wheel', (event) => {
                    if (!state.workingFrames[0] || state.cropDragState || state.longBodyDragState || state.previewPanState) return;
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
                    const hit = getCropPointerState(event);
                    if (!hit || !state.cropRect) return;
                    beginEditorHistory('拖动裁剪框', { group: 'crop-drag' });
                    state.snapGuides = null;
                    state.cropDragState = {
                        pointerId: event.pointerId,
                        mode: hit.mode,
                        startWorldX: hit.worldX,
                        startWorldY: hit.worldY,
                        startRect: { ...state.cropRect }
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
                    if (state.longBodyComposer.active) {
                        canvas.style.cursor = getLongBodyTailPointerState(event) ? 'grab' : 'default';
                        return;
                    }
                    if (!state.cropDragState || state.cropDragState.pointerId !== event.pointerId) {
                        updateCropCursor((getCropPointerState(event) || {}).mode);
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
                    const frame = state.workingFrames[0];
                    const bounds = getNonTransparentContentBounds();
                    const xTargets = getSnapTargets('x', frame, bounds);
                    const yTargets = getSnapTargets('y', frame, bounds);
                    const snapThreshold = Math.max(1, 10 / viewport.scale);
                    let guideX = null;
                    let guideY = null;

                    if (drag.mode === 'move') {
                        const xSnap = snapMovingAxis(start.x, start.width, xTargets, snapThreshold);
                        const ySnap = snapMovingAxis(start.y, start.height, yTargets, snapThreshold);
                        next.x = Math.round(start.x + dx + xSnap.delta);
                        next.y = Math.round(start.y + dy + ySnap.delta);
                        guideX = xSnap.guide;
                        guideY = ySnap.guide;
                    } else {
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
                    }

                    state.snapGuides = (guideX != null || guideY != null)
                        ? { x: guideX, y: guideY }
                        : null;
                    try {
                        setCropRect(next);
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
                    updateCropCursor((getCropPointerState(event) || {}).mode);
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
                canvas.addEventListener('pointerup', finishDrag);
                canvas.addEventListener('pointercancel', finishDrag);
                canvas.addEventListener('pointerleave', () => {
                    if (state.previewPanState) return;
                    if (state.longBodyComposer.active) {
                        if (!state.longBodyDragState) canvas.style.cursor = 'default';
                        return;
                    }
                    if (!state.cropDragState) updateCropCursor(null);
                });
            }

            function buildPreviewFrames() {
                if (state.workingFrames.length === 0) return [];

                const baseFrame = state.workingFrames[0];
                const leftBoundary = parseIntegerInput('textureImageCropX', '左边界', -MAX_TEXTURE_DIMENSION);
                const topBoundary = parseIntegerInput('textureImageCropY', '上边界', -MAX_TEXTURE_DIMENSION);
                const widthDelta = parseIntegerInput('textureImageCropWidth', '宽度变化');
                const heightDelta = parseIntegerInput('textureImageCropHeight', '高度变化');
                const cropX = -leftBoundary;
                const cropY = -topBoundary;
                const cropWidth = baseFrame.width + widthDelta;
                const cropHeight = baseFrame.height + heightDelta;
                if (cropWidth < 1 || cropHeight < 1) {
                    throw new Error('输出宽度和高度必须至少为 1px');
                }
                state.cropRect = {
                    x: cropX,
                    y: cropY,
                    width: cropWidth,
                    height: cropHeight
                };

                validateOutputSize(cropWidth, cropHeight);
                const previewFrames = state.workingFrames.map((frame) => {
                    const output = document.createElement('canvas');
                    output.width = cropWidth;
                    output.height = cropHeight;
                    output._is2x = frame._is2x;
                    output.getContext('2d').drawImage(frame, -cropX, -cropY);
                    return output;
                });
                return previewFrames;
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

            function getSelectedAliases(selected) {
                const p = selected.p;
                const aliases = new Set([p.key, selected.base]);
                const isPerTrack = p._trackCol != null ||
                    /^(NoteImage|HoldNoteHeadImage|HoldNoteBodyImage|HoldNoteTailImage|KeyImageDown|KeyImage)\d+/i.test(p.key);
                if (isPerTrack) {
                    for (const alias of getTextureParamAliases(p.key, selected.keys)) aliases.add(alias);
                }
                return { aliases, isPerTrack };
            }

            function installFramesToStores(frames, selected, options = {}) {
                if (!selected || !frames || frames.length === 0) return null;
                const p = selected.p;
                const is2x = !!frames[0]._is2x;
                const base = stripTextureName(selected.base) || 'texture';
                const fallbackBase = base.split('/').pop();
                const { aliases, isPerTrack } = getSelectedAliases(selected);

                if (options.persist) {
                    recordSkinUndoBeforeChange(`编辑贴图: ${base} (${frames.length} 帧)`);
                    continuousActionActive = false;
                }

                for (const alias of aliases) {
                    const entry = getOrCreateSkinAssetEntry(skinImageStore, alias);
                    const fallbackEntry = getOrCreateSkinAssetEntry(skinFallbackImageStore, alias);
                    entry.anim1x = [];
                    entry.anim2x = [];
                    fallbackEntry.anim1x = [];
                    fallbackEntry.anim2x = [];
                    entry.static1x = null;
                    entry.static2x = null;
                    fallbackEntry.static1x = null;
                    fallbackEntry.static2x = null;
                }

                if (frames.length === 1) {
                    const frame = frames[0];
                    frame._is2x = is2x;
                    frame._isRootLevel = true;
                    saveSkinAssetToStore(skinImageStore, base, frame, is2x, true, true);
                    saveSkinAssetToStore(skinFallbackImageStore, fallbackBase || base, frame, is2x, true, true);
                } else {
                    frames.forEach((frame, index) => {
                        frame._is2x = is2x;
                        frame._isRootLevel = true;
                        const frameKey = `${base}-${index}`;
                        saveSkinAssetToStore(skinImageStore, frameKey, frame, is2x, true, true);
                        saveSkinAssetToStore(skinFallbackImageStore, frameKey, frame, is2x, true, true);
                        if (fallbackBase && fallbackBase !== base) {
                            saveSkinAssetToStore(skinFallbackImageStore, `${fallbackBase}-${index}`, frame, is2x, true, true);
                        }
                    });
                }

                const baseEntry = getOrCreateSkinAssetEntry(skinImageStore, base);
                const fallbackEntry = getOrCreateSkinAssetEntry(skinFallbackImageStore, fallbackBase || base);
                if (frames.length === 1) {
                    if (is2x) {
                        baseEntry.static2x = frames[0];
                        fallbackEntry.static2x = frames[0];
                    } else {
                        baseEntry.static1x = frames[0];
                        fallbackEntry.static1x = frames[0];
                    }
                } else if (is2x) {
                    baseEntry.anim2x = frames.slice();
                    fallbackEntry.anim2x = frames.slice();
                } else {
                    baseEntry.anim1x = frames.slice();
                    fallbackEntry.anim1x = frames.slice();
                }

                const keys = selected.keys || getActiveKeyCount();
                let primaryCfg = maniaSkinConfigurations.get(keys);
                if (!primaryCfg) {
                    primaryCfg = ensureManiaConfigForKeys(keys);
                    maniaSkinConfigurations.set(keys, primaryCfg);
                }
                if (!primaryCfg.ImageLookups) primaryCfg.ImageLookups = new Map();

                if (isPerTrack) {
                    for (const alias of aliases) {
                        primaryCfg[alias] = base;
                        primaryCfg.ImageLookups.set(alias, base);
                        primaryCfg.ImageLookups.set(alias.toLowerCase(), base);
                    }
                } else {
                    for (const [, cfg] of maniaSkinConfigurations) {
                        if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
                        for (const alias of aliases) {
                            cfg[alias] = base;
                            cfg.ImageLookups.set(alias, base);
                            cfg.ImageLookups.set(alias.toLowerCase(), base);
                        }
                    }
                    if (globalSkinImageLookups) {
                        for (const alias of aliases) {
                            globalSkinImageLookups.set(alias, base);
                            globalSkinImageLookups.set(alias.toLowerCase(), base);
                        }
                    }
                }

                if (options.persist) {
                    syncParamInputValue(p.key, base);
                }
                if (options.draw !== false) drawFrame();
                return base;
            }

            function refreshLivePreview(options = {}) {
                if (!state.selected || state.workingFrames.length === 0) return false;
                try {
                    state.previewFrames = buildPreviewFrames();
                    installFramesToStores(state.previewFrames, state.selected, {
                        persist: false,
                        draw: options.draw !== false
                    });
                    updateMeta();
                    return true;
                } catch (err) {
                    if (options.showError) showToast('预览参数无效', err.message || '请检查裁剪与扩边数值');
                    return false;
                }
            }

            function scheduleLivePreview() {
                if (state.livePreviewTimer) clearTimeout(state.livePreviewTimer);
                state.livePreviewTimer = setTimeout(() => {
                    state.livePreviewTimer = null;
                    refreshLivePreview();
                }, 120);
            }

            function canvasToBlob(canvas) {
                return new Promise((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('无法生成 PNG 数据'));
                    }, 'image/png');
                });
            }

            async function loadImageFromBlob(blob) {
                const url = URL.createObjectURL(blob);
                try {
                    return await new Promise((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error('无法读取编辑后的贴图'));
                        img.src = url;
                    });
                } finally {
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
            }

            async function serializeFrames(baseName, sourceFrames = null) {
                const serialized = [];
                const frames = (sourceFrames && sourceFrames.length > 0)
                    ? sourceFrames
                    : (state.previewFrames.length > 0 ? state.previewFrames : state.workingFrames);
                for (let i = 0; i < frames.length; i++) {
                    const canvas = frames[i];
                    const blob = await canvasToBlob(canvas);
                    const arrayBuffer = await blob.arrayBuffer();
                    const img = await loadImageFromBlob(blob);
                    img._is2x = !!canvas._is2x;
                    const plainName = String(baseName || 'texture').split('/').pop();
                    const fileName = frames.length > 1 ? `${plainName}-${i}.png` : `${plainName}.png`;
                    serialized.push({
                        file: new File([blob], fileName, { type: 'image/png' }),
                        arrayBuffer,
                        img,
                        blob
                    });
                }
                return serialized;
            }

            async function serializeLongBodyFrame(canvas) {
                const blob = typeof canvas.convertToBlob === 'function'
                    ? await canvas.convertToBlob({ type: 'image/png' })
                    : await canvasToBlob(canvas);
                const arrayBuffer = await blob.arrayBuffer();
                const img = await loadImageFromBlob(blob);
                img._is2x = !!canvas._is2x;
                return {
                    file: new File([blob], 'longbody-body.png', { type: 'image/png' }),
                    arrayBuffer,
                    img,
                    blob
                };
            }

            function persistEditedSequence(serialized, selected) {
                const p = selected.p;
                const is2x = !!(serialized[0] && serialized[0].img._is2x);
                const currentSuffix = is2x ? '@2x.png' : '.png';
                const oppositeSuffix = is2x ? '.png' : '@2x.png';
                const base = stripTextureName(selected.base) || 'texture';
                const imageFrames = serialized.map((frame) => frame.img);
                installFramesToStores(imageFrames, selected, { persist: true, draw: false });

                serialized.forEach((frame, index) => {
                    const frameKey = `${base}-${index}`;
                    userReplacedTextures.set(`${frameKey}${currentSuffix}`, frame.arrayBuffer);
                    userReplacedTextures.delete(`${frameKey}${oppositeSuffix}`);
                });

                for (let i = serialized.length; i < 64; i++) {
                    const frameKey = `${base}-${i}`;
                    skinImageStore.delete(frameKey);
                    skinFallbackImageStore.delete(frameKey);
                    userReplacedTextures.delete(`${frameKey}.png`);
                    userReplacedTextures.delete(`${frameKey}@2x.png`);
                    if (currentSkinZip) {
                        currentSkinZip.remove(`${frameKey}.png`);
                        currentSkinZip.remove(`${frameKey}@2x.png`);
                    }
                }

                showToast('贴图编辑成功', `已更新 ${p.zhName}，共 ${serialized.length} 帧`);
                drawFrame();
                renderSkinEditorParams();
            }

            function completeSavedTab(options = {}) {
                const savedTab = getActiveTab();
                if (!savedTab || savedTab.kind !== 'texture') return false;
                updateEditorBaseAfterSave();

                if (options.closeTabAfterSave === false) {
                    savedTab.state.previewSnapshot = editorBaseSnapshot;
                    resetEditorHistory();
                    return true;
                }

                const remainingTextureTabs = getTextureTabs().filter((tab) => tab.id !== savedTab.id);
                if (remainingTextureTabs.length === 0 && options.closeEditorWhenLast !== false) {
                    finalizeEditorClose();
                } else {
                    removeTab(savedTab.id, { restorePreview: false });
                }
                return true;
            }

            async function applySelectedTexture(options = {}) {
                const applyTab = getActiveTab();
                if (!state.selected) {
                    showToast('尚未选择贴图', '请先点击“选择贴图”。');
                    return false;
                }
                const longBodyApplyScope = state.longBodyComposer.active
                    ? await requestLongBodyApplyScope()
                    : null;
                if (state.longBodyComposer.active && !longBodyApplyScope) return false;
                const longBodyTargetColumns = longBodyApplyScope === 'all'
                    ? Array.from({ length: getActiveKeyCount() }, (_, column) => column)
                    : [getSelectedTrackIndex()].filter((column) => column != null);
                const applyingAll = longBodyApplyScope === 'all';

                const applyBtn = byId('textureImageApplyBtn');
                if (applyBtn) {
                    applyBtn.disabled = true;
                    applyBtn.textContent = '正在应用...';
                }

                try {
                    const committingLongBodyComposer = state.longBodyComposer.active;
                    let framesToSave;
                    if (committingLongBodyComposer) {
                        setLongBodyProgress('正在生成完整长条...', 0);
                        await waitForUiPaint();
                        framesToSave = [await buildLongBodyCompositeAsync(
                            state.longBodyComposer.targetHeight,
                            (value) => setLongBodyProgress('正在生成完整长条...', value)
                        )];
                    } else {
                        framesToSave = buildPreviewFrames();
                    }
                    if (!framesToSave || framesToSave.length === 0 || !framesToSave[0]) {
                        throw new Error('无法生成要保存的贴图');
                    }
                    if (!committingLongBodyComposer) state.previewFrames = framesToSave;
                    if (committingLongBodyComposer) {
                        setLongBodyProgress('正在编码 PNG...', 65, true);
                        await waitForUiPaint();
                    }
                    const serialized = committingLongBodyComposer
                        ? [await serializeLongBodyFrame(framesToSave[0])]
                        : await serializeFrames(state.selected.base, framesToSave);
                    if (committingLongBodyComposer) {
                        setLongBodyProgress('正在替换身体贴图...', 82);
                        await waitForUiPaint();
                    }
                    if (state.previewSnapshot) applySkinSnapshot(state.previewSnapshot);

                    let longBodyApplyPlans = null;
                    let longBodySettings = null;
                    if (committingLongBodyComposer) {
                        // 预览期间会临时把 NoteBodyStyle 设为 1；历史快照必须记录进入编辑器前的原值，
                        // 否则撤销“一键投皮”时会把临时值一起保留下来。
                        restoreNoteBodyStyle();
                        recordSkinUndoBeforeChange(
                            applyingAll ? '一键投皮（全部轨道）' : '一键投皮（当前轨道）',
                            { force: true }
                        );
                        setNoteBodyStyleOne(false, applyingAll);
                        const applyLabel = applyingAll ? '正在应用到全部轨道...' : '正在应用到当前轨道...';
                        setLongBodyProgress(applyLabel, 82);
                        await waitForUiPaint();
                        longBodySettings = {
                            targetHeight: state.longBodyComposer.targetHeight,
                            coverage: state.longBodyComposer.coverage,
                            fade: state.longBodyComposer.fade
                        };
                        longBodyApplyPlans = createLongBodyApplyPlans(longBodyTargetColumns);
                        const bodyApplied = await applyLongBodyToTracks(
                            serialized[0],
                            longBodyApplyPlans,
                            longBodySettings,
                            (value) => setLongBodyProgress(applyLabel, value)
                        );
                        if (!bodyApplied) throw new Error('完整长条身体未能写入目标轨道');
                        const tailLabel = applyingAll ? '正在写入全轨透明尾部...' : '正在写入透明尾部...';
                        setLongBodyProgress(tailLabel, 92);
                        await waitForUiPaint();
                        const tailsApplied = await applyTransparentTailsToTracks(
                            longBodyTargetColumns,
                            (value) => setLongBodyProgress(tailLabel, value)
                        );
                        if (!tailsApplied) throw new Error('透明长条尾部未能写入目标轨道');
                    } else if (serialized.length === 1) {
                        if (!textureUploadUi || typeof textureUploadUi.applyEditedTexture !== 'function') {
                            throw new Error('贴图替换模块尚未初始化');
                        }
                        const frame = serialized[0];
                        const applied = await textureUploadUi.applyEditedTexture(
                            frame.file,
                            frame.arrayBuffer,
                            frame.img,
                            !!frame.img._is2x,
                            state.selected.base,
                            state.selected.p.key,
                            state.selected.p.key,
                            state.selected.p._trackCol
                        );
                        if (!applied) throw new Error('贴图未能写入皮肤');
                    } else {
                        persistEditedSequence(serialized, state.selected);
                    }
                    if (committingLongBodyComposer) {
                        setNoteBodyStyleOne(false, applyingAll);
                        persistLongBodyComposerSessions(longBodyApplyPlans, longBodySettings);
                        setLongBodyProgress('正在完成...', 100);
                        await waitForUiPaint();
                        showToast(
                            '一键投皮应用成功',
                            applyingAll ? `已应用到全部 ${getActiveKeyCount()} 条轨道。` : '已应用到当前轨道。'
                        );
                    }
                    return completeSavedTab(options);
                } catch (err) {
                    console.error('贴图编辑应用失败', err);
                    showToast('贴图编辑失败', err.message || '未知错误');
                    if (state.longBodyComposer.active) setNoteBodyStyleOne(false, false);
                    if (state.selected && state.previewFrames.length > 0) {
                        installFramesToStores(state.previewFrames, state.selected, { persist: false });
                    }
                    return false;
                } finally {
                    hideLongBodyProgress();
                    if (applyBtn) {
                        applyBtn.disabled = !state.selected || getActiveTab() !== applyTab;
                        applyBtn.textContent = '保存到皮肤';
                    }
                }
            }

            function resetCurrentTexture() {
                if (!state.selected) return;
                if (state.longBodyComposer.active) {
                    const key = getLongBodySessionKey();
                    if (key) longBodyComposerSessions.delete(key);
                    disableLongBodyComposer();
                    showToast('已重置', '一键投皮已关闭，长条身体已恢复为进入编辑器前的状态。');
                    return;
                }
                commitEditorHistory();
                beginEditorHistory('重置当前贴图', { group: 'reset-texture' });
                state.workingFrames = state.originalFrames.map(cloneFrame);
                state.previewFrames = state.workingFrames.map(cloneFrame);
                resetTransformInputs();
                installFramesToStores(state.previewFrames, state.selected, { persist: false });
                updateMeta();
                commitEditorHistory();
                showToast('已重置', '当前贴图已恢复为打开编辑器时的状态。');
            }

            function open() {
                const modal = byId('textureImageEditorModal');
                if (!modal) return false;
                if (modal.classList.contains('active')) return true;
                const skinEditorModal = byId('skinEditorModal');
                if (skinEditorModal) skinEditorModal.classList.remove('active');
                Object.assign(menuState, createEditorState());
                state = menuState;
                tabs = [menuTab];
                activeTabId = menuTab.id;
                nextTextureTabId = 1;
                editorBaseSnapshot = createSkinSnapshot('贴图编辑基线');
                menuState.previewSnapshot = editorBaseSnapshot;
                renderPicker();
                renderTabs();
                setViews(true);
                updateSelectionSummary();
                updateEditorHistoryButtons();
                updateStretchFixUI();
                modal.classList.add('active');
                modal.style.display = 'block';
                return true;
            }

            async function closeTab(tabId) {
                const tab = getTabById(tabId);
                if (!tab || tab.kind === 'menu') return false;
                if (activeTabId !== tab.id) activateTab(tab.id);
                commitActiveTabState();

                if (isTabDirty(tab)) {
                    const decision = await requestUnsavedDecision({
                        title: getTabTitle(tab),
                        count: 1
                    });
                    if (decision === 'cancel') return false;
                    if (decision === 'save') {
                        return applySelectedTexture({
                            closeTabAfterSave: true,
                            closeEditorWhenLast: true
                        });
                    }
                }

                removeTab(tab.id, { restorePreview: true });
                return true;
            }

            function discardAndCloseEditor() {
                for (const tab of tabs) {
                    if (tab.kind === 'texture') clearEditorStateTimers(tab.state);
                }
                finalizeEditorClose();
                return true;
            }

            async function close() {
                commitActiveTabState();
                const dirtyTabs = tabs.filter(isTabDirty);
                if (dirtyTabs.length === 0) {
                    finalizeEditorClose();
                    return true;
                }

                const decision = await requestUnsavedDecision({
                    title: dirtyTabs[0] ? getTabTitle(dirtyTabs[0]) : '',
                    count: dirtyTabs.length
                });
                if (decision === 'cancel') return false;
                if (decision === 'discard') {
                    finalizeEditorClose();
                    return true;
                }

                for (const dirtyTab of dirtyTabs) {
                    const current = getTabById(dirtyTab.id);
                    if (!current) continue;
                    activateTab(current.id);
                    const saved = await applySelectedTexture({
                        closeTabAfterSave: true,
                        closeEditorWhenLast: false
                    });
                    if (!saved) return false;
                }
                finalizeEditorClose();
                return true;
            }

            const dialog = byId('textureImageEditorDialog');
            const header = byId('textureImageEditorHeader');
            const dockBtn = byId('dockTextureImageEditorBtn');
            const collapseBtn = byId('collapseTextureImageEditorBtn');

            if (dialog && header) {
                let isDraggingWindow = false;
                let dragStartX = 0;
                let dragStartY = 0;
                let dialogStartLeft = 0;
                let dialogStartTop = 0;

                header.addEventListener('mousedown', (event) => {
                    if (event.target.closest('button') || event.target.closest('input') || event.target.closest('select')) return;

                    isDraggingWindow = true;
                    dragStartX = event.clientX;
                    dragStartY = event.clientY;

                    const rect = dialog.getBoundingClientRect();
                    dialogStartLeft = rect.left;
                    dialogStartTop = rect.top;
                    dialog.style.left = `${dialogStartLeft}px`;
                    dialog.style.top = `${dialogStartTop}px`;
                    dialog.style.right = 'auto';
                    dialog.style.bottom = 'auto';
                    dialog.classList.add('is-dragging');

                    const onMouseMove = (moveEvent) => {
                        if (!isDraggingWindow) return;
                        const nextLeft = Math.max(
                            -dialog.offsetWidth + 80,
                            Math.min(window.innerWidth - 80, dialogStartLeft + moveEvent.clientX - dragStartX)
                        );
                        const nextTop = Math.max(
                            0,
                            Math.min(window.innerHeight - 50, dialogStartTop + moveEvent.clientY - dragStartY)
                        );
                        dialog.style.left = `${nextLeft}px`;
                        dialog.style.top = `${nextTop}px`;
                    };

                    const onMouseUp = () => {
                        isDraggingWindow = false;
                        dialog.classList.remove('is-dragging');
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                    event.preventDefault();
                });

                header.addEventListener('dblclick', (event) => {
                    if (event.target.closest('button')) return;
                    if (collapseBtn) collapseBtn.click();
                });

                if (collapseBtn) {
                    collapseBtn.onclick = () => {
                        const isCollapsed = dialog.classList.toggle('is-collapsed');
                        collapseBtn.textContent = isCollapsed ? '+' : '−';
                        collapseBtn.title = isCollapsed ? '展开窗口' : '折叠窗口';
                    };
                }

                if (dockBtn) {
                    dockBtn.onclick = () => {
                        dialog.style.left = 'auto';
                        dialog.style.top = '48px';
                        dialog.style.right = '24px';
                        dialog.style.bottom = 'auto';
                        dialog.style.width = '860px';
                        dialog.style.height = '84vh';
                        dialog.classList.remove('is-collapsed');
                        if (collapseBtn) {
                            collapseBtn.textContent = '−';
                            collapseBtn.title = '折叠/展开窗口';
                        }
                    };
                }
            }

            const openBtn = byId('openTextureImageEditorBtn');
            const closeBtn = byId('textureImageEditorCloseBtn');
            const cancelBtn = byId('textureImageCancelBtn');
            const backdrop = byId('textureImageEditorBackdrop');
            const resetBtn = byId('textureImageResetBtn');
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

            if (openBtn) openBtn.onclick = open;
            if (closeBtn) closeBtn.onclick = close;
            if (cancelBtn) cancelBtn.onclick = discardAndCloseEditor;
            if (backdrop) backdrop.onclick = close;
            if (resetBtn) resetBtn.onclick = resetCurrentTexture;
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
