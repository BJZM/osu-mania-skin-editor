// ============================================================================
// editor-dialog.js - 皮肤编辑器弹窗、窗口拖拽、搜索与选中卡片交互
// 依赖：ui/param-render.js、ui/param-core.js
// ============================================================================

        let activeFloatingWindow = null;

        function bringFloatingWindowToFront(windowName) {
            const skinModal = document.getElementById('skinEditorModal');
            const textureModal = document.getElementById('textureImageEditorModal');

            if (windowName === 'skin-editor') {
                if (skinModal) skinModal.style.zIndex = '2400';
                if (textureModal) textureModal.style.zIndex = '2000';
                activeFloatingWindow = 'skin-editor';
            } else if (windowName === 'texture-editor') {
                if (textureModal) textureModal.style.zIndex = '2400';
                if (skinModal) skinModal.style.zIndex = '2000';
                activeFloatingWindow = 'texture-editor';
            }
        }

        function openSkinEditorDialog() {
            const modal = document.getElementById('skinEditorModal');
            if (!modal) return false;
            syncSkinEditingAvailabilityUI();
            modal.classList.add('active');
            bringFloatingWindowToFront('skin-editor');
            if (!isSkinEditingWorkspaceReady()) return true;
            updateSkinEditorKeyPills();
            renderSkinEditorParams();
            return true;
        }

        async function openSkinEditorDialogFromToolbar() {
            return openSkinEditorDialog();
        }

        function initSkinEditorDialogUI() {
            // 打开 / 关闭弹窗
            const openBtn = document.getElementById('openSkinEditorBtn');
            const closeBtn = document.getElementById('closeSkinEditorBtn');
            const backdrop = document.getElementById('skinEditorBackdrop');
            const modal = document.getElementById('skinEditorModal');

            const closeSkinEditor = () => {
                if (!modal) return;
                modal.classList.remove('active');
                if (activeFloatingWindow === 'skin-editor') {
                    const textureModal = document.getElementById('textureImageEditorModal');
                    if (textureModal && (textureModal.classList.contains('active') || textureModal.style.display !== 'none')) {
                        bringFloatingWindowToFront('texture-editor');
                    } else {
                        activeFloatingWindow = null;
                    }
                }
            };

            if (openBtn && modal) {
                openBtn.onclick = openSkinEditorDialogFromToolbar;
            }
            if (closeBtn && modal) {
                closeBtn.onclick = closeSkinEditor;
            }
            if (backdrop && modal) {
                backdrop.onclick = closeSkinEditor;
            }

            // 绑定可拖拽窗口及折叠/复位行为
            const dialog = document.getElementById('skinEditorDialog');
            const header = document.getElementById('skinEditorHeader');
            const dockBtn = document.getElementById('dockSkinEditorBtn');
            if (dialog) {
                dialog.addEventListener('mousedown', () => {
                    bringFloatingWindowToFront('skin-editor');
                });
            }
            const collapseBtn = document.getElementById('collapseSkinEditorBtn');

            if (dialog && header) {
                let isDraggingWindow = false;
                let dragStartX = 0, dragStartY = 0;
                let dialogStartLeft = 0, dialogStartTop = 0;

                header.addEventListener('mousedown', (e) => {
                    if (e.target.closest('button') || e.target.closest('input')) return;

                    isDraggingWindow = true;
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;

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
                        const deltaX = moveEvent.clientX - dragStartX;
                        const deltaY = moveEvent.clientY - dragStartY;

                        let nextLeft = dialogStartLeft + deltaX;
                        let nextTop = dialogStartTop + deltaY;

                        const maxLeft = window.innerWidth - 80;
                        const minLeft = -dialog.offsetWidth + 80;
                        const maxTop = window.innerHeight - 50;
                        const minTop = 0;

                        nextLeft = Math.max(minLeft, Math.min(maxLeft, nextLeft));
                        nextTop = Math.max(minTop, Math.min(maxTop, nextTop));

                        dialog.style.left = `${nextLeft}px`;
                        dialog.style.top = `${nextTop}px`;
                    };

                    const onMouseUp = () => {
                        if (isDraggingWindow) {
                            isDraggingWindow = false;
                            dialog.classList.remove('is-dragging');
                        }
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                    e.preventDefault();
                });

                // 双击标题栏折叠 / 展开
                header.addEventListener('dblclick', (e) => {
                    if (e.target.closest('button')) return;
                    if (collapseBtn) collapseBtn.click();
                });

                // 折叠 / 展开按钮
                if (collapseBtn) {
                    collapseBtn.onclick = () => {
                        const isCollapsed = dialog.classList.toggle('is-collapsed');
                        collapseBtn.textContent = isCollapsed ? '+' : '−';
                        collapseBtn.title = isCollapsed ? '展开窗口' : '折叠窗口';
                    };
                }

                // 恢复靠右停靠默认位置
                if (dockBtn) {
                    dockBtn.onclick = () => {
                        dialog.style.left = 'auto';
                        dialog.style.top = '48px';
                        dialog.style.right = '24px';
                        dialog.style.bottom = 'auto';
                        dialog.style.width = '680px';
                        dialog.style.height = '84vh';
                        dialog.classList.remove('is-collapsed');
                        if (collapseBtn) {
                            collapseBtn.textContent = '−';
                            collapseBtn.title = '折叠/展开窗口';
                        }
                    };
                }
            }

            // 判定提示动态演示开关
            const previewJudgementToggle = document.getElementById('previewJudgementToggle');
            if (previewJudgementToggle) {
                previewJudgementToggle.checked = isPreviewJudgementActive;
                previewJudgementToggle.onchange = (e) => {
                    setPreviewJudgementActive(e.target.checked);
                };
            }

            // 故事板渲染开关
            const storyboardToggle = document.getElementById('storyboardToggle');
            if (storyboardToggle) {
                storyboardToggle.checked = enableStoryboard;
                storyboardToggle.onchange = (e) => {
                    enableStoryboard = e.target.checked;
                    if (storyboardPlaybackState) {
                        storyboardPlaybackState.compositeDirty = true;
                    }
                    drawFrame();
                };
            }

            // 视频背景渲染开关
            const videoToggle = document.getElementById('videoToggle');
            if (videoToggle) {
                videoToggle.checked = enableVideo;
                videoToggle.onchange = (e) => {
                    enableVideo = e.target.checked;
                    if (storyboardPlaybackState) {
                        storyboardPlaybackState.compositeDirty = true;
                        if (!enableVideo && storyboardPlaybackState.video && storyboardPlaybackState.video.element) {
                            try { storyboardPlaybackState.video.element.pause(); } catch (_) {}
                        } else if (enableVideo) {
                            ensureStoryboardVideoLoaded(storyboardPlaybackState, true);
                            syncStoryboardVideoToTime(getPlaybackTimeSeconds() * 1000, isPlaying);
                        }
                    }
                    drawFrame();
                };
            }

            // 顶部菜单按钮与下拉容器
            const fileDropdown = document.getElementById('fileDropdownWrapper');
            const fileMenuBtn = document.getElementById('fileMenuBtn');
            const exportDropdown = document.getElementById('exportDropdownWrapper');
            const exportSkinBtn = document.getElementById('exportSkinBtn');
            const otherDropdown = document.getElementById('otherDropdownWrapper');
            const otherMenuBtn = document.getElementById('otherMenuBtn');
            const exportOskBtn = document.getElementById('exportOskBtn');
            const exportZipBtn = document.getElementById('exportZipBtn');
            const modalExportOskBtn = document.getElementById('modalExportOskBtn');
            const modalExportZipBtn = document.getElementById('modalExportZipBtn');

            const topbarDropdowns = [
                { button: fileMenuBtn, wrapper: fileDropdown },
                { button: ui.diffBtn, wrapper: ui.diffDropdown },
                { button: exportSkinBtn, wrapper: exportDropdown },
                { button: otherMenuBtn, wrapper: otherDropdown }
            ].filter(item => item.button && item.wrapper);

            const closeTopbarDropdowns = (exceptWrapper = null) => {
                topbarDropdowns.forEach(({ wrapper }) => {
                    if (wrapper !== exceptWrapper) wrapper.classList.remove('open');
                });
            };

            topbarDropdowns.forEach(({ button, wrapper }) => {
                button.onclick = (e) => {
                    e.stopPropagation();
                    const shouldOpen = !wrapper.classList.contains('open');
                    closeTopbarDropdowns();
                    wrapper.classList.toggle('open', shouldOpen);
                };
            });

            window.addEventListener('click', () => closeTopbarDropdowns());

            // 初始化谱面难度下拉列表
            renderDiffDropdownMenu();

            if (exportOskBtn) exportOskBtn.onclick = () => requestAndExportSkin('osk');
            if (exportZipBtn) exportZipBtn.onclick = () => requestAndExportSkin('zip');
            if (modalExportOskBtn) modalExportOskBtn.onclick = () => requestAndExportSkin('osk');
            if (modalExportZipBtn) modalExportZipBtn.onclick = () => requestAndExportSkin('zip');
            const useDefaultSkinBtn = document.getElementById('useDefaultSkinBtn');
            if (useDefaultSkinBtn) useDefaultSkinBtn.onclick = () => startFromDefaultSkin();

            // 搜索过滤与清空
            const searchInput = document.getElementById('paramSearchInput');
            const clearSearchBtn = document.getElementById('clearSearchBtn');
            if (searchInput) {
                searchInput.oninput = (e) => {
                    paramSearchQuery = e.target.value;
                    if (clearSearchBtn) clearSearchBtn.style.display = paramSearchQuery ? 'block' : 'none';
                    renderSkinEditorParams();
                };
            }
            if (clearSearchBtn && searchInput) {
                clearSearchBtn.onclick = () => {
                    searchInput.value = '';
                    paramSearchQuery = '';
                    clearSearchBtn.style.display = 'none';
                    renderSkinEditorParams();
                };
            }

            // Tab 标签页切换
            const tabs = document.querySelectorAll('#skinEditorTabs .tab-btn');
            tabs.forEach(btn => {
                btn.onclick = () => switchEditorTab(btn.dataset.tab);
            });

            // 动态初始化键数切换按钮 (仅展示实际从 skin.ini 中读取到的键位配置)
            updateSkinEditorKeyPills();

            // 重做、撤回与恢复初始皮肤按钮 (顶部编辑菜单与详细设置弹窗底部)
            const canvasRedoBtn = document.getElementById('canvasRedoBtn');
            const canvasUndoBtn = document.getElementById('canvasUndoBtn');
            const modalUndoBtn = document.getElementById('modalUndoBtn');
            if (canvasRedoBtn) canvasRedoBtn.onclick = () => performSkinRedo();
            if (canvasUndoBtn) canvasUndoBtn.onclick = () => performSkinUndo();
            if (modalUndoBtn) modalUndoBtn.onclick = () => performSkinUndo();
            updateUndoButtonState();

            const sidebarRevertBtn = document.getElementById('sidebarRevertSkinBtn');
            const modalRevertBtn = document.getElementById('modalRevertSkinBtn');
            if (sidebarRevertBtn) sidebarRevertBtn.onclick = () => revertSkinToInitial();
            if (modalRevertBtn) modalRevertBtn.onclick = () => revertSkinToInitial();

            // 重置当前组默认值与复制 raw skin.ini
            const resetBtn = document.getElementById('resetSkinParamsBtn');
            if (resetBtn) {
                resetBtn.onclick = () => {
                    if (confirm(window.I18n.t('确定要将当前分类下的所有参数恢复为推荐默认值吗？'))) {
                        recordSkinUndoBeforeChange('恢复分类默认值');
                        const items = SKIN_INI_PARAM_SCHEMA.filter(p => p.tab === activeEditorTab && !p.virtual);
                        for (const p of items) onParamChange(p.key, p.default);
                        continuousActionActive = false;
                        renderSkinEditorParams();
                    }
                };
            }

            const copyRawBtn = document.getElementById('copyRawIniBtn');
            if (copyRawBtn) {
                copyRawBtn.onclick = async () => {
                    const txt = generateSkinIniText();
                    try {
                        await navigator.clipboard.writeText(txt);
                        showToast('复制成功', '已将生成的完整 skin.ini 内容复制到剪贴板');
                    } catch (_) {
                        showToast('请手动复制', '浏览器剪贴板权限受限，请在下方全选文本');
                    }
                };
            }

            initSkinEditorCardControlsUI();
        }

        function initSkinEditorUI() {
            initSkinEditorDialogUI();
            initAnimationTextureEditorUI();
            initTextureUploadUI();
            initTextureExistingPickerUI();
            initTextureImageEditorUI();
            initCanvasEditorUI();
            initSkinEditorShortcutsUI();
        }
