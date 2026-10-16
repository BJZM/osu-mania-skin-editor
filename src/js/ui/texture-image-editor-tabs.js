// ============================================================================
// texture-image-editor-tabs.js - 贴图编辑器标签页与活动状态同步
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

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

        function captureLongBodyComposerState(composer) {
            if (!composer || !composer.active) return null;
            return {
                sessionKey: composer.sessionKey,
                baseFrames: composer.baseFrames.slice(),
                tailFrame: composer.tailFrame,
                bodySourceName: composer.bodySourceName,
                tailSourceName: composer.tailSourceName,
                tailScaledHeight: composer.tailScaledHeight,
                targetHeight: composer.targetHeight,
                coverage: composer.coverage,
                fade: composer.fade
            };
        }

        function longBodyComposerStatesEqual(a, b) {
            if (!a || !b) return false;
            if (a.sessionKey !== b.sessionKey ||
                a.tailFrame !== b.tailFrame ||
                a.bodySourceName !== b.bodySourceName ||
                a.tailSourceName !== b.tailSourceName ||
                a.tailScaledHeight !== b.tailScaledHeight ||
                a.targetHeight !== b.targetHeight ||
                a.coverage !== b.coverage ||
                a.fade !== b.fade ||
                a.baseFrames.length !== b.baseFrames.length) {
                return false;
            }
            return a.baseFrames.every((frame, index) => frame === b.baseFrames[index]);
        }

        function isTabDirty(tab) {
            if (!tab || tab.kind !== 'texture' || !tab.state.selected) return false;
            const tabState = tab.state;
            const longBodyDirty = tabState.longBodyComposer.active &&
                !longBodyComposerStatesEqual(
                    captureLongBodyComposerState(tabState.longBodyComposer),
                    tabState.savedLongBodyComposer
                );
            return longBodyDirty ||
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

        function syncActiveTabView(options = {}) {
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
            updateImageTransformInputs();
            updateImageTransformControlAvailability();
            updatePreviewZoomControls();
            updateSelectionSummary();
            updateLongBodyComposerUI();
            updateEditorHistoryButtons();
            if (options.installPreview !== false && state.selected && state.previewFrames.length > 0) {
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
                absorbExternalChanges();
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
