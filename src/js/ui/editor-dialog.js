// ============================================================================
// editor-dialog.js - 皮肤编辑器弹窗、窗口拖拽、搜索与选中卡片交互
// 依赖：ui/param-render.js、ui/param-core.js
// ============================================================================

        function initSkinEditorDialogUI() {
            // 打开 / 关闭弹窗
            const openBtn = document.getElementById('openSkinEditorBtn');
            const closeBtn = document.getElementById('closeSkinEditorBtn');
            const backdrop = document.getElementById('skinEditorBackdrop');
            const modal = document.getElementById('skinEditorModal');

            if (openBtn && modal) {
                openBtn.onclick = async () => {
                    if (textureImageEditorUi) {
                        const closed = await textureImageEditorUi.close();
                        if (closed === false) return;
                    }
                    modal.classList.add('active');
                    updateSkinEditorKeyPills();
                    renderSkinEditorParams();
                };
            }
            if (closeBtn && modal) {
                closeBtn.onclick = () => modal.classList.remove('active');
            }
            if (backdrop && modal) {
                backdrop.onclick = () => modal.classList.remove('active');
            }

            // 绑定可拖拽窗口及折叠/复位行为
            const dialog = document.getElementById('skinEditorDialog');
            const header = document.getElementById('skinEditorHeader');
            const dockBtn = document.getElementById('dockSkinEditorBtn');
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

            // 画布直接编辑开关
            const editToggle = document.getElementById('canvasEditModeToggle');
            if (editToggle) {
                editToggle.checked = canvasEditMode;
                editToggle.onchange = (e) => {
                    canvasEditMode = e.target.checked;
                    if (!canvasEditMode) {
                        selectedCanvasElement = null;
                        const card = document.getElementById('canvasSelectedCard');
                        if (card) card.style.display = 'none';
                    }
                    drawFrame();
                };
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

            // 编辑、导出与难度选择下拉菜单与按钮
            const editDropdown = document.getElementById('editDropdownWrapper');
            const editMenuBtn = document.getElementById('editMenuBtn');
            const exportDropdown = document.getElementById('exportDropdownWrapper');
            const exportSkinBtn = document.getElementById('exportSkinBtn');
            const exportOskBtn = document.getElementById('exportOskBtn');
            const exportZipBtn = document.getElementById('exportZipBtn');
            const modalExportOskBtn = document.getElementById('modalExportOskBtn');
            const modalExportZipBtn = document.getElementById('modalExportZipBtn');

            // 谱面难度选择下拉菜单
            if (ui.diffBtn && ui.diffDropdown) {
                ui.diffBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (editDropdown) editDropdown.classList.remove('open');
                    if (exportDropdown) exportDropdown.classList.remove('open');
                    ui.diffDropdown.classList.toggle('open');
                };
            }

            if (editMenuBtn && editDropdown) {
                editMenuBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (ui.diffDropdown) ui.diffDropdown.classList.remove('open');
                    if (exportDropdown) exportDropdown.classList.remove('open');
                    editDropdown.classList.toggle('open');
                };
            }

            if (exportSkinBtn && exportDropdown) {
                exportSkinBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (ui.diffDropdown) ui.diffDropdown.classList.remove('open');
                    if (editDropdown) editDropdown.classList.remove('open');
                    exportDropdown.classList.toggle('open');
                };
            }

            window.addEventListener('click', () => {
                if (editDropdown) editDropdown.classList.remove('open');
                if (exportDropdown) exportDropdown.classList.remove('open');
                if (ui.diffDropdown) ui.diffDropdown.classList.remove('open');
            });

            // 初始化谱面难度下拉列表
            renderDiffDropdownMenu();

            if (exportOskBtn) exportOskBtn.onclick = () => exportSkin('osk');
            if (exportZipBtn) exportZipBtn.onclick = () => exportSkin('zip');
            if (modalExportOskBtn) modalExportOskBtn.onclick = () => exportSkin('osk');
            if (modalExportZipBtn) modalExportZipBtn.onclick = () => exportSkin('zip');

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
                    if (confirm('确定要将当前分类下的所有参数恢复为推荐默认值吗？')) {
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

            // 画布悬浮气泡卡片操作按钮绑定
            const cardCloseBtn = document.getElementById('cardCloseBtn');
            const cardLocateBtn = document.getElementById('cardLocateParamBtn');
            const cardReplaceBtn = document.getElementById('cardReplaceTextureBtn');
            const cardReplaceScorebarBgBtn = document.getElementById('cardReplaceScorebarBgBtn');
            const cardReplaceScorebarColourBtn = document.getElementById('cardReplaceScorebarColourBtn');
            const cardWidthDecBtn = document.getElementById('cardWidthDecBtn');
            const cardWidthIncBtn = document.getElementById('cardWidthIncBtn');
            const cardSpacingDecBtn = document.getElementById('cardSpacingDecBtn');
            const cardSpacingIncBtn = document.getElementById('cardSpacingIncBtn');
            const cardPosDecBtn = document.getElementById('cardPosDecBtn');
            const cardPosIncBtn = document.getElementById('cardPosIncBtn');
            const cardPosValEl = document.getElementById('cardPosVal');

            if (cardCloseBtn) {
                cardCloseBtn.onclick = () => {
                    selectedCanvasElement = null;
                    const card = document.getElementById('canvasSelectedCard');
                    if (card) card.style.display = 'none';
                    drawFrame();
                };
            }
            if (cardLocateBtn) {
                cardLocateBtn.onclick = () => {
                    if (!selectedCanvasElement) return;
                    if (selectedCanvasElement.id.startsWith('track_col_')) {
                        focusParameter(['ColumnWidth', 'ColumnSpacing', 'ColumnColour']);
                    } else {
                        focusParameter(selectedCanvasElement.paramKey);
                    }
                };
            }
            const cardApplyAllTracksBtn = document.getElementById('cardApplyAllTracksBtn');
            if (cardApplyAllTracksBtn) {
                cardApplyAllTracksBtn.onclick = () => {
                    if (!selectedCanvasElement || !selectedCanvasElement.id.startsWith('track_col_')) return;
                    const col = selectedCanvasElement.colIndex;
                    const keys = getActiveKeyCount();
                    let cfg = maniaSkinConfigurations.get(keys);
                    if (!cfg) {
                        cfg = ensureManiaConfigForKeys(keys);
                        maniaSkinConfigurations.set(keys, cfg);
                    }
                    if (!Array.isArray(cfg.ColumnWidth)) cfg.ColumnWidth = new Array(keys).fill(30);
                    while (cfg.ColumnWidth.length < keys) cfg.ColumnWidth.push(30);
                    const spacingCount = Math.max(0, keys - 1);
                    if (!Array.isArray(cfg.ColumnSpacing)) cfg.ColumnSpacing = new Array(spacingCount).fill(0);
                    while (cfg.ColumnSpacing.length < spacingCount) cfg.ColumnSpacing.push(0);

                    const curW = cfg.ColumnWidth[col] != null ? cfg.ColumnWidth[col] : 30;
                    const spacingIdx = (col > 0) ? (col - 1) : 0;
                    const curS = cfg.ColumnSpacing[spacingIdx] != null ? cfg.ColumnSpacing[spacingIdx] : 0;

                    // 统一前先校验轨道区总宽度：统一后若超限则直接阻止，避免全轨宽度异常
                    const uniformTotal = keys * curW + (keys - 1) * curS;
                    if (uniformTotal > getTrackMaxWidth480(cfg, keys)) {
                        notifyTrackWidthLimit(
                            '全轨统一列宽/间距',
                            '统一为 ' + curW + 'px 列宽' + (curS > 0 ? ' + ' + curS + 'px 间距' : '') + ' 后总宽度为 ' + Math.round(uniformTotal)
                        );
                        return;
                    }
                    recordSkinUndoBeforeChange('将当前轨宽与间距应用给所有轨道');
                    for (let i = 0; i < keys; i++) {
                        cfg.ColumnWidth[i] = curW;
                        if (i < keys - 1) {
                            cfg.ColumnSpacing[i] = curS;
                        }
                    }
                    continuousActionActive = false;
                    syncColumnRightFromLayout(cfg, keys);
                    drawFrame();
                    syncParamInputValue('ColumnWidth', cfg.ColumnWidth);
                    syncParamInputValue('ColumnSpacing', cfg.ColumnSpacing);
                    syncCanvasSelectedCard(selectedCanvasElement);
                    showToast('已应用给所有轨道', `全部 ${keys} 轨列宽已统一为 ${curW}px${curS > 0 ? `，间距已统一为 ${curS}px` : ''}`);
                };
            }

            // 卡片第 2 行轨道底色与透明度调节事件绑定
            const cardColPicker = document.getElementById('cardColPicker');
            const cardColOpacitySlider = document.getElementById('cardColOpacitySlider');
            const cardColOpacityVal = document.getElementById('cardColOpacityVal');
            const cardApplyAllColourBtn = document.getElementById('cardApplyAllColourBtn');

            function updateTrackColourFromCard(isFinal = false) {
                if (!selectedCanvasElement || !selectedCanvasElement.id.startsWith('track_col_')) return;
                const col = selectedCanvasElement.colIndex;
                const keys = getActiveKeyCount();
                let cfg = maniaSkinConfigurations.get(keys);
                if (!cfg) {
                    cfg = ensureManiaConfigForKeys(keys);
                    maniaSkinConfigurations.set(keys, cfg);
                }
                if (!cfg.ColumnColour) {
                    cfg.ColumnColour = new Array(keys).fill(null).map(() => ({ r: 0, g: 0, b: 0, a: 255 }));
                }
                while (cfg.ColumnColour.length < keys) {
                    cfg.ColumnColour.push({ r: 0, g: 0, b: 0, a: 255 });
                }

                const hex = cardColPicker ? cardColPicker.value : '#000000';
                const r = parseInt(hex.slice(1, 3), 16) || 0;
                const g = parseInt(hex.slice(3, 5), 16) || 0;
                const b = parseInt(hex.slice(5, 7), 16) || 0;
                const a = cardColOpacitySlider ? parseInt(cardColOpacitySlider.value, 10) : 255;
                if (cardColOpacityVal) cardColOpacityVal.textContent = `${a}`;
                if (cardColOpacitySlider) {
                    const pct = ((a / 255) * 100).toFixed(1) + '%';
                    cardColOpacitySlider.style.setProperty('--slider-pct', pct);
                }

                if (isFinal) {
                    recordSkinUndoBeforeChange(`调整第 ${col + 1} 轨底色与透明度`);
                }
                cfg.ColumnColour[col] = { r, g, b, a };
                if (isFinal) {
                    continuousActionActive = false;
                }
                drawFrame();
                const modal = document.getElementById('skinEditorModal');
                if (modal && modal.classList.contains('active')) {
                    renderSkinEditorParams();
                }
            }

            if (cardColPicker) {
                cardColPicker.oninput = () => updateTrackColourFromCard(false);
                cardColPicker.onchange = () => updateTrackColourFromCard(true);
            }
            if (cardColOpacitySlider) {
                cardColOpacitySlider.oninput = () => updateTrackColourFromCard(false);
                cardColOpacitySlider.onchange = () => updateTrackColourFromCard(true);
            }
            if (cardApplyAllColourBtn) {
                cardApplyAllColourBtn.onclick = () => {
                    if (!selectedCanvasElement || !selectedCanvasElement.id.startsWith('track_col_')) return;
                    const col = selectedCanvasElement.colIndex;
                    const keys = getActiveKeyCount();
                    let cfg = maniaSkinConfigurations.get(keys);
                    if (!cfg) {
                        cfg = ensureManiaConfigForKeys(keys);
                        maniaSkinConfigurations.set(keys, cfg);
                    }
                    if (!cfg.ColumnColour) {
                        cfg.ColumnColour = new Array(keys).fill(null).map(() => ({ r: 0, g: 0, b: 0, a: 255 }));
                    }
                    while (cfg.ColumnColour.length < keys) {
                        cfg.ColumnColour.push({ r: 0, g: 0, b: 0, a: 255 });
                    }

                    const hex = cardColPicker ? cardColPicker.value : '#000000';
                    const r = parseInt(hex.slice(1, 3), 16) || 0;
                    const g = parseInt(hex.slice(3, 5), 16) || 0;
                    const b = parseInt(hex.slice(5, 7), 16) || 0;
                    const a = cardColOpacitySlider ? parseInt(cardColOpacitySlider.value, 10) : 255;

                    recordSkinUndoBeforeChange('将当前轨底色与透明度应用给所有轨道');
                    for (let i = 0; i < keys; i++) {
                        cfg.ColumnColour[i] = { r, g, b, a };
                    }
                    continuousActionActive = false;
                    drawFrame();
                    const modal = document.getElementById('skinEditorModal');
                    if (modal && modal.classList.contains('active')) {
                        renderSkinEditorParams();
                    }
                    showToast('已应用全轨同色', `全部 ${keys} 轨底色已统一为 RGBA(${r}, ${g}, ${b}, ${a})`);
                };
            }
            const cardLocateComboTextureBtn = document.getElementById('cardLocateComboTextureBtn');
            if (cardLocateComboTextureBtn) {
                cardLocateComboTextureBtn.onclick = () => {
                    focusComboTexture();
                };
            }

            // 连击悬浮卡片第 2、3 行：直接编辑 Hold 变色与断连遮罩，并在画布上实时预览。
            const cardComboHoldPicker = document.getElementById('cardComboHoldPicker');
            const cardComboHoldAlpha = document.getElementById('cardComboHoldAlpha');
            const cardComboHoldAlphaVal = document.getElementById('cardComboHoldAlphaVal');
            const cardComboHoldPreviewBtn = document.getElementById('cardComboHoldPreviewBtn');
            const cardComboBreakPicker = document.getElementById('cardComboBreakPicker');
            const cardComboBreakPreviewBtn = document.getElementById('cardComboBreakPreviewBtn');

            function getSelectedComboConfig() {
                if (!selectedCanvasElement || selectedCanvasElement.id !== 'combo') return null;
                return ensureManiaConfigForKeys(getActiveKeyCount());
            }

            function refreshComboColourParamPanel() {
                const modal = document.getElementById('skinEditorModal');
                if (modal && modal.classList.contains('active')) {
                    renderSkinEditorParams();
                }
                if (selectedCanvasElement && selectedCanvasElement.id === 'combo') {
                    syncCanvasSelectedCard(selectedCanvasElement);
                }
            }

            function updateComboHoldFromCard(isFinal = false) {
                const cfg = getSelectedComboConfig();
                if (!cfg) return;

                recordSkinUndoBeforeChange('调整 Hold 连击数字变色');
                const hex = cardComboHoldPicker ? cardComboHoldPicker.value : '#ffbf33';
                const r = parseInt(hex.slice(1, 3), 16) || 0;
                const g = parseInt(hex.slice(3, 5), 16) || 0;
                const b = parseInt(hex.slice(5, 7), 16) || 0;
                const a = cardComboHoldAlpha ? parseInt(cardComboHoldAlpha.value, 10) : 255;
                cfg.ColourHold = { r, g, b, a };

                if (cardComboHoldAlphaVal) cardComboHoldAlphaVal.textContent = `${a}`;
                if (cardComboHoldAlpha) {
                    cardComboHoldAlpha.style.setProperty('--slider-pct', `${((a / 255) * 100).toFixed(1)}%`);
                }
                testHoldingUntil = performance.now() + 2500;
                if (isFinal) continuousActionActive = false;
                drawFrame();
                refreshComboColourParamPanel();
            }

            function updateComboBreakFromCard(isFinal = false) {
                const cfg = getSelectedComboConfig();
                if (!cfg) return;

                recordSkinUndoBeforeChange('调整断连遮罩颜色');
                const hex = cardComboBreakPicker ? cardComboBreakPicker.value : '#ff0000';
                const r = parseInt(hex.slice(1, 3), 16) || 0;
                const g = parseInt(hex.slice(3, 5), 16) || 0;
                const b = parseInt(hex.slice(5, 7), 16) || 0;
                cfg.ComboBreakColour = { r, g, b, a: 255 };

                if (isFinal) continuousActionActive = false;
                triggerComboBreakPreview();
                refreshComboColourParamPanel();
            }

            if (cardComboHoldPicker) {
                cardComboHoldPicker.oninput = () => updateComboHoldFromCard(false);
                cardComboHoldPicker.onchange = () => updateComboHoldFromCard(true);
            }
            if (cardComboHoldAlpha) {
                cardComboHoldAlpha.oninput = () => updateComboHoldFromCard(false);
                cardComboHoldAlpha.onchange = () => updateComboHoldFromCard(true);
            }
            if (cardComboHoldPreviewBtn) {
                cardComboHoldPreviewBtn.onclick = () => {
                    testHoldingUntil = performance.now() + 2500;
                    drawFrame();
                };
            }
            if (cardComboBreakPicker) {
                cardComboBreakPicker.oninput = () => updateComboBreakFromCard(false);
                cardComboBreakPicker.onchange = () => updateComboBreakFromCard(true);
            }
            if (cardComboBreakPreviewBtn) {
                cardComboBreakPreviewBtn.onclick = () => {
                    triggerComboBreakPreview();
                };
            }
            const cardPreviewJudgementBtn = document.getElementById('cardPreviewJudgementBtn');
            if (cardPreviewJudgementBtn) {
                cardPreviewJudgementBtn.onclick = () => {
                    setPreviewJudgementActive(!isPreviewJudgementActive);
                };
            }

            // 轨道拖拽模式切换按钮绑定
            const trackModeWidthBtn = document.getElementById('trackModeWidthBtn');
            const trackModeSpacingBtn = document.getElementById('trackModeSpacingBtn');
            const setTrackDragMode = (mode) => {
                currentTrackDragMode = mode;
                if (trackModeWidthBtn) {
                    if (mode === 'width') trackModeWidthBtn.classList.add('active');
                    else trackModeWidthBtn.classList.remove('active');
                }
                if (trackModeSpacingBtn) {
                    if (mode === 'spacing') trackModeSpacingBtn.classList.add('active');
                    else trackModeSpacingBtn.classList.remove('active');
                }
                if (selectedCanvasElement) drawFrame();
            };
            if (trackModeWidthBtn) trackModeWidthBtn.onclick = () => setTrackDragMode('width');
            if (trackModeSpacingBtn) trackModeSpacingBtn.onclick = () => setTrackDragMode('spacing');

            // 卡片快捷调节单轨列宽与列间距步进函数 (两轨间最小间距严格限制为0)
            const stepSelectedTrackWidth = (delta) => {
                if (!selectedCanvasElement) return;

                if (selectedCanvasElement.dragType === 'score_percent_width') {
                    const currentWidth = getScorePercentPaddingWidth(getActiveKeyCount());
                    const nextWidth = clampScorePercentPaddingWidth(currentWidth + delta);
                    setScorePercentPaddingWidth(nextWidth, getActiveKeyCount());
                    drawFrame();
                    syncParamInputValue('ScorePercentWidth', nextWidth);
                    syncParamInputValue('ScorePercentVisible', false);
                    syncCanvasSelectedCard(selectedCanvasElement);
                    return;
                }

                // 打击特效宽度 (LightingNWidth / LightingLWidth)：同一个「宽度」步进器复用给逐轨宽度与特效宽度
                if (selectedCanvasElement.dragType === 'lighting_width') {
                    const lwCol = selectedCanvasElement.colIndex;
                    const widthKey = selectedCanvasElement.paramKey;
                    const lwKeys = getActiveKeyCount();
                    let lwCfg = maniaSkinConfigurations.get(lwKeys);
                    if (!lwCfg) {
                        lwCfg = ensureManiaConfigForKeys(lwKeys);
                        maniaSkinConfigurations.set(lwKeys, lwCfg);
                    }
                    if (!Array.isArray(lwCfg[widthKey])) lwCfg[widthKey] = new Array(lwKeys).fill(0);
                    while (lwCfg[widthKey].length < lwKeys) lwCfg[widthKey].push(0);
                    // 未显式配置时以「当前列宽」为起点，避免从 0 开始跳变
                    const rawCwRes2 = getManiaSkinConfig(lwKeys, LML.ColumnWidth, lwCol);
                    const rawCw2 = (rawCwRes2 && rawCwRes2.value > 0) ? rawCwRes2.value : 30;
                    const lwCur = (lwCfg[widthKey][lwCol] != null && lwCfg[widthKey][lwCol] > 0) ? lwCfg[widthKey][lwCol] : rawCw2;
                    lwCfg[widthKey][lwCol] = Math.max(0, Math.min(300, Math.round(lwCur + delta)));
                    drawFrame();
                    syncParamInputValue(widthKey, lwCfg[widthKey]);
                    syncCanvasSelectedCard(selectedCanvasElement);
                    return;
                }

                if (!selectedCanvasElement.id.startsWith('track_col_')) return;
                const col = selectedCanvasElement.colIndex;
                const keys = getActiveKeyCount();
                let cfg = maniaSkinConfigurations.get(keys);
                if (!cfg) {
                    cfg = ensureManiaConfigForKeys(keys);
                    maniaSkinConfigurations.set(keys, cfg);
                }
                if (!Array.isArray(cfg.ColumnWidth)) cfg.ColumnWidth = new Array(keys).fill(30);
                while (cfg.ColumnWidth.length < keys) cfg.ColumnWidth.push(30);
                const cur = cfg.ColumnWidth[col] != null ? cfg.ColumnWidth[col] : 30;
                let next = Math.max(5, Math.min(300, Math.round(cur + delta)));
                // 轨道区最大总宽度保护：增大到上限即停住并提示
                const boundW = getTrackParamUpperBound(cfg, keys, 'ColumnWidth', col);
                if (next > boundW.maxAllowed) {
                    next = Math.max(5, Math.floor(boundW.maxAllowed));
                    if (delta > 0) notifyTrackWidthLimit(`第 ${col + 1} 轨列宽`);
                }
                cfg.ColumnWidth[col] = next;
                syncColumnRightFromLayout(cfg, keys);
                drawFrame();
                syncParamInputValue('ColumnWidth', cfg.ColumnWidth);
                syncCanvasSelectedCard(selectedCanvasElement);
            };

            const stepSelectedTrackSpacing = (delta) => {
                if (!selectedCanvasElement || !selectedCanvasElement.id.startsWith('track_col_')) return;
                const col = selectedCanvasElement.colIndex;
                if (col <= 0) return; // 第一轨无前距
                const keys = getActiveKeyCount();
                const spacingIdx = col - 1;
                let cfg = maniaSkinConfigurations.get(keys);
                if (!cfg) {
                    cfg = ensureManiaConfigForKeys(keys);
                    maniaSkinConfigurations.set(keys, cfg);
                }
                const spacingCount = Math.max(0, keys - 1);
                if (!Array.isArray(cfg.ColumnSpacing)) cfg.ColumnSpacing = new Array(spacingCount).fill(0);
                while (cfg.ColumnSpacing.length < spacingCount) cfg.ColumnSpacing.push(0);
                const cur = cfg.ColumnSpacing[spacingIdx] != null ? cfg.ColumnSpacing[spacingIdx] : 0;
                // 核心规则：两个轨道之间的最小间距为 0
                let next = Math.max(0, Math.min(200, Math.round(cur + delta)));
                // 轨道区最大总宽度保护：增大到上限即停住并提示
                const boundS = getTrackParamUpperBound(cfg, keys, 'ColumnSpacing', spacingIdx);
                if (next > boundS.maxAllowed) {
                    next = Math.max(0, Math.floor(boundS.maxAllowed));
                    if (delta > 0) notifyTrackWidthLimit(`第 ${spacingIdx + 1} 轨与第 ${spacingIdx + 2} 轨间距`);
                }
                cfg.ColumnSpacing[spacingIdx] = next;
                syncColumnRightFromLayout(cfg, keys);
                drawFrame();
                syncParamInputValue('ColumnSpacing', cfg.ColumnSpacing);
                syncCanvasSelectedCard(selectedCanvasElement);
            };

            const widthStepDesc = () => {
                if (selectedCanvasElement && selectedCanvasElement.dragType === 'score_percent_width') {
                    return '调整准度与进度饼图位置';
                }
                if (selectedCanvasElement && selectedCanvasElement.dragType === 'lighting_width') {
                    return `微调${selectedCanvasElement.name}宽度`;
                }
                return '微调轨道宽度';
            };
            if (cardWidthDecBtn) cardWidthDecBtn.onclick = (e) => {
                recordSkinUndoBeforeChange(widthStepDesc());
                continuousActionActive = false;
                stepSelectedTrackWidth(e.shiftKey ? -5 : -1);
            };
            if (cardWidthIncBtn) cardWidthIncBtn.onclick = (e) => {
                recordSkinUndoBeforeChange(widthStepDesc());
                continuousActionActive = false;
                stepSelectedTrackWidth(e.shiftKey ? 5 : 1);
            };
            if (cardSpacingDecBtn) cardSpacingDecBtn.onclick = (e) => {
                recordSkinUndoBeforeChange('微调轨道间距');
                continuousActionActive = false;
                stepSelectedTrackSpacing(e.shiftKey ? -5 : -1);
            };
            if (cardSpacingIncBtn) cardSpacingIncBtn.onclick = (e) => {
                recordSkinUndoBeforeChange('微调轨道间距');
                continuousActionActive = false;
                stepSelectedTrackSpacing(e.shiftKey ? 5 : 1);
            };

            // 卡片快捷调节位置与数值参数步进函数 (针对连击数、判定线、判定评价、光效高度等)
            const stepSelectedPos = (delta) => {
                if (!selectedCanvasElement) return;
                const paramKey = selectedCanvasElement.paramKey;
                if (!paramKey) return;
                const keys = getActiveKeyCount();
                let cfg = maniaSkinConfigurations.get(keys);
                if (!cfg) {
                    cfg = ensureManiaConfigForKeys(keys);
                    maniaSkinConfigurations.set(keys, cfg);
                }

                let curVal = 0;
                if (paramKey === 'ComboPosition') {
                    curVal = (cfg.ComboPosition != null) ? cfg.ComboPosition : 111;
                } else if (paramKey === 'ScorePosition') {
                    curVal = (cfg.ScorePosition != null) ? cfg.ScorePosition : 300;
                } else if (paramKey === 'HitPosition') {
                    curVal = (cfg.HitPosition != null) ? cfg.HitPosition : 402;
                } else if (paramKey === 'LightPosition') {
                    curVal = (cfg.LightPosition != null) ? cfg.LightPosition : 413;
                } else if (typeof cfg[paramKey] === 'number') {
                    curVal = cfg[paramKey];
                } else {
                    return;
                }

                const nextVal = Math.max(0, Math.min(1000, Math.round(curVal + delta)));
                cfg[paramKey] = nextVal;
                drawFrame();
                syncParamInputValue(paramKey, nextVal);
                syncCanvasSelectedCard(selectedCanvasElement);
            };

            if (cardPosDecBtn) cardPosDecBtn.onclick = (e) => {
                recordSkinUndoBeforeChange(`微调${selectedCanvasElement ? selectedCanvasElement.name : '数值'}`);
                continuousActionActive = false;
                stepSelectedPos(e.shiftKey ? -5 : -1);
            };
            if (cardPosIncBtn) cardPosIncBtn.onclick = (e) => {
                recordSkinUndoBeforeChange(`微调${selectedCanvasElement ? selectedCanvasElement.name : '数值'}`);
                continuousActionActive = false;
                stepSelectedPos(e.shiftKey ? 5 : 1);
            };
            // 打击特效宽度数值：点击可直接输入（与位置数值同样的交互习惯）
            const cardWidthValEl = document.getElementById('cardWidthVal');
            if (cardWidthValEl) {
                cardWidthValEl.style.cursor = 'pointer';
                cardWidthValEl.onclick = () => {
                    if (!selectedCanvasElement) return;
                    if (selectedCanvasElement.dragType === 'score_percent_width') {
                        const current = getScorePercentPaddingWidth(getActiveKeyCount());
                        const input = prompt('输入 score-percent 透明垫片的 1x 逻辑宽度 (1 - 2000，1 = 仅隐藏百分号):', current);
                        if (input === null) return;
                        const parsed = parseInt(input.trim(), 10);
                        if (isNaN(parsed)) return;
                        recordSkinUndoBeforeChange('调整准度与进度饼图位置');
                        continuousActionActive = false;
                        const nextWidth = clampScorePercentPaddingWidth(parsed);
                        setScorePercentPaddingWidth(nextWidth, getActiveKeyCount());
                        drawFrame();
                        syncParamInputValue('ScorePercentWidth', nextWidth);
                        syncParamInputValue('ScorePercentVisible', false);
                        syncCanvasSelectedCard(selectedCanvasElement);
                        return;
                    }
                    if (selectedCanvasElement.dragType !== 'lighting_width') return;
                    const current = parseInt(cardWidthValEl.textContent, 10) || 0;
                    const input = prompt('输入新的打击特效宽度 (0 - 300，480p 虚拟像素；0 = 跟随列宽):', current);
                    if (input === null) return;
                    const parsed = parseInt(input.trim(), 10);
                    if (isNaN(parsed)) return;
                    recordSkinUndoBeforeChange(`修改${selectedCanvasElement.name}宽度`);
                    continuousActionActive = false;
                    stepSelectedTrackWidth(parsed - current);
                };
            }

            if (cardPosValEl) {
                cardPosValEl.title = '点击直接输入数值';
                cardPosValEl.style.cursor = 'pointer';
                cardPosValEl.onclick = () => {
                    const current = parseInt(cardPosValEl.textContent, 10) || 0;
                    const input = prompt('输入新的数值 (0 - 1000):', current);
                    if (input !== null) {
                        const parsed = parseInt(input.trim(), 10);
                        if (!isNaN(parsed)) {
                            recordSkinUndoBeforeChange(`修改${selectedCanvasElement ? selectedCanvasElement.name : '数值'}`);
                            continuousActionActive = false;
                            stepSelectedPos(parsed - current);
                        }
                    }
                };
            };

            if (cardReplaceBtn) {
                cardReplaceBtn.onclick = () => {
                    if (!selectedCanvasElement) return;
                    // 判定提示 (判定结果评价) 由 6 张判定贴图共同决定，不存在「单张对应贴图」：
                    // 因此点击后不再弹出选取文件的窗口，而是定位到 skin.ini 贴图参数区域，
                    // 一次性高亮全部判定贴图 (彩300g / 黄300 / 绿200 / 蓝100 / 灰50 / Miss)。
                    if (selectedCanvasElement.id === 'judgement') {
                        focusParameter(JUDGEMENT_TEXTURE_PARAM_KEYS);
                        showToast(
                            '已定位判定贴图',
                            '参数面板已高亮全部判定贴图：' + JUDGEMENT_TEXTURE_PARAM_KEYS.join(' / ')
                        );
                        return;
                    }
                    // 按键贴图的「替换贴图」改为定位到详细设置中的逐轨贴图选项，
                    // 同时高亮当前轨的 KeyImage 与 KeyImageD，便于连续替换这两种状态。
                    if (selectedCanvasElement.id.startsWith('key_') && selectedCanvasElement.colIndex != null) {
                        const col = selectedCanvasElement.colIndex;
                        const keyImageParam = `KeyImage${col}`;
                        const keyImageDownParam = `KeyImage${col}D`;
                        focusParameter([keyImageParam, keyImageDownParam]);
                        showToast(
                            '已定位按键贴图',
                            `参数面板已高亮 ${keyImageParam} 与 ${keyImageDownParam}`
                        );
                        return;
                    }
                    // 打击特效 (LightingN / LightingL) 本质是多帧动态贴图序列：
                    // 点击「替换贴图」不再弹「单张图片」选择框，而是直接打开动态贴图序列管理器。
                    if (selectedCanvasElement.openAnimOnReplace && typeof openAnimTextureEditor === 'function') {
                        openAnimTextureEditor(
                            selectedCanvasElement.textureName,
                            selectedCanvasElement.textureKey,
                            selectedCanvasElement.textureParamKey || selectedCanvasElement.paramKey,
                            '1x'
                        );
                        return;
                    }
                    // 注意：必须使用 textureParamKey（该元素对应的「贴图参数键」）而不是 paramKey。
                    // 有些画布元素同时承载「数值参数」与「贴图」（如按键发光 = LightPosition + StageLight、
                    // 判定线 = HitPosition + StageHint）；若误传 paramKey，会把贴图名写进数值参数，
                    // 导致 skin.ini 出现 `LightPosition: xxx.png` 这类污染。
                    triggerTextureUpload(
                        selectedCanvasElement.textureName,
                        selectedCanvasElement.textureKey,
                        selectedCanvasElement.textureParamKey || selectedCanvasElement.paramKey,
                        selectedCanvasElement.colIndex
                    );
                };
            }
            if (cardReplaceScorebarBgBtn) {
                cardReplaceScorebarBgBtn.onclick = () => {
                    triggerTextureUpload('scorebar-bg', null, 'scorebar-bg');
                };
            }
            if (cardReplaceScorebarColourBtn) {
                cardReplaceScorebarColourBtn.onclick = () => {
                    triggerTextureUpload('scorebar-colour', null, 'scorebar-colour');
                };
            }

        }

        function initSkinEditorUI() {
            initSkinEditorDialogUI();
            initAnimationTextureEditorUI();
            initTextureUploadUI();
            initTextureImageEditorUI();
            initCanvasEditorUI();
            initSkinEditorShortcutsUI();
        }
