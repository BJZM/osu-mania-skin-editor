// ============================================================================
// shortcuts.js - 编辑器、播放器与弹窗的键盘快捷键
// 依赖：ui/history.js、ui/transport.js、ui/texture-upload.js
// ============================================================================

        function initSkinEditorShortcutsUI() {
        document.addEventListener('keydown', (e) => {
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            const keyLower = e.key ? e.key.toLowerCase() : '';

            // 快捷键: Ctrl+Z (撤销) 与 Ctrl+Y / Ctrl+Shift+Z (重做)
            if (isCtrlOrCmd && keyLower === 'z' && !e.shiftKey) {
                const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
                const isTextEditing = (tag === 'textarea' || (tag === 'input' && (e.target.type === 'text' || e.target.type === 'search')));
                if (!isTextEditing) {
                    e.preventDefault();
                    performSkinUndo();
                    return;
                }
            } else if ((isCtrlOrCmd && keyLower === 'y') || (isCtrlOrCmd && keyLower === 'z' && e.shiftKey)) {
                const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
                const isTextEditing = (tag === 'textarea' || (tag === 'input' && (e.target.type === 'text' || e.target.type === 'search')));
                if (!isTextEditing) {
                    e.preventDefault();
                    performSkinRedo();
                    return;
                }
            }

            // 贴图拉伸规则帮助说明弹窗快捷键处理
            const helpModal = document.getElementById('helpModal');
            if (helpModal && helpModal.style.display !== 'none') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    helpModal.style.display = 'none';
                    return;
                }
            }

            // 动态贴图制作/上传弹窗快捷键处理
            const animModal = document.getElementById('animTextureModal');
            if (animModal && animModal.style.display !== 'none') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (typeof closeAnimTextureEditor === 'function') closeAnimTextureEditor();
                    return;
                }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    const confirmBtn = document.getElementById('animConfirmBtn');
                    if (confirmBtn) confirmBtn.click();
                    return;
                }
                if (e.key === ' ' && e.target.tagName !== 'INPUT') {
                    e.preventDefault();
                    const playBtn = document.getElementById('animPlayToggleBtn');
                    if (playBtn) playBtn.click();
                    return;
                }
                return;
            }

            // 贴图规格弹窗快捷键处理
            const uploadModal = document.getElementById('textureUploadModal');
            if (uploadModal && uploadModal.style.display !== 'none') {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (textureUploadUi) textureUploadUi.close();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (textureUploadUi) textureUploadUi.confirm();
                    return;
                }
                if (e.key === '1') {
                    if (textureUploadUi) textureUploadUi.setSpec('1x');
                    return;
                }
                if (e.key === '2') {
                    if (textureUploadUi) textureUploadUi.setSpec('2x');
                    return;
                }
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (textureUploadUi) textureUploadUi.toggleSpec();
                    return;
                }
                return;
            }

            // 如果用户正在表单或输入控件中输入，不响应游戏内快捷键
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            if (e.code === 'Space') {
                e.preventDefault();
                togglePlayPause();
            } else if (e.key === 'd' || e.key === 'D') {
                debugMode = !debugMode;
                if (!isPlaying) drawFrame();
            } else if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                toggleFullscreen();
            } else if (e.key === 'e' || e.key === 'E') {
                // E 键快速开启或关闭 skin.ini 可视化参数面板
                e.preventDefault();
                const modal = document.getElementById('skinEditorModal');
                if (modal) {
                    if (modal.classList.contains('active')) {
                        modal.classList.remove('active');
                    } else {
                        modal.classList.add('active');
                        renderSkinEditorParams();
                    }
                }
            } else if (e.key === 'Escape') {
                const modal = document.getElementById('skinEditorModal');
                if (modal && modal.classList.contains('active')) {
                    modal.classList.remove('active');
                } else if (selectedCanvasElement) {
                    selectedCanvasElement = null;
                    const card = document.getElementById('canvasSelectedCard');
                    if (card) card.style.display = 'none';
                    drawFrame();
                }
            }
        });
        }
