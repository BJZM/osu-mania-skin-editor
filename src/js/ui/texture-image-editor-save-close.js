// ============================================================================
// texture-image-editor-save-close.js - 贴图保存、重置与编辑器关闭流程
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function refreshSavedTabTarget(savedTab) {
            if (!savedTab || savedTab.kind !== 'texture' || !savedTab.target || !savedTab.target.p) {
                return;
            }
            const p = getTextureTabParams().find((item) => item.key === savedTab.target.p.key);
            if (!p) return;
            const target = buildEditorTarget(p);
            if (!target || !target.selectable) return;
            savedTab.target = target;
            if (getActiveTab() === savedTab) state.selected = target;
        }

        function completeSavedTab(options = {}) {
            const savedTab = getActiveTab();
            if (!savedTab || savedTab.kind !== 'texture') return false;
            if (typeof clearKeyImageHeightBaselines === 'function') {
                clearKeyImageHeightBaselines();
            }
            refreshSavedTabTarget(savedTab);
            rememberTextureEditRecipe(savedTab);
            updateEditorBaseAfterSave();
            renderPicker();

            if (options.closeTabAfterSave !== true) {
                savedTab.state.previewSnapshot = editorBaseSnapshot;
                savedTab.state.savedLongBodyComposer = captureLongBodyComposerState(savedTab.state.longBodyComposer);
                savedTab.state.keyImageEditRecipe = null;
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
            const editingKeyImage = isEditingKeyImageParam(state.selected.p);
            const longBodyApplyScope = state.longBodyComposer.active
                ? await requestLongBodyApplyScope()
                : null;
            if (state.longBodyComposer.active && !longBodyApplyScope) return false;
            const keyImageApplyScope = editingKeyImage
                ? await requestLongBodyApplyScope({
                    title: '选择 KeyImage 应用范围',
                    text: '仅当前轨道会同时更新 KeyImage 与 KeyImageD。应用到全部轨道时，引用相同贴图的轨道共用一份新贴图，引用不同的贴图会分别生成。',
                    currentLabel: '仅当前轨道',
                    allLabel: '应用到全部轨道'
                })
                : null;
            if (editingKeyImage && !keyImageApplyScope) return false;
            const longBodyTargetColumns = longBodyApplyScope === 'all'
                ? Array.from({ length: getActiveKeyCount() }, (_, column) => column)
                : [getSelectedTrackIndex()].filter((column) => column != null);
            const applyingAll = longBodyApplyScope === 'all' || keyImageApplyScope === 'all';

            const applyBtn = byId('textureImageApplyBtn');
            if (applyBtn) {
                applyBtn.disabled = true;
                applyBtn.textContent = '正在应用...';
            }

            try {
                const committingLongBodyComposer = state.longBodyComposer.active;
                if (editingKeyImage && !committingLongBodyComposer) {
                    const groups = collectKeyImageEditGroups(keyImageApplyScope);
                    if (groups.length === 0) {
                        throw new Error('没有找到可应用的 KeyImage 源贴图');
                    }
                    const params = state.keyImageEditRecipe && state.keyImageEditRecipe.params
                        ? {
                            ...state.keyImageEditRecipe.params,
                            imageTransform: cloneImageTransform(
                                state.keyImageEditRecipe.params.imageTransform
                            )
                        }
                        : getCurrentEditParams();
                    if (state.previewSnapshot) applySkinSnapshot(state.previewSnapshot);
                    recordSkinUndoBeforeChange(
                        keyImageApplyScope === 'all'
                            ? '贴图编辑: KeyImage（全部轨道）'
                            : '贴图编辑: KeyImage（当前轨道）',
                        { force: true }
                    );
                    const prepared = await persistKeyImageEditGroups(groups, params);
                    if (!prepared) throw new Error('KeyImage 贴图未能写入皮肤');
                    rememberPreparedKeyImageEditRecipes(prepared, params);
                    const trackCount = prepared.reduce(
                        (count, item) => count + item.group.entries.length,
                        0
                    );
                    showToast(
                        '贴图编辑成功',
                        `已更新 ${trackCount} 个 KeyImage/KeyImageD 参数，生成 ${prepared.length} 份贴图。`
                    );
                    return completeSavedTab(options);
                }
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
            state.keyImageEditRecipe = null;
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
            externalFrameUpdates.clear();
            externalChangesPending = false;
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
