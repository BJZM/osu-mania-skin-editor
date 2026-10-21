// ============================================================================
// texture-library-tab.js - 常驻“全部贴图”标签控制器
// 依赖：ui/texture-existing-sources.js、ui/texture-library-view.js
// ============================================================================

        let textureLibraryUi = null;

        function initTextureLibraryUI() {
            const view = byId('textureImageLibraryView');
            const grid = byId('textureImageLibraryGrid');
            const empty = byId('textureImageLibraryEmpty');
            const count = byId('textureImageLibraryCount');
            const search = byId('textureImageLibrarySearch');
            const modal = byId('textureImageLibraryActionModal');
            const title = byId('textureImageLibraryActionTitle');
            const text = byId('textureImageLibraryActionText');
            const sourceLabel = byId('textureImageLibraryActionSource');
            const field = byId('textureImageLibraryCopyField');
            const input = byId('textureImageLibraryCopyName');
            const error = byId('textureImageLibraryCopyError');
            const confirmBtn = byId('textureImageLibraryActionConfirmBtn');
            if (!view || !grid) return;

            const actionState = {
                mode: null,
                source: null,
                sources: [],
                busy: false
            };
            const libraryState = {
                sources: [],
                visibleSources: [],
                selectedPath: null
            };

            function markSelectedCard() {
                for (const card of grid.querySelectorAll('.texture-existing-card')) {
                    const selected = card.dataset.texturePath === libraryState.selectedPath;
                    card.classList.toggle('selected', selected);
                    card.setAttribute('aria-selected', selected ? 'true' : 'false');
                }
            }

            function selectPath(path) {
                libraryState.selectedPath = path || null;
                markSelectedCard();
            }

            function setActionError(message = '') {
                if (error) error.textContent = message;
                if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
            }

            function updateActionConfirm() {
                if (!confirmBtn) return;
                if (actionState.mode === 'copy') {
                    confirmBtn.disabled = actionState.busy || !input || !input.value.trim();
                } else {
                    confirmBtn.disabled = actionState.busy || !actionState.source;
                }
                confirmBtn.textContent = actionState.busy
                    ? (actionState.mode === 'copy' ? '正在复制...' : '正在删除...')
                    : (actionState.mode === 'copy' ? '复制贴图' : '删除贴图');
            }

            function closeAction() {
                if (actionState.busy) return;
                if (modal) modal.style.display = 'none';
                actionState.mode = null;
                actionState.source = null;
                actionState.sources = [];
                setActionError('');
            }

            function openAction(mode, source) {
                if (!source || !modal) return;
                actionState.mode = mode;
                actionState.source = source;
                actionState.sources = collectExistingTextureSources();
                actionState.busy = false;
                if (title) title.textContent = mode === 'copy' ? '复制贴图' : '删除贴图';
                if (text) {
                    text.textContent = mode === 'copy'
                        ? '请输入副本名称。扩展名会自动使用 .png，副本会保存到原贴图所在目录。'
                        : '删除后，引用该路径的参数会一并清除。可以通过撤销恢复。';
                }
                if (sourceLabel) {
                    const frames = source.frames.length > 1 ? ` · ${source.frames.length} 帧` : '';
                    sourceLabel.textContent = `${source.path}.png${frames}`;
                }
                if (field) field.style.display = mode === 'copy' ? 'flex' : 'none';
                if (input) input.value = '';
                setActionError('');
                if (confirmBtn) confirmBtn.classList.toggle('is-danger', mode === 'delete');
                updateActionConfirm();
                modal.style.display = 'flex';
                if (mode === 'copy' && input) setTimeout(() => input.focus(), 0);
            }

            function refreshAfterMutation() {
                updateEditorBaseAfterSave();
                renderTextureLibrary();
                renderPicker();
                drawFrame();
                renderSkinEditorParams();
                if (selectedCanvasElement) syncCanvasSelectedCard(selectedCanvasElement);
            }

            async function confirmAction() {
                if (!actionState.source || !actionState.mode || actionState.busy) return false;
                setActionError('');
                actionState.busy = true;
                updateActionConfirm();
                try {
                    if (actionState.mode === 'copy') {
                        const copyPath = validateTextureLibraryCopyPath(
                            actionState.source,
                            input ? input.value : '',
                            actionState.sources
                        );
                        const result = await copyTextureLibrarySource(actionState.source, copyPath);
                        actionState.busy = false;
                        closeAction();
                        refreshAfterMutation();
                        showToast(
                            '贴图副本已创建',
                            `${result.path}.png${result.frameCount > 1 ? `（${result.frameCount} 帧）` : ''}`
                        );
                    } else {
                        const result = deleteTextureLibrarySource(actionState.source);
                        actionState.busy = false;
                        closeAction();
                        refreshAfterMutation();
                        const referenceText = result.clearedReferences > 0
                            ? `，已清除 ${result.clearedReferences} 个路径引用`
                            : '';
                        showToast('贴图已删除', `${result.path}.png${referenceText}`);
                    }
                    return true;
                } catch (err) {
                    actionState.busy = false;
                    updateActionConfirm();
                    setActionError(err.message || '操作失败');
                    return false;
                }
            }

            function renderTextureLibrary() {
                if (!grid) return;
                if (!isSkinEditingWorkspaceReady()) {
                    libraryState.sources = [];
                    libraryState.visibleSources = [];
                    grid.innerHTML = '';
                    if (count) count.textContent = '0 项';
                    if (empty) {
                        empty.style.display = '';
                        empty.textContent = '请先导入皮肤或从默认皮肤开始';
                    }
                    return;
                }
                libraryState.sources = collectExistingTextureSources(
                    null,
                    currentSkinZip,
                    { expandAnimationFrames: true }
                );
                libraryState.visibleSources = filterExistingTextureSources(
                    libraryState.sources,
                    search ? search.value : ''
                );
                renderTextureLibraryGrid({
                    grid,
                    empty,
                    count,
                    allSources: libraryState.sources,
                    visibleSources: libraryState.visibleSources,
                    selectedPath: libraryState.selectedPath,
                    onSelect: selectPath,
                    onCopy: (source) => openAction('copy', source),
                    onDelete: (source) => openAction('delete', source)
                });

                if (typeof isDefaultSkinWorkspaceActive === 'function' && isDefaultSkinWorkspaceActive() &&
                    libraryState.sources.length === 0 &&
                    typeof loadDefaultSkin === 'function') {
                    loadDefaultSkin().then(() => {
                        if (typeof activeTabId !== 'undefined' && activeTabId === 'texture-library') {
                            renderTextureLibrary();
                        }
                    });
                }
            }

            if (search) search.addEventListener('input', renderTextureLibrary);
            if (input) {
                input.addEventListener('input', () => {
                    setActionError('');
                    updateActionConfirm();
                });
                input.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' || (confirmBtn && confirmBtn.disabled)) return;
                    event.preventDefault();
                    confirmAction();
                });
            }
            if (confirmBtn) confirmBtn.onclick = confirmAction;
            const cancelBtn = byId('textureImageLibraryActionCancelBtn');
            const closeBtn = byId('textureImageLibraryActionCloseBtn');
            const backdrop = byId('textureImageLibraryActionBackdrop');
            if (cancelBtn) cancelBtn.onclick = closeAction;
            if (closeBtn) closeBtn.onclick = closeAction;
            if (backdrop) backdrop.onclick = closeAction;
            if (modal) {
                modal.addEventListener('keydown', (event) => {
                    if (event.key !== 'Escape') return;
                    event.preventDefault();
                    event.stopPropagation();
                    closeAction();
                });
            }

            textureLibraryUi = {
                refresh: renderTextureLibrary,
                closeAction,
                selectPath,
                getState: () => ({
                    active: typeof activeTabId !== 'undefined' && activeTabId === 'texture-library',
                    sourceCount: libraryState.sources.length,
                    visibleCount: libraryState.visibleSources.length,
                    search: search ? search.value : '',
                    selectedPath: libraryState.selectedPath,
                    actionMode: actionState.mode
                })
            };
            window.renderTextureLibrary = renderTextureLibrary;
            renderTextureLibrary();
        }
