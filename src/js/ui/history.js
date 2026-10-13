// ============================================================================
// history.js - 皮肤快照、撤销、重做与初始状态复原
// 依赖：parser/skin-assets.js、ui/param-core.js
// ============================================================================

        // ===== 皮肤快照与复原系统 (Skin Snapshot & Restore System) =====
        function cloneSkinAssetEntry(entry) {
            if (!entry) return null;
            return {
                anim2x: Array.isArray(entry.anim2x) ? [...entry.anim2x] : [],
                anim1x: Array.isArray(entry.anim1x) ? [...entry.anim1x] : [],
                static2x: entry.static2x,
                static1x: entry.static1x
            };
        }

        function cloneSkinImageStore(store) {
            const cloned = new Map();
            if (!store) return cloned;
            for (const [key, entry] of store.entries()) {
                cloned.set(key, cloneSkinAssetEntry(entry));
            }
            return cloned;
        }

        function cloneManiaSkinConfig(cfg) {
            if (!cfg) return null;
            const cloned = { ...cfg };
            if (cfg.ImageLookups instanceof Map) {
                cloned.ImageLookups = new Map(cfg.ImageLookups);
            }
            if (cfg.FlipSettings instanceof Map) {
                cloned.FlipSettings = new Map(cfg.FlipSettings);
            }
            if (Array.isArray(cfg.ColumnLineWidth)) cloned.ColumnLineWidth = [...cfg.ColumnLineWidth];
            if (Array.isArray(cfg.ColumnSpacing)) cloned.ColumnSpacing = [...cfg.ColumnSpacing];
            if (Array.isArray(cfg.ColumnWidth)) cloned.ColumnWidth = [...cfg.ColumnWidth];
            if (Array.isArray(cfg.ExplosionWidth)) cloned.ExplosionWidth = [...cfg.ExplosionWidth];
            if (Array.isArray(cfg.HoldNoteLightWidth)) cloned.HoldNoteLightWidth = [...cfg.HoldNoteLightWidth];
            if (Array.isArray(cfg.NoteBodyStyles)) cloned.NoteBodyStyles = [...cfg.NoteBodyStyles];
            if (Array.isArray(cfg.ColumnColour)) cloned.ColumnColour = cfg.ColumnColour.map(c => (c ? { ...c } : c));
            if (Array.isArray(cfg.ColourLight)) cloned.ColourLight = cfg.ColourLight.map(c => (c ? { ...c } : c));
            if (cfg.CustomColours) {
                try {
                    cloned.CustomColours = JSON.parse(JSON.stringify(cfg.CustomColours));
                } catch (_) {
                    cloned.CustomColours = { ...cfg.CustomColours };
                }
            }
            if (cfg.ComboBreakColour) cloned.ComboBreakColour = { ...cfg.ComboBreakColour };
            if (cfg.ColourHold) cloned.ColourHold = { ...cfg.ColourHold };
            if (cfg.ColourBarline) cloned.ColourBarline = { ...cfg.ColourBarline };
            if (cfg.GlobalColourLight) cloned.GlobalColourLight = { ...cfg.GlobalColourLight };
            return cloned;
        }

        function cloneManiaSkinConfigs(map) {
            const newMap = new Map();
            if (!map) return newMap;
            for (const [k, v] of map.entries()) {
                newMap.set(k, cloneManiaSkinConfig(v));
            }
            return newMap;
        }

        const undoStack = [];
        const redoStack = [];
        const MAX_UNDO_STACK = 40;
        let isPerformingUndoRedo = false;
        let continuousActionActive = false;
        let continuousActionTimer = null;

        function updateUndoButtonState() {
            const redoBtn = document.getElementById('canvasRedoBtn');
            const undoBtn = document.getElementById('canvasUndoBtn');
            const modalUndoBtn = document.getElementById('modalUndoBtn');
            const count = undoStack.length;
            const redoCount = redoStack.length;
            const redoTitle = redoCount > 0
                ? `重做: ${redoStack[redoStack.length - 1].desc || '已撤回的操作'} (Ctrl+Y / Ctrl+Shift+Z)`
                : '暂无可重做的操作 (Ctrl+Y / Ctrl+Shift+Z)';
            const title = count > 0 ? `撤回: ${undoStack[undoStack.length - 1].desc || '上一步操作'} (Ctrl+Z)` : '暂无可撤回操作 (Ctrl+Z)';

            if (redoBtn) {
                redoBtn.disabled = (redoCount === 0);
                redoBtn.style.opacity = (redoCount === 0) ? '0.45' : '1';
                redoBtn.style.cursor = (redoCount === 0) ? 'not-allowed' : 'pointer';
                redoBtn.title = redoTitle;
            }
            if (undoBtn) {
                undoBtn.disabled = (count === 0);
                undoBtn.style.opacity = (count === 0) ? '0.45' : '1';
                undoBtn.style.cursor = (count === 0) ? 'not-allowed' : 'pointer';
                undoBtn.title = title;
            }
            if (modalUndoBtn) {
                modalUndoBtn.disabled = (count === 0);
                modalUndoBtn.style.opacity = (count === 0) ? '0.45' : '1';
                modalUndoBtn.style.cursor = (count === 0) ? 'not-allowed' : 'pointer';
                modalUndoBtn.title = title;
            }
        }

        function createSkinSnapshot(desc = '操作') {
            return {
                desc,
                timestamp: Date.now(),
                maniaSkinConfigurations: cloneManiaSkinConfigs(maniaSkinConfigurations),
                currentSkinMetadata: JSON.parse(JSON.stringify(currentSkinMetadata)),
                skinFontsConfig: { ...skinFontsConfig },
                globalSkinImageLookups: new Map(globalSkinImageLookups),
                skinImageStore: cloneSkinImageStore(skinImageStore),
                skinFallbackImageStore: cloneSkinImageStore(skinFallbackImageStore),
                userReplacedTextures: new Map(userReplacedTextures),
                activeEditorKeyCount: activeEditorKeyCount
            };
        }

        function recordSkinUndoBeforeChange(desc = '修改参数', options = {}) {
            if (isPerformingUndoRedo) return;
            if (typeof invalidateKeyImageHeightPersistence === 'function') {
                invalidateKeyImageHeightPersistence();
            }
            if (options.force || !continuousActionActive) {
                const snap = createSkinSnapshot(desc);
                undoStack.push(snap);
                if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
                redoStack.length = 0;
                continuousActionActive = true;
                updateUndoButtonState();
            }
            if (continuousActionTimer) clearTimeout(continuousActionTimer);
            continuousActionTimer = setTimeout(() => {
                continuousActionActive = false;
            }, 600);
        }

        function applySkinSnapshot(snap) {
            if (!snap) return;
            if (typeof invalidateKeyImageHeightPersistence === 'function') {
                invalidateKeyImageHeightPersistence();
            }
            isPerformingUndoRedo = true;
            try {
                // 1. 还原 userReplacedTextures
                userReplacedTextures.clear();
                if (snap.userReplacedTextures) {
                    for (const [k, v] of snap.userReplacedTextures.entries()) {
                        userReplacedTextures.set(k, v);
                    }
                }

                // 2. 还原 maniaSkinConfigurations
                maniaSkinConfigurations.clear();
                if (snap.maniaSkinConfigurations) {
                    for (const [k, v] of snap.maniaSkinConfigurations.entries()) {
                        maniaSkinConfigurations.set(k, cloneManiaSkinConfig(v));
                    }
                }

                // 3. 还原 currentSkinMetadata & skinFontsConfig & globalSkinImageLookups
                if (snap.currentSkinMetadata) {
                    currentSkinMetadata = JSON.parse(JSON.stringify(snap.currentSkinMetadata));
                }
                if (snap.skinFontsConfig) {
                    skinFontsConfig = { ...snap.skinFontsConfig };
                }
                globalSkinImageLookups.clear();
                if (snap.globalSkinImageLookups) {
                    for (const [k, v] of snap.globalSkinImageLookups.entries()) {
                        globalSkinImageLookups.set(k, v);
                    }
                }

                // 4. 还原 skinImageStore 与 skinFallbackImageStore
                skinImageStore.clear();
                if (snap.skinImageStore) {
                    for (const [k, v] of snap.skinImageStore.entries()) {
                        skinImageStore.set(k, cloneSkinAssetEntry(v));
                    }
                }
                skinFallbackImageStore.clear();
                if (snap.skinFallbackImageStore) {
                    for (const [k, v] of snap.skinFallbackImageStore.entries()) {
                        skinFallbackImageStore.set(k, cloneSkinAssetEntry(v));
                    }
                }
                if (typeof refreshSkinCursor === 'function') refreshSkinCursor();

                // 5. 还原活动键位
                if (snap.activeEditorKeyCount) {
                    activeEditorKeyCount = snap.activeEditorKeyCount;
                }

                // 6. 重新渲染参数编辑器界面与 ini 预览
                updateSkinEditorKeyPills();
                renderSkinEditorParams();
                const rawTextarea = document.getElementById('rawIniTextarea');
                if (rawTextarea) {
                    rawTextarea.value = generateSkinIniText();
                }

                // 7. 重新同步音符状态与重绘游戏画面
                if (currentBeatmap) {
                    const currentTimeMs = (audio && !isNaN(audio.currentTime)) ? audio.currentTime * 1000 : 0;
                    syncNotesStateWithTime(currentTimeMs);
                }
                drawFrame();
                updateSkinInfoDisplay();
                if (selectedCanvasElement) {
                    const liveElem = canvasInteractiveElements.find(e => {
                        if (selectedCanvasElement.noteInstanceKey && e.noteInstanceKey) {
                            return e.noteInstanceKey === selectedCanvasElement.noteInstanceKey;
                        }
                        return e.id === selectedCanvasElement.id;
                    }) || selectedCanvasElement;
                    syncCanvasSelectedCard(liveElem);
                }
            } catch (err) {
                console.error('[Undo/Redo] 还原皮肤快照失败:', err);
            } finally {
                isPerformingUndoRedo = false;
                updateUndoButtonState();
            }
        }

        function performSkinUndo() {
            if (continuousActionTimer) {
                clearTimeout(continuousActionTimer);
                continuousActionActive = false;
            }
            if (undoStack.length === 0) {
                showToast('提示', '没有可撤回的操作');
                return;
            }
            const currentState = createSkinSnapshot('当前状态');
            redoStack.push(currentState);
            if (redoStack.length > MAX_UNDO_STACK) redoStack.shift();

            const previousState = undoStack.pop();
            applySkinSnapshot(previousState);
            showToast('已撤回 (Ctrl+Z)', previousState.desc ? `已撤回: ${previousState.desc}` : '已恢复上一状态');
        }

        function performSkinRedo() {
            if (continuousActionTimer) {
                clearTimeout(continuousActionTimer);
                continuousActionActive = false;
            }
            if (redoStack.length === 0) {
                showToast('提示', '没有可重做的操作');
                return;
            }
            const currentState = createSkinSnapshot('当前状态');
            undoStack.push(currentState);
            if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();

            const nextState = redoStack.pop();
            applySkinSnapshot(nextState);
            showToast('已重做 (Ctrl+Y)', nextState.desc ? `已重做: ${nextState.desc}` : '已恢复操作');
        }

        function saveInitialSkinSnapshot() {
            try {
                initialSkinSnapshot = {
                    maniaSkinConfigurations: cloneManiaSkinConfigs(maniaSkinConfigurations),
                    currentSkinMetadata: JSON.parse(JSON.stringify(currentSkinMetadata)),
                    skinFontsConfig: { ...skinFontsConfig },
                    globalSkinImageLookups: new Map(globalSkinImageLookups),
                    skinImageStore: cloneSkinImageStore(skinImageStore),
                    skinFallbackImageStore: cloneSkinImageStore(skinFallbackImageStore)
                };
                undoStack.length = 0;
                redoStack.length = 0;
                continuousActionActive = false;
                updateUndoButtonState();
            } catch (err) {
                console.error('[Snapshot] 保存皮肤初始快照失败:', err);
            }
        }

        function revertSkinToInitial() {
            if (!initialSkinSnapshot) {
                showToast('提示', '暂无已保存的初始皮肤快照');
                return;
            }

            if (!confirm('确定要将所有参数和贴图复原为皮肤导入时的初始状态吗？未导出的修改将被丢弃。')) {
                return;
            }

            recordSkinUndoBeforeChange('复原初始皮肤');
            continuousActionActive = false;

            // 清理画布选中与交互状态
            selectedCanvasElement = null;
            const card = document.getElementById('canvasSelectedCard');
            if (card) card.style.display = 'none';

            applySkinSnapshot(initialSkinSnapshot);
            showToast('已复原', '所有参数与贴图已恢复为导入时的初始状态 (可按 Ctrl+Z 撤回)');
        }
