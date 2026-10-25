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

            function resolveEffectiveTypedPath(query) {
                const raw = String(query || '').trim();
                if (!raw) return null;
                const norm = typeof normalizeTextureLookupPath === 'function'
                    ? normalizeTextureLookupPath(raw)
                    : raw.replace(/\.(png|jpg|jpeg)$/i, '');
                if (!norm) return null;

                const sources = state.sources || [];
                const exact = sources.find((s) => {
                    const sNorm = typeof normalizeTextureLookupPath === 'function'
                        ? normalizeTextureLookupPath(s.path)
                        : s.path;
                    return s.path.toLowerCase() === raw.toLowerCase() ||
                        sNorm.toLowerCase() === norm.toLowerCase() ||
                        (s.basename && s.basename.toLowerCase() === norm.toLowerCase());
                });
                if (exact) return exact.path;

                if (state.visibleSources && state.visibleSources.length === 1) {
                    return state.visibleSources[0].path;
                }

                if (typeof lookupTextureByName === 'function' && lookupTextureByName(norm)) {
                    return norm;
                }

                return null;
            }

            function updateConfirmState() {
                const effective = state.selectedPath || resolveEffectiveTypedPath(search ? search.value : '');
                confirmBtn.disabled = !effective;
                confirmBtn.textContent = effective
                    ? `使用此贴图 (${typeof normalizeTextureLookupPath === 'function' ? normalizeTextureLookupPath(effective) : effective})`
                    : '选择一张贴图';
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
                const query = search ? search.value.trim() : '';
                state.visibleSources = filterExistingTextureSources(state.sources, query);
                if (query) {
                    const matched = resolveEffectiveTypedPath(query);
                    if (matched) {
                        state.selectedPath = matched;
                    }
                }
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

            async function confirmSelection() {
                if (!state.open || !state.p) return false;
                const effectivePath = state.selectedPath || resolveEffectiveTypedPath(search ? search.value : '');
                if (!effectivePath) return false;
                state.selectedPath = effectivePath;
                const selectedPath = effectivePath;
                if (isFontGlyphTextureParam(state.p)) {
                    const targetParam = state.p;
                    const applied = await applyExistingTextureToFontGlyph(
                        targetParam,
                        selectedPath,
                        state.keys
                    );
                    if (!applied) {
                        showToast('引用失败', '该贴图无法转换为当前字体字形的目标路径。');
                        return false;
                    }
                    close();
                    if (typeof refreshExternalConfigSnapshot === 'function') {
                        refreshExternalConfigSnapshot();
                    }
                    refreshAfterAssignment();
                    showToast(
                        '已引用字体贴图',
                        `${targetParam._fontGlyph.group === 'combo' ? 'ComboPrefix' : 'ScorePrefix'} 已按 ${selectedPath} 更新。`
                    );
                    return true;
                }
                const previousPath = getCurrentPath(state.p, state.keys);
                if (normalizeTextureLookupPath(previousPath) === normalizeTextureLookupPath(selectedPath)) {
                    close();
                    return true;
                }

                try {
                    const replacement = typeof prepareTextureReplacement === 'function'
                        ? prepareTextureReplacement(state.p, state.keys, selectedPath)
                        : null;
                    recordSkinUndoBeforeChange(`引用已有贴图: ${selectedPath}`, { force: true });
                    assignTextureParamLookup(state.keys, state.p, selectedPath);
                    syncParamInputValue(state.p.key, normalizeTextureLookupPath(selectedPath));
                    if (typeof completeTextureReplacement === 'function') {
                        completeTextureReplacement(replacement);
                    }
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
            if (search) {
                search.addEventListener('input', renderSources);
                search.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                        const effective = state.selectedPath || resolveEffectiveTypedPath(search.value);
                        if (effective) {
                            state.selectedPath = effective;
                            confirmSelection();
                        }
                    }
                });
            }
            modal.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                } else if (event.key === 'Enter') {
                    const effective = state.selectedPath || resolveEffectiveTypedPath(search ? search.value : '');
                    if (effective) {
                        event.preventDefault();
                        event.stopPropagation();
                        state.selectedPath = effective;
                        confirmSelection();
                    }
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
