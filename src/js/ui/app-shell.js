// ============================================================================
// app-shell.js - 皮肤信息、左侧面板、全屏、帮助弹窗与启动初始化
// 依赖：全部运行时模块，必须最后加载
// ============================================================================

        // 初始化加载 osu! stable 官方默认贴图与字体库

        function configureAppleTouchFileInputs() {
            const isAppleTouchDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
                || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            if (!isAppleTouchDevice) return;

            // iPadOS maps filename extensions to UTIs and filters out unknown
            // types such as .osz/.osk. Allow all files here, then validate the
            // extension in the import handlers.
            for (const input of [ui.osz, ui.osk]) {
                if (input) input.setAttribute('accept', '*/*');
            }
        }
        
        function updateSkinInfoDisplay() {
            const skinNameEl = document.getElementById('infoSkinName');
            const skinAuthorEl = document.getElementById('infoSkinAuthor');
            const oskFileNameEl = document.getElementById('oskFileName');

            if (typeof isStartupSkinReady === 'function' && !isStartupSkinReady()) {
                if (skinNameEl) {
                    skinNameEl.removeAttribute('data-i18n-ignore');
                    skinNameEl.textContent = '等待选择皮肤';
                    skinNameEl.title = '等待选择皮肤';
                }
                if (skinAuthorEl) {
                    skinAuthorEl.removeAttribute('data-i18n-ignore');
                    skinAuthorEl.textContent = '请选择默认皮肤或导入皮肤';
                    skinAuthorEl.title = '请选择默认皮肤或导入皮肤';
                }
                if (oskFileNameEl) {
                    oskFileNameEl.removeAttribute('data-i18n-ignore');
                    oskFileNameEl.textContent = '未选择';
                    oskFileNameEl.title = '未选择皮肤';
                    oskFileNameEl.classList.remove('loaded');
                }
                return;
            }

            const explicitSkinName = currentSkinMetadata && currentSkinMetadata.general && currentSkinMetadata.general.Name;
            const sName = explicitSkinName
                || (currentSkinFileName && currentSkinFileName !== 'Custom_Mania_Skin' ? currentSkinFileName : '默认 / 内置皮肤');
            const sAuthor = (currentSkinMetadata && currentSkinMetadata.general && currentSkinMetadata.general.Author) || '';

            if (skinNameEl) {
                if (explicitSkinName || !isDefaultSkinLoaded) skinNameEl.setAttribute('data-i18n-ignore', '');
                else skinNameEl.removeAttribute('data-i18n-ignore');
                skinNameEl.textContent = sName;
                skinNameEl.title = sName;
            }
            if (skinAuthorEl) {
                skinAuthorEl.setAttribute('data-i18n-ignore', '');
                const authorText = sAuthor
                    ? window.I18n.t('作者: {author}', { author: sAuthor })
                    : (isDefaultSkinLoaded ? window.I18n.t('官方内置') : '-');
                skinAuthorEl.textContent = authorText;
                skinAuthorEl.title = authorText;
            }
            if (oskFileNameEl) {
                if (currentSkinFileName && currentSkinFileName !== 'Custom_Mania_Skin' && currentSkinFileName !== '默认皮肤') {
                    oskFileNameEl.setAttribute('data-i18n-ignore', '');
                    oskFileNameEl.textContent = currentSkinFileName;
                    oskFileNameEl.title = currentSkinFileName;
                    oskFileNameEl.classList.add('loaded');
                } else {
                    oskFileNameEl.removeAttribute('data-i18n-ignore');
                    oskFileNameEl.textContent = '默认皮肤';
                    oskFileNameEl.title = '默认皮肤';
                    oskFileNameEl.classList.remove('loaded');
                }
            }
        }

        function initLeftPanelUI() {
            const leftPanel = document.getElementById('leftInfoPanel');
            const leftPanelToggle = document.getElementById('leftPanelToggle');
            if (leftPanel && leftPanelToggle) {
                leftPanelToggle.addEventListener('click', () => {
                    leftPanel.classList.toggle('collapsed');
                    const isCollapsed = leftPanel.classList.contains('collapsed');
                    leftPanelToggle.innerHTML = isCollapsed
                        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"></polyline></svg>`
                        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
                    leftPanelToggle.title = isCollapsed ? '展开面板' : '收起面板';
                });
            }
        }

        function toggleFullscreen() {
            const elem = ui.canvasWrapper || canvas;
            if (!elem) return;
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen().catch(() => {});
                } else if (elem.webkitRequestFullscreen) {
                    elem.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        }

        if (ui.fullscreenBtn) {
            ui.fullscreenBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFullscreen();
            });
        }

        window.addEventListener('resize', syncCanvasSize);
        document.addEventListener('fullscreenchange', () => {
            setTimeout(syncCanvasSize, 50);
        });
        document.addEventListener('webkitfullscreenchange', () => {
            setTimeout(syncCanvasSize, 50);
        });

        if (typeof ResizeObserver !== 'undefined' && ui.canvasWrapper) {
            const ro = new ResizeObserver(() => {
                syncCanvasSize();
            });
            ro.observe(ui.canvasWrapper);
        }

        // 贴图拉伸规则帮助说明弹窗交互绑定
        function initHelpModalUI() {
            const helpBtn = document.getElementById('topHelpBtn');
            const modal = document.getElementById('helpModal');
            const closeBtn = document.getElementById('helpModalCloseBtn');
            const confirmBtn = document.getElementById('helpModalConfirmBtn');
            const backdrop = document.getElementById('helpModalBackdrop');
            const searchInput = document.getElementById('helpSearchInput');
            const tabs = document.querySelectorAll('#helpFilterTabs .help-tab-btn');
            const cards = document.querySelectorAll('#helpModalBody .help-rule-card');
            const emptyMsg = document.getElementById('helpEmptySearch');

            if (!modal) return;

            let currentCategory = 'all';

            function openHelpModal() {
                modal.style.display = 'flex';
                if (searchInput) {
                    searchInput.value = '';
                    filterCards();
                    setTimeout(() => searchInput.focus(), 50);
                }
            }

            function closeHelpModal() {
                modal.style.display = 'none';
            }

            function filterCards() {
                const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
                let visibleCount = 0;

                cards.forEach(card => {
                    const cat = card.getAttribute('data-cat') || '';
                    const keywords = (card.getAttribute('data-keywords') || '').toLowerCase();
                    const text = card.textContent.toLowerCase();

                    const matchCategory = (currentCategory === 'all' || cat === currentCategory);
                    const matchQuery = !query || keywords.includes(query) || text.includes(query);

                    if (matchCategory && matchQuery) {
                        card.style.display = 'flex';
                        visibleCount++;
                    } else {
                        card.style.display = 'none';
                    }
                });

                if (emptyMsg) {
                    emptyMsg.style.display = visibleCount === 0 ? 'block' : 'none';
                }
            }

            if (helpBtn) helpBtn.onclick = openHelpModal;
            if (closeBtn) closeBtn.onclick = closeHelpModal;
            if (confirmBtn) confirmBtn.onclick = closeHelpModal;
            if (backdrop) backdrop.onclick = closeHelpModal;

            tabs.forEach(tab => {
                tab.onclick = () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    currentCategory = tab.getAttribute('data-cat') || 'all';
                    filterCards();
                };
            });

            if (searchInput) {
                searchInput.oninput = filterCards;
            }
        }

        // 关于、版权与第三方许可弹窗交互绑定
        function initAboutModalUI() {
            const aboutBtn = document.getElementById('topAboutBtn');
            const modal = document.getElementById('aboutModal');
            const closeBtn = document.getElementById('aboutModalCloseBtn');
            const confirmBtn = document.getElementById('aboutModalConfirmBtn');
            const backdrop = document.getElementById('aboutModalBackdrop');
            const versionEl = document.getElementById('aboutAppVersion');

            if (!modal) return;

            if (versionEl && window.APP_INFO && window.APP_INFO.version) {
                versionEl.textContent = window.APP_INFO.version;
            }

            function openAboutModal() {
                modal.style.display = 'flex';
            }

            function closeAboutModal() {
                modal.style.display = 'none';
            }

            if (aboutBtn) aboutBtn.onclick = openAboutModal;
            if (closeBtn) closeBtn.onclick = closeAboutModal;
            if (confirmBtn) confirmBtn.onclick = closeAboutModal;
            if (backdrop) backdrop.onclick = closeAboutModal;
        }

        // 定位到菜单中具体参数行并执行聚焦高亮动画。
        // 放在最后加载的启动模块中，确保完整 UI 初始化完成后才向测试/外部调用暴露。
        function focusParameter(paramKey) {
            if (!isSkinEditingWorkspaceReady()) return false;

            const keysToHighlight = Array.isArray(paramKey) ? paramKey : [paramKey];
            const primaryKey = keysToHighlight[0] || 'ColumnWidth';

            let schema = SKIN_INI_PARAM_SCHEMA.find(p => p.key === primaryKey);
            let targetCardKey = primaryKey;
            if (!schema) {
                let baseKey = primaryKey.replace(/\d+[A-Za-z]?$/, '');
                if (/^noteimage\d+h$/i.test(primaryKey) || /^holdnotehead/i.test(primaryKey)) baseKey = 'HoldNoteHeadImage';
                else if (/^noteimage\d+l$/i.test(primaryKey) || /^holdnotebody/i.test(primaryKey)) baseKey = 'HoldNoteBodyImage';
                else if (/^noteimage\d+t$/i.test(primaryKey) || /^holdnotetail/i.test(primaryKey)) baseKey = 'HoldNoteTailImage';
                else if (/^keyimage\d+d$/i.test(primaryKey) || /^keyimagedown/i.test(primaryKey)) baseKey = 'KeyImageDown';
                else if (/^keyimage\d+$/i.test(primaryKey)) baseKey = 'KeyImage';
                else if (/^noteimage\d+$/i.test(primaryKey)) baseKey = 'NoteImage';
                schema = SKIN_INI_PARAM_SCHEMA.find(p => p.key === baseKey);
                if (schema) targetCardKey = schema.key;
            }

            const targetTab = schema ? schema.tab : 'mania';
            if (targetTab === 'fonts' && schema && schema.category === '字体排版') {
                isFontsAdvancedExpanded = true;
            }
            if (targetTab === 'mania') {
                const curKeys = getActiveKeyCount();
                activeEditorKeyCount = curKeys;
                updateSkinEditorKeyPills();
            }

            if (targetTab === 'textures') {
                if (typeof textureImageEditorUi !== 'undefined' && textureImageEditorUi &&
                    typeof textureImageEditorUi.focusParams === 'function') {
                    return textureImageEditorUi.focusParams(keysToHighlight);
                }
                return false;
            }

            if (typeof openSkinEditorDialog !== 'function' || !openSkinEditorDialog()) return false;
            switchEditorTab(targetTab);

            const searchInput = document.getElementById('paramSearchInput');
            if (searchInput && paramSearchQuery) {
                searchInput.value = '';
                paramSearchQuery = '';
                const clearBtn = document.getElementById('clearSearchBtn');
                if (clearBtn) clearBtn.style.display = 'none';
                renderSkinEditorParams();
            }

            setTimeout(() => {
                let firstCard = null;
                keysToHighlight.forEach((k) => {
                    let card = document.getElementById(`param-card-${k}`);
                    if (!card) {
                        let baseKey = k.replace(/\d+[A-Za-z]?$/, '');
                        if (/^noteimage\d+h$/i.test(k) || /^holdnotehead/i.test(k)) baseKey = 'HoldNoteHeadImage';
                        else if (/^noteimage\d+l$/i.test(k) || /^holdnotebody/i.test(k)) baseKey = 'HoldNoteBodyImage';
                        else if (/^noteimage\d+t$/i.test(k) || /^holdnotetail/i.test(k)) baseKey = 'HoldNoteTailImage';
                        else if (/^keyimage\d+d$/i.test(k) || /^keyimagedown/i.test(k)) baseKey = 'KeyImageDown';
                        else if (/^keyimage\d+$/i.test(k)) baseKey = 'KeyImage';
                        else if (/^noteimage\d+$/i.test(k)) baseKey = 'NoteImage';
                        card = document.getElementById(`param-card-${baseKey}`);
                    }
                    if (card) {
                        expandCategoryBlockFor(card);
                        if (!firstCard) firstCard = card;
                        card.classList.add('highlight-pulse');
                        setTimeout(() => card.classList.remove('highlight-pulse'), 3500);
                    }
                });
                if (firstCard) {
                    firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 120);
            return true;
        }

        // 从画布上的连击选中卡片跳到连击字体贴图。
        // 有显式连击字体时定位到字帖网格；没有时定位 ComboPrefix，
        // 让用户能看到它当前正在沿用 score 字体。
        function focusComboTexture() {
            const keys = getActiveKeyCount();
            const hasExplicitComboFont = !!getExplicitComboFontPrefix(keys);
            focusParameter('ComboPrefix');

            setTimeout(() => {
                const glyphCard = document.querySelector('.combo-font-glyphs-block .hud-glyph-card');
                const target = glyphCard || document.getElementById('param-card-ComboPrefix');
                if (!target) return;

                if (typeof expandCategoryBlockFor === 'function') {
                    expandCategoryBlockFor(target);
                }
                target.classList.add('highlight-pulse');
                setTimeout(() => target.classList.remove('highlight-pulse'), 3500);
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });

                if (!hasExplicitComboFont) {
                    showToast('连击沿用数字贴图', '当前没有显式指定连击字体，正在定位 ComboPrefix 参数。');
                }
            }, 260);
        }

        configureAppleTouchFileInputs();
        initLeftPanelUI();
        updateSkinInfoDisplay();
        loadDefaultSkin();
        // 初始化可视化皮肤参数编辑器系统
        initSkinEditorUI();
        // 初始化启动阶段谱面 / 皮肤选择面板与拖拽上传
        initStartupActionsUI();
        // 初始化贴图拉伸规则帮助说明弹窗
        initHelpModalUI();
        // 初始化关于、版权与第三方许可弹窗
        initAboutModalUI();
        // 保存初始皮肤快照
        saveInitialSkinSnapshot();
        // 初始化时立即同步画布像素与显示视口尺寸
        syncCanvasSize();
        requestAnimationFrame(syncCanvasSize);
