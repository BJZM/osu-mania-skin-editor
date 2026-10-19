// ============================================================================
// startup-actions.js - 启动阶段谱面/皮肤选择、拖拽上传与播放解锁
// 依赖：core/state.js、parser/beatmap-import.js、parser/skin-import.js、ui/history.js
// ============================================================================

        let startupWorkflowBeatmapReady = false;
        let startupWorkflowSkinReady = false;
        let startupWorkflowBeatmapName = '';
        let startupWorkflowSkinName = '';
        let startupDragDepth = 0;

        function isStartupSkinReady() {
            return startupWorkflowSkinReady;
        }

        function isStartupBeatmapReady() {
            return startupWorkflowBeatmapReady;
        }

        function isStartupWorkspaceReady() {
            return startupWorkflowBeatmapReady && startupWorkflowSkinReady;
        }

        function isSkinEditingWorkspaceReady() {
            return isStartupWorkspaceReady();
        }

        function getStartupRequirementCopy() {
            if (!startupWorkflowBeatmapReady && !startupWorkflowSkinReady) {
                return {
                    title: '请导入谱面和皮肤',
                    actions: ['beatmap', 'skin']
                };
            }
            if (!startupWorkflowBeatmapReady) {
                return {
                    title: '请导入谱面',
                    actions: ['beatmap']
                };
            }
            if (!startupWorkflowSkinReady) {
                return {
                    title: '请导入皮肤',
                    actions: ['skin']
                };
            }
            return null;
        }

        function syncSkinRequiredState(requiredState) {
            if (!requiredState) return;
            const requirement = getStartupRequirementCopy();
            const missing = requirement !== null;
            requiredState.classList.toggle('is-visible', missing);
            requiredState.setAttribute('aria-hidden', String(!missing));

            if (!requirement) return;
            const title = requiredState.querySelector('.skin-source-required-title');
            const desc = requiredState.querySelector('.skin-source-required-desc');
            if (title) title.textContent = requirement.title;
            if (desc) desc.textContent = requirement.desc || '';

            requiredState.querySelectorAll('[data-startup-required-action]').forEach((button) => {
                button.hidden = !requirement.actions.includes(button.dataset.startupRequiredAction);
            });
        }

        function syncSkinEditingAvailabilityUI() {
            const ready = isSkinEditingWorkspaceReady();

            const skinDialog = document.getElementById('skinEditorDialog');
            const skinRequiredState = document.getElementById('skinEditorSkinRequired');
            if (skinDialog) skinDialog.classList.toggle('is-skin-source-missing', !ready);
            syncSkinRequiredState(skinRequiredState);

            const textureDialog = document.getElementById('textureImageEditorDialog');
            const textureRequiredState = document.getElementById('textureImageSkinRequired');
            if (textureDialog) textureDialog.classList.toggle('is-skin-source-missing', !ready);
            syncSkinRequiredState(textureRequiredState);

            return ready;
        }

        function shouldDeferSkinRendering() {
            return startupWorkflowBeatmapReady && !startupWorkflowSkinReady;
        }

        function canPlayWithStartupSelection() {
            return isStartupWorkspaceReady();
        }

        function syncStartupPlayerControls() {
            const canPlay = canPlayWithStartupSelection();
            if (ui.playerControls) {
                ui.playerControls.classList.toggle('disabled', !canPlay);
            }
            if (ui.progressRange) {
                ui.progressRange.disabled = !canPlay;
            }
            if (ui.playPauseBtn) {
                ui.playPauseBtn.disabled = !canPlay;
            }
            if (!canPlay && typeof setPlayPauseUi === 'function') {
                setPlayPauseUi(false);
            }
        }

        function updateStartupPanelState() {
            const panel = document.getElementById('startupActions');
            if (!panel) return;

            panel.hidden = isStartupWorkspaceReady();
            const beatmapDesc = document.getElementById('startupBeatmapDesc');
            const skinDesc = document.getElementById('startupSkinDesc');
            const defaultDesc = document.getElementById('startupDefaultDesc');
            const t = window.I18n
                ? window.I18n.t.bind(window.I18n)
                : (value, vars = {}) => String(value).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);

            if (beatmapDesc) {
                beatmapDesc.textContent = startupWorkflowBeatmapReady
                    ? (startupWorkflowSkinReady
                        ? t('已载入 {name}，点击可更换', { name: startupWorkflowBeatmapName || '谱面' })
                        : t('已载入 {name}，等待导入皮肤（点击可更换）', { name: startupWorkflowBeatmapName || '谱面' }))
                    : t('点击或拖拽 .osz / .zip / .osu 文件');
            }
            if (skinDesc) {
                skinDesc.textContent = startupWorkflowSkinReady
                    ? (startupWorkflowBeatmapReady
                        ? t('已使用 {name}，点击可更换', { name: startupWorkflowSkinName || '当前皮肤' })
                        : t('已使用 {name}，等待导入谱面（点击可更换）', { name: startupWorkflowSkinName || '当前皮肤' }))
                    : t('点击或拖拽 .osk / .zip 皮肤包');
            }
            if (defaultDesc) {
                defaultDesc.textContent = startupWorkflowSkinReady
                    ? (startupWorkflowBeatmapReady
                        ? t('当前已选择皮肤来源')
                        : t('皮肤来源已就绪，请继续导入谱面'))
                    : t('使用 osu!stable 官方默认皮肤作为工作区');
            }
        }

        function markStartupBeatmapReady(fileName) {
            startupWorkflowBeatmapReady = true;
            startupWorkflowBeatmapName = fileName || '';
            updateStartupPanelState();
            syncSkinEditingAvailabilityUI();
            syncStartupPlayerControls();
            if (isStartupWorkspaceReady() && typeof refreshSkinEditorAfterSkinImport === 'function') {
                refreshSkinEditorAfterSkinImport();
            }
            drawFrame();
        }

        function markStartupSkinReady(sourceLabel) {
            startupWorkflowSkinReady = true;
            startupWorkflowSkinName = sourceLabel || '';
            updateStartupPanelState();
            syncSkinEditingAvailabilityUI();
            if (typeof updateSkinInfoDisplay === 'function') {
                updateSkinInfoDisplay();
            }
            syncStartupPlayerControls();
            if (currentBeatmap && typeof syncNotesStateWithTime === 'function') {
                const currentTimeMs = (audio && !isNaN(audio.currentTime)) ? audio.currentTime * 1000 : 0;
                syncNotesStateWithTime(currentTimeMs);
            }
            drawFrame();
            if (typeof refreshSkinEditorAfterSkinImport === 'function') {
                refreshSkinEditorAfterSkinImport();
            }
        }

        function hasDraggedFiles(dataTransfer) {
            if (!dataTransfer) return false;
            return Array.from(dataTransfer.types || []).includes('Files');
        }

        function dispatchDroppedFile(input, file) {
            if (!input) return false;
            try {
                const transfer = new DataTransfer();
                transfer.items.add(file);
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            } catch (err) {
                console.error('拖拽文件写入导入入口失败', err);
                showToast('无法导入文件', '浏览器未能接收拖拽文件，请点击按钮选择。');
                return false;
            }
        }

        async function classifyDroppedZip(file) {
            try {
                const zip = await JSZip.loadAsync(file);
                const names = Object.keys(zip.files || {});
                if (names.some((name) => name.toLowerCase().endsWith('.osu'))) {
                    return 'beatmap';
                }
                if (names.some((name) => name.toLowerCase().endsWith('skin.ini')) ||
                    names.some((name) => /\.(png|jpg|jpeg)$/i.test(name))) {
                    return 'skin';
                }
            } catch (err) {
                console.warn('拖拽 ZIP 类型识别失败', err);
            }
            return '';
        }

        async function routeDroppedFile(file) {
            if (!file) return false;
            if (isSkinLoading) {
                showToast('请稍候', '正在读取皮肤或谱面，请等待当前任务完成。');
                return false;
            }

            const name = String(file.name || '');
            const lower = name.toLowerCase();
            let kind = '';
            if (lower.endsWith('.osk')) {
                kind = 'skin';
            } else if (lower.endsWith('.osz') || lower.endsWith('.osu')) {
                kind = 'beatmap';
            } else if (lower.endsWith('.zip')) {
                kind = await classifyDroppedZip(file);
            }

            if (kind === 'beatmap') {
                return dispatchDroppedFile(ui.osz, file);
            }
            if (kind === 'skin') {
                return dispatchDroppedFile(ui.osk, file);
            }

            showToast('无法识别拖拽文件', '谱面请使用 .osz / .osu，皮肤请使用 .osk；.zip 会根据内容自动判断。');
            return false;
        }

        function initStartupActionsUI() {
            const panel = document.getElementById('startupActions');
            const importBeatmapBtn = document.getElementById('startupImportBeatmapBtn');
            const importSkinBtn = document.getElementById('startupImportSkinBtn');
            const defaultSkinBtn = document.getElementById('startupUseDefaultSkinBtn');
            const dropTarget = ui.canvasWrapper || document.getElementById('canvasWrapper');
            const requiredImportButtons = document.querySelectorAll('[data-skin-source-action="import"]');
            const requiredDefaultButtons = document.querySelectorAll('[data-skin-source-action="default"]');
            const requiredBeatmapButtons = document.querySelectorAll('[data-startup-required-action="beatmap"]');

            if (importBeatmapBtn && ui.osz) {
                importBeatmapBtn.onclick = () => ui.osz.click();
            }
            if (importSkinBtn && ui.osk) {
                importSkinBtn.onclick = () => ui.osk.click();
            }
            if (defaultSkinBtn) {
                defaultSkinBtn.onclick = async () => {
                    defaultSkinBtn.disabled = true;
                    try {
                        await startFromDefaultSkin({ skipConfirm: true, startupSelection: true });
                    } finally {
                        defaultSkinBtn.disabled = false;
                    }
                };
            }
            if (ui.osk) {
                requiredImportButtons.forEach((button) => {
                    button.onclick = () => ui.osk.click();
                });
            }
            if (requiredDefaultButtons.length > 0) {
                requiredDefaultButtons.forEach((button) => {
                    button.onclick = async () => {
                        requiredDefaultButtons.forEach((item) => { item.disabled = true; });
                        try {
                            await startFromDefaultSkin({ skipConfirm: true, startupSelection: true });
                        } finally {
                            requiredDefaultButtons.forEach((item) => { item.disabled = false; });
                        }
                    };
                });
            }
            if (requiredBeatmapButtons.length > 0) {
                requiredBeatmapButtons.forEach((button) => {
                    button.onclick = () => {
                        if (ui.osz) ui.osz.click();
                    };
                });
            }

            if (dropTarget) {
                dropTarget.addEventListener('dragenter', (e) => {
                    if (!hasDraggedFiles(e.dataTransfer)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    startupDragDepth += 1;
                    if (panel) panel.classList.add('is-dragging');
                });

                dropTarget.addEventListener('dragover', (e) => {
                    if (!hasDraggedFiles(e.dataTransfer)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                });

                dropTarget.addEventListener('dragleave', (e) => {
                    if (!hasDraggedFiles(e.dataTransfer)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    startupDragDepth = Math.max(0, startupDragDepth - 1);
                    if (startupDragDepth === 0 && panel) {
                        panel.classList.remove('is-dragging');
                    }
                });

                dropTarget.addEventListener('drop', (e) => {
                    if (!hasDraggedFiles(e.dataTransfer)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    startupDragDepth = 0;
                    if (panel) panel.classList.remove('is-dragging');
                    const file = e.dataTransfer.files && e.dataTransfer.files[0];
                    if (file) void routeDroppedFile(file);
                });
            }

            updateStartupPanelState();
            syncSkinEditingAvailabilityUI();
            syncStartupPlayerControls();
        }
