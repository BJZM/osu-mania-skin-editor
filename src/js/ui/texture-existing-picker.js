// ============================================================================
// texture-existing-picker.js - 选择当前皮肤已有贴图并写入参数路径
// 依赖：ui/texture-existing-sources.js、ui/texture-existing-picker-view.js、ui/texture-param-lookup.js
// ============================================================================

        let textureExistingPickerUi = null;

        function openTextureExistingPicker(p, keys) {
            if (!textureExistingPickerUi || !p) return false;
            return textureExistingPickerUi.open(p, keys);
        }

        function initTextureExistingPickerUI() {
            const modal = document.getElementById('textureExistingPickerModal');
            const grid = document.getElementById('textureExistingPickerGrid');
            const empty = document.getElementById('textureExistingPickerEmpty');
            const count = document.getElementById('textureExistingPickerCount');
            const search = document.getElementById('textureExistingPickerSearch');
            const confirmBtn = document.getElementById('textureExistingPickerConfirmBtn');
            const targetLabel = document.getElementById('textureExistingPickerTargetLabel');
            const currentPath = document.getElementById('textureExistingPickerCurrentPath');
            if (!modal || !grid || !confirmBtn) return;

            const state = {
                open: false,
                p: null,
                keys: null,
                sources: [],
                visibleSources: [],
                selectedPath: null
            };

            function getCurrentPath(p, keys) {
                if (!p) return '';
                const configured = getTextureParamIniValue(keys, p);
                if (configured) return configured;
                const resolved = resolveTextureParam(keys, p);
                return resolved && resolved.name ? resolved.name : '';
            }

            function updateConfirmState() {
                confirmBtn.disabled = !state.selectedPath;
                confirmBtn.textContent = state.selectedPath ? '使用此贴图' : '选择一张贴图';
            }

            function markSelectedCard() {
                for (const card of grid.querySelectorAll('.texture-existing-card')) {
                    const selected = card.dataset.texturePath === state.selectedPath;
                    card.classList.toggle('selected', selected);
                    card.setAttribute('aria-selected', selected ? 'true' : 'false');
                }
                updateConfirmState();
            }

            function selectPath(path) {
                state.selectedPath = path || null;
                markSelectedCard();
            }

            function renderSources() {
                state.visibleSources = filterExistingTextureSources(state.sources, search ? search.value : '');
                renderTextureExistingGrid({
                    grid,
                    empty,
                    count,
                    allSources: state.sources,
                    visibleSources: state.visibleSources,
                    selectedPath: state.selectedPath,
                    onSelect: selectPath,
                    onConfirm: confirmSelection
                });
                updateConfirmState();
            }

            function close() {
                modal.style.display = 'none';
                state.open = false;
                state.p = null;
                state.selectedPath = null;
            }

            function open(p, keys) {
                const keyCount = keys || getActiveKeyCount();
                state.p = p;
                state.keys = keyCount;
                state.sources = collectExistingTextureSources();
                state.selectedPath = null;
                state.open = true;
                if (targetLabel) targetLabel.textContent = getTextureExistingTargetLabel(p);
                if (currentPath) currentPath.textContent = getCurrentPath(p, keyCount) || '未指定';
                if (search) search.value = '';
                renderSources();
                modal.style.display = 'flex';
                if (search) setTimeout(() => search.focus(), 0);

                if (typeof isDefaultSkinWorkspaceActive === 'function' && isDefaultSkinWorkspaceActive() &&
                    state.sources.length === 0 &&
                    typeof loadDefaultSkin === 'function') {
                    loadDefaultSkin().then(() => {
                        if (state.open) {
                            state.sources = collectExistingTextureSources();
                            renderSources();
                        }
                    });
                }
                return true;
            }

            function refreshAfterAssignment() {
                drawFrame();
                renderSkinEditorParams();
                if (typeof updateEditorBaseAfterSave === 'function') {
                    updateEditorBaseAfterSave();
                }
                const imageEditorModal = document.getElementById('textureImageEditorModal');
                const imageEditorPicker = document.getElementById('textureImagePickerView');
                if (imageEditorModal && imageEditorModal.classList.contains('active') &&
                    imageEditorPicker && getComputedStyle(imageEditorPicker).display !== 'none' &&
                    typeof renderPicker === 'function') {
                    renderPicker();
                }
                if (selectedCanvasElement) syncCanvasSelectedCard(selectedCanvasElement);
            }

            function confirmSelection() {
                if (!state.open || !state.p || !state.selectedPath) return false;
                const selectedPath = state.selectedPath;
                const previousPath = getCurrentPath(state.p, state.keys);
                if (normalizeTextureLookupPath(previousPath) === normalizeTextureLookupPath(selectedPath)) {
                    close();
                    return true;
                }

                try {
                    recordSkinUndoBeforeChange(`引用已有贴图: ${selectedPath}`, { force: true });
                    assignTextureParamLookup(state.keys, state.p, selectedPath);
                    syncParamInputValue(state.p.key, normalizeTextureLookupPath(selectedPath));
                    close();
                    if (typeof refreshExternalConfigSnapshot === 'function') {
                        refreshExternalConfigSnapshot();
                    }
                    refreshAfterAssignment();
                    showToast('已引用已有贴图', `路径已指向 ${normalizeTextureLookupPath(selectedPath)}，未复制图片文件。`);
                    return true;
                } catch (err) {
                    console.error('引用已有贴图失败', err);
                    showToast('引用失败', err.message || '无法修改贴图路径');
                    return false;
                }
            }

            document.getElementById('textureExistingPickerCloseBtn').onclick = close;
            document.getElementById('textureExistingPickerCancelBtn').onclick = close;
            document.getElementById('textureExistingPickerBackdrop').onclick = close;
            confirmBtn.onclick = confirmSelection;
            if (search) search.addEventListener('input', renderSources);
            modal.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                } else if (event.key === 'Enter' && state.selectedPath) {
                    event.preventDefault();
                    confirmSelection();
                }
            });

            textureExistingPickerUi = {
                open,
                close,
                confirm: confirmSelection,
                getState: () => ({
                    open: state.open,
                    targetKey: state.p ? state.p.key : null,
                    sourceCount: state.sources.length,
                    visibleCount: state.visibleSources.length,
                    selectedPath: state.selectedPath
                })
            };
        }
