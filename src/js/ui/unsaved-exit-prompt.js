// ============================================================================
// unsaved-exit-prompt.js - Windows 便携版关闭前询问是否导出未保存操作
// 依赖：ui/skin-workspace-revision.js、ui/export.js、ui/texture-image-editor.js
// ============================================================================

        (function initUnsavedExitPrompt() {
            const desktop = window.skinEditorDesktop;
            if (!desktop || typeof desktop.onCloseRequested !== 'function' || typeof desktop.allowClose !== 'function') {
                return;
            }

            let promptOpen = false;
            let exitBusy = false;

            function hasDirtyTextureTabs() {
                if (typeof textureImageEditorUi === 'undefined' || !textureImageEditorUi ||
                    typeof textureImageEditorUi.getState !== 'function') {
                    return false;
                }
                const state = textureImageEditorUi.getState();
                return !!(state && state.dirtyTabCount > 0);
            }

            function hasUnsavedExitWork() {
                const skinDirty = !!(window.skinWorkspaceRevision &&
                    window.skinWorkspaceRevision.hasUnexportedOperations());
                return skinDirty || hasDirtyTextureTabs();
            }

            function showUnsavedExitPrompt() {
                const modal = document.getElementById('unsavedExitModal');
                const exportBtn = document.getElementById('unsavedExitExportBtn');
                const discardBtn = document.getElementById('unsavedExitDiscardBtn');
                const cancelBtn = document.getElementById('unsavedExitCancelBtn');
                const backdrop = document.getElementById('unsavedExitBackdrop');
                if (!modal || !exportBtn || !discardBtn || !cancelBtn) {
                    return Promise.resolve('discard');
                }

                return new Promise((resolve) => {
                    const finish = (choice) => {
                        modal.style.display = 'none';
                        exportBtn.onclick = null;
                        discardBtn.onclick = null;
                        cancelBtn.onclick = null;
                        if (backdrop) backdrop.onclick = null;
                        window.removeEventListener('keydown', onKeyDown, true);
                        promptOpen = false;
                        resolve(choice);
                    };
                    const onKeyDown = (event) => {
                        if (event.key !== 'Escape') return;
                        event.preventDefault();
                        event.stopPropagation();
                        finish('cancel');
                    };

                    promptOpen = true;
                    exportBtn.onclick = () => finish('export');
                    discardBtn.onclick = () => finish('discard');
                    cancelBtn.onclick = () => finish('cancel');
                    if (backdrop) backdrop.onclick = () => finish('cancel');
                    window.addEventListener('keydown', onKeyDown, true);
                    modal.style.display = 'flex';
                    exportBtn.focus();
                });
            }

            async function handleCloseRequested() {
                if (promptOpen || exitBusy) return;
                if (!hasUnsavedExitWork()) {
                    desktop.allowClose();
                    return;
                }

                const choice = await showUnsavedExitPrompt();
                if (choice === 'cancel') return;
                if (choice === 'discard') {
                    desktop.allowClose();
                    return;
                }

                exitBusy = true;
                try {
                    if (hasDirtyTextureTabs() &&
                        typeof textureImageEditorUi.close === 'function') {
                        const saved = await textureImageEditorUi.close({ unsavedDecision: 'save' });
                        if (!saved) return;
                    }
                    if (typeof requestAndExportSkin !== 'function') return;
                    const exported = await requestAndExportSkin('osk');
                    if (exported) desktop.allowClose();
                } finally {
                    exitBusy = false;
                }
            }

            desktop.onCloseRequested(() => {
                void handleCloseRequested();
            });
            if (typeof desktop.notifyCloseGuardReady === 'function') {
                desktop.notifyCloseGuardReady();
            }
        })();
