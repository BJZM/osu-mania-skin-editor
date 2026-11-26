// ============================================================================
// texture-image-editor-window.js - 贴图编辑器历史同步、打开/关闭与窗口拖拽
// 从 texture-image-editor-save-close.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function refreshTextureImageEditorAfterSkinHistory() {
            const modal = byId('textureImageEditorModal');
            if (!modal || !modal.classList.contains('active')) return false;

            const previousActiveTabId = activeTabId;
            let refreshedAny = false;
            const nextTabs = [];

            for (const tab of tabs) {
                if (!tab) continue;
                if (tab.kind === 'creator' && tab.creatorState && tab.creatorState.editPath) {
                    if (typeof hasCreatedTextureParams === 'function' &&
                        !hasCreatedTextureParams(tab.creatorState.editPath)) {
                        continue;
                    }
                    if (typeof createTextureCreatorState === 'function') {
                        const refreshedState = createTextureCreatorState({
                            editPath: tab.creatorState.editPath
                        });
                        refreshedState.paramKey = tab.creatorState.paramKey || null;
                        refreshedState.previewSnapshot = tab.creatorState.previewSnapshot || editorBaseSnapshot;
                        refreshedState.targetPickerOpen = tab.creatorState.targetPickerOpen;
                        refreshedState.targetCollapsedGroups = tab.creatorState.targetCollapsedGroups;
                        if (typeof captureTextureCreatorBaseline === 'function') {
                            refreshedState.baseline = captureTextureCreatorBaseline(refreshedState);
                        }
                        tab.creatorState = refreshedState;
                        if (typeof getTextureCreatorTabTitle === 'function') {
                            tab.title = getTextureCreatorTabTitle(refreshedState);
                        }
                        refreshedAny = true;
                    }
                    nextTabs.push(tab);
                    continue;
                }

                if (tab.kind !== 'texture' || !tab.target) {
                    nextTabs.push(tab);
                    continue;
                }

                const target = resolveRefreshedTabTarget(tab);
                if (!target) {
                    if (tab.state) clearEditorStateTimers(tab.state);
                    continue;
                }

                tab.target = target;
                if (target.kind === 'library' && target.p) {
                    tab.title = target.p.zhName;
                }
                initializeTextureTab(tab, { installPreview: false });
                if (target.p &&
                    typeof isEditingKeyImageParam === 'function' &&
                    isEditingKeyImageParam(target.p)) {
                    const recipe = getStoredTextureEditRecipe(tab.target);
                    if (recipe && typeof applyKeyImageHeightCropInputOverride === 'function') {
                        applyKeyImageHeightCropInputOverride(tab, { currentParams: recipe.params });
                    }
                }
                refreshedAny = true;
                nextTabs.push(tab);
            }

            tabs = nextTabs;
            if (!getTabById(previousActiveTabId)) {
                const fallbackTab = getTabById('texture-library') || menuTab;
                activeTabId = fallbackTab.id;
            }
            const activeTab = getActiveTab();
            if (activeTab && activeTab.kind === 'creator' && activeTab.creatorState) {
                textureCreatorState = activeTab.creatorState;
            }
            state = (activeTab && activeTab.kind === 'texture') ? activeTab.state : menuState;
            syncActiveTabView({ installPreview: false });
            if (activeTab && activeTab.kind === 'texture' && activeTab.target && activeTab.target.p &&
                typeof isEditingKeyImageParam === 'function' &&
                isEditingKeyImageParam(activeTab.target.p)) {
                const recipe = getStoredTextureEditRecipe(activeTab.target);
                if (recipe && typeof applyKeyImageHeightCropInputOverride === 'function') {
                    applyKeyImageHeightCropInputOverride(activeTab, { currentParams: recipe.params });
                }
            }
            if (typeof renderPicker === 'function') renderPicker();
            return refreshedAny;
        }

        function refreshTextureImageEditorAfterSkinImport() {
            const modal = byId('textureImageEditorModal');
            if (!modal || !modal.classList.contains('active')) return false;

            const activeTab = getActiveTab();
            const previousKind = activeTab ? activeTab.kind : 'menu';
            const previousParamKey = activeTab && activeTab.kind === 'texture' && activeTab.target && activeTab.target.p
                ? activeTab.target.p.key
                : null;

            for (const tab of tabs) {
                if (tab.state) clearEditorStateTimers(tab.state);
            }
            if (!hasActiveTextureProjectImport()) {
                longBodyComposerSessions.clear();
                textureEditRecipes.clear();
            }
            externalFrameUpdates.clear();
            externalChangesPending = false;

            Object.assign(menuState, createEditorState());
            state = menuState;
            tabs = [menuTab, libraryTab];
            activeTabId = menuTab.id;
            nextTextureTabId = 1;
            resetTextureCreatorState();

            editorBaseSnapshot = isSkinEditingWorkspaceReady()
                ? createSkinSnapshot('贴图编辑基线')
                : null;
            menuState.previewSnapshot = editorBaseSnapshot;
            renderTabs();
            renderPicker();
            if (textureLibraryUi) textureLibraryUi.refresh();

            if (editorBaseSnapshot && previousKind === 'texture' && previousParamKey) {
                const param = getTextureTabParams().find((item) => item.key === previousParamKey);
                const target = param ? buildEditorTarget(param) : null;
                if (target && target.selectable) {
                    selectTarget(target);
                    return true;
                }
            }

            if (editorBaseSnapshot && previousKind === 'library') {
                activateTab('texture-library', { force: true });
                return true;
            }

            setViews(true);
            updateSelectionSummary();
            updateEditorHistoryButtons();
            updateStretchFixUI();
            return true;
        }

        function open() {
            const modal = byId('textureImageEditorModal');
            if (!modal) return false;
            const skinEditingReady = syncSkinEditingAvailabilityUI();
            const wasClosing = modal.classList.contains('is-closing')
                || (typeof textureEditorCloseTimer !== 'undefined' && !!textureEditorCloseTimer);
            if (typeof textureEditorCloseToken !== 'undefined') {
                textureEditorCloseToken++;
            }
            if (typeof textureEditorCloseTimer !== 'undefined' && textureEditorCloseTimer) {
                clearTimeout(textureEditorCloseTimer);
                textureEditorCloseTimer = null;
            }
            modal.classList.remove('is-closing');
            if (modal.classList.contains('active') && !wasClosing) {
                if (typeof bringFloatingWindowToFront === 'function') {
                    bringFloatingWindowToFront('texture-editor');
                }
                return true;
            }
            if (wasClosing) {
                for (const tab of tabs) {
                    if (tab.kind === 'texture' && typeof clearEditorStateTimers === 'function') {
                        clearEditorStateTimers(tab.state);
                    }
                }
            }
            Object.assign(menuState, createEditorState());
            state = menuState;
            tabs = [menuTab, libraryTab];
            activeTabId = menuTab.id;
            nextTextureTabId = 1;
            externalFrameUpdates.clear();
            externalChangesPending = false;
            resetTextureCreatorState();
            renderTabs();
            updateSelectionSummary();
            updateEditorHistoryButtons();
            updateStretchFixUI();
            modal.classList.add('active');
            modal.style.display = 'block';
            if (typeof bringFloatingWindowToFront === 'function') {
                bringFloatingWindowToFront('texture-editor');
            }
            if (!skinEditingReady) return true;

            editorBaseSnapshot = createSkinSnapshot('贴图编辑基线');
            menuState.previewSnapshot = editorBaseSnapshot;
            renderPicker();
            setViews(true);
            return true;
        }

        async function closeTab(tabId) {
            const tab = getTabById(tabId);
            if (!tab || tab.kind === 'menu' || tab.kind === 'library') return false;
            if (activeTabId !== tab.id) activateTab(tab.id);
            commitActiveTabState();

            if (isTabDirty(tab)) {
                const decision = await requestUnsavedDecision({
                    title: getTabTitle(tab),
                    count: 1
                });
                if (decision === 'cancel') return false;
                if (decision === 'save') {
                    if (tab.kind === 'creator') {
                        return createTextureFromCreator();
                    }
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
            if (typeof textureEditorCloseTimer !== 'undefined' && textureEditorCloseTimer) {
                return true;
            }
            for (const tab of tabs) {
                if (tab.kind === 'texture') clearEditorStateTimers(tab.state);
            }
            finalizeEditorClose({ restoreSnapshot: true });
            return true;
        }

        async function close(options = {}) {
            if (typeof textureEditorCloseTimer !== 'undefined' && textureEditorCloseTimer) {
                return true;
            }
            commitActiveTabState();
            const dirtyTabs = tabs.filter(isTabDirty);
            if (dirtyTabs.length === 0) {
                const hasCreatorPreview = tabs.some(
                    (tab) => tab.kind === 'creator' && tab.creatorState && tab.creatorState.previewSnapshot
                );
                finalizeEditorClose({ restoreSnapshot: hasCreatorPreview });
                return true;
            }

            const preset = options && options.unsavedDecision;
            const decision = preset === 'save' || preset === 'discard' || preset === 'cancel'
                ? preset
                : await requestUnsavedDecision({
                    title: dirtyTabs[0] ? getTabTitle(dirtyTabs[0]) : '',
                    count: dirtyTabs.length
                });
            if (decision === 'cancel') return false;
            if (decision === 'discard') {
                finalizeEditorClose({ restoreSnapshot: true });
                return true;
            }

            for (const dirtyTab of dirtyTabs) {
                const current = getTabById(dirtyTab.id);
                if (!current) continue;
                activateTab(current.id);
                const saved = current.kind === 'creator'
                    ? await createTextureFromCreator()
                    : await applySelectedTexture({
                        closeTabAfterSave: true,
                        closeEditorWhenLast: false
                    });
                if (!saved) return false;
            }
            finalizeEditorClose({ restoreSnapshot: false });
            return true;
        }

        const getEl = typeof byId === 'function' ? byId : (id) => document.getElementById(id);
        const dialog = getEl('textureImageEditorDialog');
        const header = getEl('textureImageEditorHeader');
        const dockBtn = getEl('dockTextureImageEditorBtn');
        const collapseBtn = getEl('collapseTextureImageEditorBtn');

        if (dialog && header) {
            dialog.addEventListener('mousedown', () => {
                if (typeof bringFloatingWindowToFront === 'function') {
                    bringFloatingWindowToFront('texture-editor');
                }
            });

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
