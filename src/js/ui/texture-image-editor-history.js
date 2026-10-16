// ============================================================================
// texture-image-editor-history.js - 贴图编辑器局部撤销与重做历史
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function captureEditorHistoryState() {
            return {
                workingFrames: state.workingFrames.slice(),
                cropRect: state.cropRect ? { ...state.cropRect } : null,
                imageTransform: cloneImageTransform(state.imageTransform)
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
            if (!imageTransformsEqual(a.imageTransform, b.imageTransform)) return false;
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
            invalidateKeyImageEditRecipe();
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
            state.imageTransform = cloneImageTransform(snapshot.imageTransform);
            updateCropInputs(state.cropRect);
            updateImageTransformInputs();
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
