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

        function copyNonTextureManiaProperties(sourceCfg, targetCfg) {
            if (!sourceCfg || !targetCfg) return;
            const nonTextureKeys = [
                'Keys', 'SkinVersion', 'WidthForNoteHeightScale',
                'ColumnLineWidth', 'ColumnSpacing', 'ColumnWidth',
                'ColumnStart', 'ColumnRight',
                'HitPosition', 'LightPosition', 'ScorePosition', 'ComboPosition',
                'BarLineHeight', 'ShowJudgementLine', 'JudgementLine',
                'KeysUnderNotes', 'LightFramePerSecond',
                'ExplosionWidth', 'HoldNoteLightWidth',
                'ColumnColour', 'ColourLight', 'GlobalColourLight',
                'ColourHold', 'ColourBarline', 'ComboBreakColour', 'CustomColours',
                'FlipSettings', 'FontCombo', 'ComboOverlap', 'FontScore', 'ScoreOverlap',
                'UpsideDown', 'SplitStages', 'StageSeparation',
                'SpecialStyle',
                '_isDefaultFallback'
            ];
            if (typeof SKIN_INI_PARAM_SCHEMA_MANIA !== 'undefined' && Array.isArray(SKIN_INI_PARAM_SCHEMA_MANIA)) {
                for (const p of SKIN_INI_PARAM_SCHEMA_MANIA) {
                    if (p && p.key && !nonTextureKeys.includes(p.key)) {
                        nonTextureKeys.push(p.key);
                    }
                }
            }
            for (const key of nonTextureKeys) {
                if (key in sourceCfg) {
                    const val = sourceCfg[key];
                    if (Array.isArray(val)) {
                        targetCfg[key] = val.map(item => (item && typeof item === 'object') ? { ...item } : item);
                    } else if (val instanceof Map) {
                        targetCfg[key] = new Map(val);
                    } else if (val && typeof val === 'object') {
                        try {
                            targetCfg[key] = JSON.parse(JSON.stringify(val));
                        } catch (_) {
                            targetCfg[key] = { ...val };
                        }
                    } else {
                        targetCfg[key] = val;
                    }
                }
            }
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
        let activeHistoryTransaction = null;

        function clearContinuousActionState() {
            if (continuousActionTimer) {
                clearTimeout(continuousActionTimer);
                continuousActionTimer = null;
            }
            continuousActionActive = false;
        }

        function isHistoryTransactionActive() {
            return activeHistoryTransaction !== null;
        }

        function updateUndoButtonState() {
            const redoBtn = document.getElementById('canvasRedoBtn');
            const undoBtn = document.getElementById('canvasUndoBtn');
            const modalUndoBtn = document.getElementById('modalUndoBtn');
            const count = undoStack.length;
            const redoCount = redoStack.length;
            const redoDesc = window.I18n.t(redoStack[redoStack.length - 1]?.desc || '已撤回的操作');
            const undoDesc = window.I18n.t(undoStack[undoStack.length - 1]?.desc || '上一步操作');
            const redoTitle = redoCount > 0
                ? window.I18n.t('重做: {desc} (Ctrl+Y / Ctrl+Shift+Z)', { desc: redoDesc })
                : '暂无可重做的操作 (Ctrl+Y / Ctrl+Shift+Z)';
            const title = count > 0
                ? window.I18n.t('撤回: {desc} (Ctrl+Z)', { desc: undoDesc })
                : '暂无可撤回操作 (Ctrl+Z)';

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
            const textureEditorModal = document.getElementById('textureImageEditorModal');
            if (textureEditorModal && textureEditorModal.classList.contains('active') &&
                typeof updateEditorHistoryButtons === 'function') {
                updateEditorHistoryButtons();
            }
        }

        function cloneLongBodyComposerSessionForHistory(session) {
            if (!session) return null;
            return {
                baseFrames: (session.baseFrames || []).map((frame) => cloneFrame(frame)),
                preComposerState: cloneLongBodyPreComposerState(session.preComposerState),
                tailFrame: session.tailFrame ? cloneFrame(session.tailFrame) : null,
                bodySourceName: session.bodySourceName || '',
                tailSourceName: session.tailSourceName || '',
                tailRestoreSourceName: session.tailRestoreSourceName || '',
                tailRestoreState: session.tailRestoreState || 'unset',
                tailRestoreExplicit: typeof session.tailRestoreExplicit === 'boolean'
                    ? session.tailRestoreExplicit
                    : null,
                tailSourceExplicit: !!session.tailSourceExplicit,
                appliedScope: session.appliedScope || 'current',
                targetHeight: Number(session.targetHeight) || 0,
                coverage: Number(session.coverage) || 0,
                fade: Number(session.fade) || 0,
                tailPreset: session.tailPreset || 'none',
                presetHeight: Number(session.presetHeight) || 0,
                preserveImportedOutput: !!session.preserveImportedOutput
            };
        }

        function cloneLongBodyComposerSessionsForHistory() {
            if (typeof longBodyComposerSessions === 'undefined' ||
                !(longBodyComposerSessions instanceof Map)) {
                return null;
            }
            return new Map(Array.from(longBodyComposerSessions.entries(), ([key, session]) => [
                key,
                cloneLongBodyComposerSessionForHistory(session)
            ]));
        }

        function cloneCreatedTextureParamsEntryForHistory(entry) {
            if (!entry || typeof entry !== 'object') return entry;
            if (typeof cloneTextureEditParams === 'function') {
                return cloneTextureEditParams(entry);
            }
            try {
                return JSON.parse(JSON.stringify(entry));
            } catch (_) {
                return {
                    ...entry,
                    generalEditParams: entry.generalEditParams
                        ? {
                            ...entry.generalEditParams,
                            cropRect: entry.generalEditParams.cropRect
                                ? { ...entry.generalEditParams.cropRect }
                                : null,
                            imageTransform: entry.generalEditParams.imageTransform
                                ? { ...entry.generalEditParams.imageTransform }
                                : null,
                            rgbAdjustment: entry.generalEditParams.rgbAdjustment
                                ? { ...entry.generalEditParams.rgbAdjustment }
                                : null
                        }
                        : undefined
                };
            }
        }

        function cloneTextureEditRecipeParams(params, rgbOverride = undefined) {
            if (!params || typeof params !== 'object') return null;
            const rgbSource = rgbOverride !== undefined ? rgbOverride : params.rgbAdjustment;
            return {
                ...params,
                imageTransform: typeof cloneImageTransform === 'function'
                    ? cloneImageTransform(params.imageTransform)
                    : (params.imageTransform ? { ...params.imageTransform } : null),
                rgbAdjustment: typeof cloneRgbAdjustment === 'function'
                    ? cloneRgbAdjustment(rgbSource)
                    : (rgbSource ? { ...rgbSource } : null)
            };
        }

        function cloneTextureEditRecipeEntry(recipe) {
            if (!recipe || typeof recipe !== 'object') return null;
            return {
                sourceFrames: (recipe.sourceFrames || []).map((f) => cloneFrame(f)),
                originalReference: recipe.originalReference,
                keyImageOriginalSources: typeof cloneKeyImageEditSources === 'function'
                    ? cloneKeyImageEditSources(recipe.keyImageOriginalSources)
                    : {},
                params: cloneTextureEditRecipeParams(recipe.params),
                outputFrames: (recipe.outputFrames || []).map((f) => cloneFrame(f))
            };
        }

        function cloneTextureEditRecipesForHistory(recipesMap) {
            if (!(recipesMap instanceof Map)) return null;
            return new Map(Array.from(recipesMap.entries(), ([k, v]) => [k, cloneTextureEditRecipeEntry(v)]));
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
                skinHitsoundReplacements: typeof cloneSkinHitsoundReplacements === 'function'
                    ? cloneSkinHitsoundReplacements()
                    : new Map(),
                userReplacedTextures: new Map(userReplacedTextures),
                deletedSkinTexturePaths: new Set(deletedSkinTexturePaths),
                createdSkinTextureParams: new Map(Array.from(
                    createdSkinTextureParams.entries(),
                    ([k, v]) => [k, cloneCreatedTextureParamsEntryForHistory(v)]
                )),
                textureEditRecipes: (typeof textureEditRecipes !== 'undefined' && textureEditRecipes instanceof Map)
                    ? cloneTextureEditRecipesForHistory(textureEditRecipes)
                    : null,
                longBodyComposerSessions: cloneLongBodyComposerSessionsForHistory(),
                activeEditorKeyCount: activeEditorKeyCount,
                revisionId: window.skinWorkspaceRevision
                    ? window.skinWorkspaceRevision.currentId()
                    : 0
            };
        }

        function recordSkinUndoBeforeChange(desc = '修改参数', options = {}) {
            if (isPerformingUndoRedo) return;
            // 历史事务或 Agent 批次在开始前已经记录过一次完整快照。批次内部的贴图、
            // 参数和联动修改继续走原有写入路径，但不再拆成多条撤回记录。
            if (activeHistoryTransaction ||
                (window.skinAgentSession &&
                 typeof window.skinAgentSession.isApplying === 'function' &&
                 window.skinAgentSession.isApplying())) {
                return;
            }
            if (typeof invalidateKeyImageHeightPersistence === 'function') {
                invalidateKeyImageHeightPersistence();
            }
            if (options.force || !continuousActionActive) {
                const snap = createSkinSnapshot(desc);
                undoStack.push(snap);
                if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
                redoStack.length = 0;
                if (window.skinWorkspaceRevision) window.skinWorkspaceRevision.advance();
                continuousActionActive = true;
                updateUndoButtonState();
                if (window.skinAgentSession &&
                    typeof window.skinAgentSession.notifyExternalMutation === 'function') {
                    window.skinAgentSession.notifyExternalMutation(desc);
                }
            }
            syncTextureEditorNonTextureSettings();
            if (continuousActionTimer) clearTimeout(continuousActionTimer);
            continuousActionTimer = setTimeout(() => {
                continuousActionActive = false;
                continuousActionTimer = null;
            }, 600);
        }

        /**
         * 开启一个历史事务，在提交前抑制嵌套的 recordSkinUndoBeforeChange 调用。
         */
        function beginHistoryTransaction(desc = '修改参数') {
            if (isPerformingUndoRedo) return null;
            if (activeHistoryTransaction) {
                throw new Error(`已有未完成的历史事务: ${activeHistoryTransaction.desc}`);
            }
            if (typeof invalidateKeyImageHeightPersistence === 'function') {
                invalidateKeyImageHeightPersistence();
            }
            clearContinuousActionState();
            const snapshot = createSkinSnapshot(desc);
            const redoBefore = redoStack.slice();
            if (window.skinWorkspaceRevision) {
                window.skinWorkspaceRevision.advance();
            }
            activeHistoryTransaction = {
                desc,
                snapshot,
                redoBefore
            };
            return activeHistoryTransaction;
        }

        /**
         * 提交当前历史事务：入栈单条撤回快照、复位连续合并窗口并推进单次 revision。
         */
        function commitHistoryTransaction(options = {}) {
            if (!activeHistoryTransaction) return null;
            const tx = activeHistoryTransaction;
            activeHistoryTransaction = null;
            clearContinuousActionState();
            undoStack.push(tx.snapshot);
            if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
            redoStack.length = 0;
            syncTextureEditorNonTextureSettings();
            updateUndoButtonState();
            if (options.notifyExternal !== false &&
                window.skinAgentSession &&
                typeof window.skinAgentSession.notifyExternalMutation === 'function') {
                window.skinAgentSession.notifyExternalMutation(tx.desc);
            }
            return tx;
        }

        /**
         * 回滚当前历史事务；纯无操作中止时可传入 restoreSnapshot=false 仅恢复版本基线。
         */
        function rollbackHistoryTransaction(options = {}) {
            if (!activeHistoryTransaction) return false;
            const tx = activeHistoryTransaction;
            activeHistoryTransaction = null;
            clearContinuousActionState();
            if (options.restoreSnapshot !== false) {
                applySkinSnapshot(tx.snapshot);
                redoStack.length = 0;
                redoStack.push(...tx.redoBefore);
                if (typeof syncTextureEditorBaseAfterSkinHistory === 'function') {
                    syncTextureEditorBaseAfterSkinHistory();
                }
            } else if (window.skinWorkspaceRevision) {
                window.skinWorkspaceRevision.adopt(tx.snapshot);
            }
            updateUndoButtonState();
            return true;
        }

        function rollbackLastRecordedSkinUndo(expectedSnapshot, previousRedoStack = null) {
            if (!expectedSnapshot || undoStack.length === 0) return false;
            if (undoStack[undoStack.length - 1] !== expectedSnapshot) return false;
            undoStack.pop();
            if (Array.isArray(previousRedoStack)) {
                redoStack.length = 0;
                redoStack.push(...previousRedoStack);
            }
            clearContinuousActionState();
            applySkinSnapshot(expectedSnapshot);
            updateUndoButtonState();
            return true;
        }

        function syncTextureEditorNonTextureSettings() {
            const modal = document.getElementById('textureImageEditorModal');
            if (!modal || (!modal.classList.contains('active') && modal.style.display === 'none')) {
                return;
            }
            if (typeof syncTextureEditorSnapshotsWithCurrentManiaConfigs === 'function') {
                syncTextureEditorSnapshotsWithCurrentManiaConfigs();
            }
        }

        function applySkinSnapshot(snap, options = {}) {
            if (!snap) return;
            if (typeof invalidateKeyImageHeightPersistence === 'function') {
                invalidateKeyImageHeightPersistence();
            }
            const preserveNonTexture = !!options.preserveNonTextureSettings;
            const currentNonTextureConfigs = preserveNonTexture
                ? cloneManiaSkinConfigs(maniaSkinConfigurations)
                : null;
            const hitsoundReplacementsChanged = !preserveNonTexture &&
                typeof areSkinHitsoundReplacementsEqual === 'function' &&
                !areSkinHitsoundReplacementsEqual(
                    skinHitsoundReplacements,
                    snap.skinHitsoundReplacements
                );
            isPerformingUndoRedo = true;
            try {
                // 0. 还原皮肤音效覆盖层，再重建当前生效的音效目录
                if (hitsoundReplacementsChanged) {
                    if (typeof restoreSkinHitsoundReplacements === 'function') {
                        restoreSkinHitsoundReplacements(snap.skinHitsoundReplacements);
                    }
                    if (typeof refreshSkinHitsoundCatalogWithReplacements === 'function') {
                        refreshSkinHitsoundCatalogWithReplacements();
                    }
                }

                // 1. 还原 userReplacedTextures
                userReplacedTextures.clear();
                if (snap.userReplacedTextures) {
                    for (const [k, v] of snap.userReplacedTextures.entries()) {
                        userReplacedTextures.set(k, v);
                    }
                }
                deletedSkinTexturePaths.clear();
                if (snap.deletedSkinTexturePaths) {
                    for (const name of snap.deletedSkinTexturePaths) {
                        deletedSkinTexturePaths.add(name);
                    }
                }
                createdSkinTextureParams.clear();
                if (snap.createdSkinTextureParams) {
                    for (const [k, v] of snap.createdSkinTextureParams.entries()) {
                        createdSkinTextureParams.set(k, cloneCreatedTextureParamsEntryForHistory(v));
                    }
                }
                if (typeof textureEditRecipes !== 'undefined' && textureEditRecipes instanceof Map) {
                    textureEditRecipes.clear();
                    const clonedRecipes = cloneTextureEditRecipesForHistory(snap.textureEditRecipes);
                    if (clonedRecipes) {
                        for (const [k, v] of clonedRecipes.entries()) {
                            textureEditRecipes.set(k, v);
                        }
                    }
                }
                if (typeof longBodyComposerSessions !== 'undefined' &&
                    longBodyComposerSessions instanceof Map) {
                    longBodyComposerSessions.clear();
                    if (snap.longBodyComposerSessions) {
                        for (const [key, session] of snap.longBodyComposerSessions.entries()) {
                            const cloned = cloneLongBodyComposerSessionForHistory(session);
                            if (cloned) longBodyComposerSessions.set(key, cloned);
                        }
                    }
                }

                // 2. 还原 maniaSkinConfigurations
                maniaSkinConfigurations.clear();
                if (snap.maniaSkinConfigurations) {
                    for (const [k, v] of snap.maniaSkinConfigurations.entries()) {
                        const cloned = cloneManiaSkinConfig(v);
                        if (preserveNonTexture && currentNonTextureConfigs && currentNonTextureConfigs.has(k)) {
                            copyNonTextureManiaProperties(currentNonTextureConfigs.get(k), cloned);
                        }
                        maniaSkinConfigurations.set(k, cloned);
                    }
                }
                if (preserveNonTexture && currentNonTextureConfigs) {
                    for (const [k, v] of currentNonTextureConfigs.entries()) {
                        if (!maniaSkinConfigurations.has(k)) {
                            maniaSkinConfigurations.set(k, cloneManiaSkinConfig(v));
                        }
                    }
                }

                // 3. 还原 currentSkinMetadata & skinFontsConfig & globalSkinImageLookups
                if (!preserveNonTexture) {
                    if (snap.currentSkinMetadata) {
                        currentSkinMetadata = JSON.parse(JSON.stringify(snap.currentSkinMetadata));
                    }
                    if (snap.skinFontsConfig) {
                        skinFontsConfig = { ...snap.skinFontsConfig };
                    }
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
                        skinImageStore.set(
                            normalizeSkinAssetStoreKey(k),
                            cloneSkinAssetEntry(v)
                        );
                    }
                }
                skinFallbackImageStore.clear();
                if (snap.skinFallbackImageStore) {
                    for (const [k, v] of snap.skinFallbackImageStore.entries()) {
                        skinFallbackImageStore.set(
                            normalizeSkinAssetStoreKey(k),
                            cloneSkinAssetEntry(v)
                        );
                    }
                }
                if (typeof clearComboburstRuntimeEffects === 'function') {
                    clearComboburstRuntimeEffects();
                }
                if (typeof refreshSkinCursor === 'function') refreshSkinCursor();

                // 5. 还原活动键位
                if (!preserveNonTexture && snap.activeEditorKeyCount) {
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
                if (typeof textureLibraryUi !== 'undefined' && textureLibraryUi) {
                    textureLibraryUi.refresh();
                }
                updateSkinInfoDisplay();
                if (hitsoundReplacementsChanged &&
                    typeof refreshManiaHitsoundPlaybackAfterEdit === 'function') {
                    void refreshManiaHitsoundPlaybackAfterEdit();
                }
                if (selectedCanvasElement) {
                    const liveElem = canvasInteractiveElements.find(e => {
                        if (selectedCanvasElement.noteInstanceKey && e.noteInstanceKey) {
                            return e.noteInstanceKey === selectedCanvasElement.noteInstanceKey;
                        }
                        return e.id === selectedCanvasElement.id;
                    }) || selectedCanvasElement;
                    syncCanvasSelectedCard(liveElem);
                }
                if (window.skinWorkspaceRevision) window.skinWorkspaceRevision.adopt(snap);
            } catch (err) {
                console.error('[Undo/Redo] 还原皮肤快照失败:', err);
            } finally {
                isPerformingUndoRedo = false;
                updateUndoButtonState();
            }
        }

        function syncTextureEditorBaseAfterSkinHistory() {
            const modal = document.getElementById('textureImageEditorModal');
            if (!modal || (!modal.classList.contains('active') && modal.style.display === 'none')) {
                return;
            }
            if (typeof updateEditorBaseAfterSave === 'function') {
                updateEditorBaseAfterSave();
            }
            if (typeof refreshTextureImageEditorAfterSkinHistory === 'function') {
                refreshTextureImageEditorAfterSkinHistory();
            }
        }

        function performSkinUndo() {
            clearContinuousActionState();
            if (undoStack.length === 0) {
                showToast('提示', '没有可撤回的操作');
                return;
            }
            const currentState = createSkinSnapshot('当前状态');
            redoStack.push(currentState);
            if (redoStack.length > MAX_UNDO_STACK) redoStack.shift();

            const previousState = undoStack.pop();
            applySkinSnapshot(previousState);
            syncTextureEditorBaseAfterSkinHistory();
            if (window.skinAgentSession &&
                typeof window.skinAgentSession.notifyExternalMutation === 'function') {
                window.skinAgentSession.notifyExternalMutation('undo');
            }
            showToast(
                '已撤回 (Ctrl+Z)',
                previousState.desc
                    ? window.I18n.t('已撤回: {desc}', { desc: window.I18n.t(previousState.desc) })
                    : '已恢复上一状态'
            );
        }

        function performSkinRedo() {
            clearContinuousActionState();
            if (redoStack.length === 0) {
                showToast('提示', '没有可重做的操作');
                return;
            }
            const currentState = createSkinSnapshot('当前状态');
            undoStack.push(currentState);
            if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();

            const nextState = redoStack.pop();
            applySkinSnapshot(nextState);
            syncTextureEditorBaseAfterSkinHistory();
            if (window.skinAgentSession &&
                typeof window.skinAgentSession.notifyExternalMutation === 'function') {
                window.skinAgentSession.notifyExternalMutation('redo');
            }
            showToast(
                '已重做 (Ctrl+Y)',
                nextState.desc
                    ? window.I18n.t('已重做: {desc}', { desc: window.I18n.t(nextState.desc) })
                    : '已恢复操作'
            );
        }

        function saveInitialSkinSnapshot() {
            try {
                if (window.skinWorkspaceRevision) window.skinWorkspaceRevision.reset();
                initialSkinSnapshot = {
                    ...createSkinSnapshot('初始皮肤'),
                    revisionId: 0
                };
                undoStack.length = 0;
                redoStack.length = 0;
                activeHistoryTransaction = null;
                clearContinuousActionState();
                updateUndoButtonState();
                if (window.skinAgentSession &&
                    typeof window.skinAgentSession.notifyExternalMutation === 'function') {
                    window.skinAgentSession.notifyExternalMutation('initial-snapshot');
                }
            } catch (err) {
                console.error('[Snapshot] 保存皮肤初始快照失败:', err);
            }
        }

        function revertSkinToInitial() {
            if (!initialSkinSnapshot) {
                showToast('提示', '暂无已保存的初始皮肤快照');
                return;
            }

            if (!confirm(window.I18n.t('确定要将所有参数和贴图复原为皮肤导入时的初始状态吗？未导出的修改将被丢弃。'))) {
                return;
            }

            recordSkinUndoBeforeChange('复原初始皮肤');
            clearContinuousActionState();

            // 清理画布选中与交互状态
            selectedCanvasElement = null;
            const card = document.getElementById('canvasSelectedCard');
            if (card) card.style.display = 'none';

            applySkinSnapshot(initialSkinSnapshot);
            syncTextureEditorBaseAfterSkinHistory();
            showToast('已复原', '所有参数与贴图已恢复为导入时的初始状态 (可按 Ctrl+Z 撤回)');
        }

        async function startFromDefaultSkin(options = {}) {
            const skipConfirm = options && options.skipConfirm === true;
            if (!skipConfirm && !confirm(window.I18n.t('确定要清空当前皮肤，并从 osu!stable 默认皮肤重新开始吗？未导出的修改将被丢弃。'))) {
                return false;
            }

            if (isPlaying) {
                pauseAudioAndBeatmap();
            }

            const keyCount = getActiveKeyCount();
            clearTextureProjectImportState();
            currentSkinZip = null;
            currentSkinFileName = '默认皮肤';
            if (typeof clearSkinHitsoundReplacements === 'function') {
                clearSkinHitsoundReplacements();
            } else {
                skinHitsoundReplacements.clear();
            }
            skinHitsoundCatalog.clear();
            skinHitsoundSummary = {
                groupCount: 0,
                fileCount: 0,
                selectedFileCount: 0
            };
            deactivateEditableDefaultSkinWorkspace();

            userReplacedTextures.clear();
            deletedSkinTexturePaths.clear();
            createdSkinTextureParams.clear();
            if (typeof textureEditRecipes !== 'undefined' && textureEditRecipes instanceof Map) {
                textureEditRecipes.clear();
            }
            if (typeof longBodyComposerSessions !== 'undefined' && longBodyComposerSessions instanceof Map) {
                longBodyComposerSessions.clear();
            }
            scorePercentSourceImages.clear();
            for (const url of activeSkinBlobUrls) {
                try { URL.revokeObjectURL(url); } catch (_) {}
            }
            activeSkinBlobUrls = [];

            skinImageStore.clear();
            skinFallbackImageStore.clear();
            maniaSkinConfigurations.clear();
            globalSkinImageLookups.clear();
            if (typeof keyImageHeightBaselineState !== 'undefined') {
                keyImageHeightBaselineState.clear();
            }

            skinFontsConfig = {
                scorePrefix: 'score',
                scoreOverlap: 0,
                comboPrefix: 'combo',
                comboOverlap: 0,
                hitCirclePrefix: 'default',
                hitCircleOverlap: -2,
                hasExplicitScoreOverlap: false,
                hasExplicitComboOverlap: false,
                hasExplicitComboPrefix: false
            };
            currentSkinMetadata = createEditableDefaultSkinMetadata();

            if (ui.osk) ui.osk.value = '';
            await loadDefaultSkin();
            const defaultHitsoundCatalog = typeof ensureDefaultSkinHitsoundsLoaded === 'function'
                ? await ensureDefaultSkinHitsoundsLoaded()
                : new Map();
            skinHitsoundCatalog = new Map(defaultHitsoundCatalog);
            if (typeof refreshSkinHitsoundCatalogWithReplacements === 'function') {
                refreshSkinHitsoundCatalogWithReplacements();
            } else {
                skinHitsoundSummary = typeof summarizeSkinHitsoundCatalog === 'function'
                    ? summarizeSkinHitsoundCatalog(skinHitsoundCatalog)
                    : {
                        groupCount: skinHitsoundCatalog.size,
                        fileCount: skinHitsoundCatalog.size,
                        selectedFileCount: skinHitsoundCatalog.size
                    };
            }
            activateEditableDefaultSkinWorkspace(keyCount);
            if (typeof prepareManiaHitsoundPlayback === 'function' && currentBeatmap && activeNotes.length > 0) {
                await prepareManiaHitsoundPlayback();
            }

            selectedCanvasElement = null;
            const card = document.getElementById('canvasSelectedCard');
            if (card) card.style.display = 'none';

            updateSkinInfoDisplay();
            updateSkinEditorKeyPills();
            renderSkinEditorParams();
            if (typeof refreshSkinEditorAfterSkinImport === 'function') {
                refreshSkinEditorAfterSkinImport();
            }
            if (typeof refreshSkinCursor === 'function') refreshSkinCursor();
            if (currentBeatmap) {
                const currentTimeMs = (audio && !isNaN(audio.currentTime)) ? audio.currentTime * 1000 : 0;
                syncNotesStateWithTime(currentTimeMs);
            }
            drawFrame();
            saveInitialSkinSnapshot();
            if (typeof markStartupSkinReady === 'function') {
                markStartupSkinReady('默认皮肤');
            }
            showToast('已切换到默认皮肤', '当前工作区已重置为 osu!stable 默认皮肤');
            return true;
        }
