// ============================================================================
// texture-image-editor-save-close.js - 贴图保存管线、目标刷新与单图重置
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function resolveRefreshedTabTarget(tab) {
            if (!tab || tab.kind !== 'texture' || !tab.target) {
                return null;
            }
            if (tab.target.kind === 'library') {
                const path = tab.target.libraryPath || tab.target.base;
                const source = collectExistingTextureSources().find((item) =>
                    normalizeSkinKey(item.path) === normalizeSkinKey(path)
                );
                if (!source) return null;
                return buildTextureLibraryEditorTarget(source, {
                    paramKey: tab.target.libraryParamKey
                }) || null;
            }
            if (!tab.target.p) return null;
            const p = getTextureTabParams().find((item) => item.key === tab.target.p.key);
            if (!p) return null;
            const target = buildEditorTarget(p);
            return (target && target.selectable) ? target : null;
        }

        function refreshSavedTabTarget(savedTab) {
            const target = resolveRefreshedTabTarget(savedTab);
            if (!target) return;
            savedTab.target = target;
            if (target.kind === 'library' && target.p) {
                savedTab.title = target.p.zhName;
            }
            if (getActiveTab() === savedTab) state.selected = target;
        }

        function getTextureEditSourcePath(selected) {
            if (!selected) return '';
            if (selected.kind === 'library') {
                return normalizeTextureLookupPath(selected.libraryPath || selected.base);
            }
            return normalizeTextureLookupPath(
                (selected.resolved && selected.resolved.name) ||
                selected.base ||
                ''
            );
        }

        function getTextureEditParamKey(selected) {
            if (!selected) return null;
            if (selected.kind === 'library') {
                return selected.libraryParamKey || (
                    (typeof getEffectiveParamForTarget === 'function')
                        ? (getEffectiveParamForTarget(selected) || {}).key || null
                        : null
                );
            }
            return selected.p ? selected.p.key : null;
        }

        function createIndependentTexturePath(sourcePath, paramKey) {
            const normalizedSource = normalizeTextureLookupPath(sourcePath);
            const slash = normalizedSource.lastIndexOf('/');
            const directory = slash >= 0 ? normalizedSource.slice(0, slash + 1) : '';
            const basename = slash >= 0 ? normalizedSource.slice(slash + 1) : normalizedSource;
            const suffix = String(paramKey || 'copy')
                .replace(/[^a-z0-9_-]+/gi, '_')
                .replace(/^_+|_+$/g, '')
                .toLowerCase() || 'copy';
            const existing = new Set(
                collectExistingTextureSources().map((item) => normalizeSkinKey(item.path))
            );
            let index = 1;
            let candidate;
            do {
                const suffixText = index === 1 ? suffix : `${suffix}_${index}`;
                candidate = `${directory}${basename}_${suffixText}`;
                index++;
            } while (existing.has(normalizeSkinKey(candidate)));
            return candidate;
        }

        async function resolveTextureEditSavePlan(selected, options = {}) {
            const sourcePath = getTextureEditSourcePath(selected);
            if (!sourcePath) {
                throw new Error('无法确定当前贴图路径');
            }
            if (selected && isFontGlyphTextureParam(selected.p)) {
                return {
                    sourcePath,
                    savePath: sourcePath,
                    paramKey: selected.p.key,
                    mode: 'overwrite',
                    otherReferences: []
                };
            }
            const paramKey = getTextureEditParamKey(selected);
            const otherReferences = collectOtherTrackTextureReferences(sourcePath, paramKey);
            if (otherReferences.length === 0) {
                return {
                    sourcePath,
                    savePath: sourcePath,
                    paramKey,
                    mode: 'overwrite',
                    otherReferences
                };
            }
            const decision = (options && options.mode === 'overwrite')
                ? 'all'
                : ((options && options.mode === 'independent')
                    ? 'current'
                    : await requestSharedTextureReferenceDecision(sourcePath, otherReferences));
            if (!decision) return null;
            if (decision === 'all') {
                return {
                    sourcePath,
                    savePath: sourcePath,
                    paramKey,
                    mode: 'overwrite',
                    otherReferences
                };
            }
            return {
                sourcePath,
                savePath: createIndependentTexturePath(sourcePath, paramKey),
                paramKey,
                mode: 'independent',
                otherReferences
            };
        }

        function pointTextureEditParamToPath(paramKey, targetPath) {
            if (!paramKey || !targetPath) return false;
            const p = getTextureTabParams().find((item) => item.key === paramKey) ||
                (typeof SKIN_INI_PARAM_SCHEMA !== 'undefined'
                    ? SKIN_INI_PARAM_SCHEMA.find((item) => item.key === paramKey)
                    : null);
            if (!p || typeof assignTextureParamLookup !== 'function') return false;
            if (isFontGlyphTextureParam(p)) return false;
            if (typeof preserveHoldHeadsBeforeNoteEdit === 'function') {
                preserveHoldHeadsBeforeNoteEdit(
                    getActiveKeyCount(),
                    p,
                    { syncInput: true }
                );
            }
            assignTextureParamLookup(getActiveKeyCount(), p, targetPath);
            return true;
        }

        function completeSavedTab(options = {}) {
            const savedTab = getActiveTab();
            if (!savedTab || savedTab.kind !== 'texture') return false;
            if (typeof clearKeyImageHeightBaselines === 'function') {
                clearKeyImageHeightBaselines();
            }
            refreshSavedTabTarget(savedTab);
            const hasPreparedRecipe = !!getStoredTextureEditRecipe(savedTab.target);
            if (!hasPreparedRecipe) {
                rememberTextureEditRecipe(savedTab);
            }
            if (!getStoredTextureEditRecipe(savedTab.target)) {
                removeTextureEditRecipe(savedTab);
            }
            updateEditorBaseAfterSave();
            renderPicker();

            if (options.closeTabAfterSave !== true) {
                if (savedTab.state.longBodyComposer && savedTab.state.longBodyComposer.active) {
                    const previewOutput = buildLongBodyComposite(LONG_BODY_PREVIEW_HEIGHT);
                    if (previewOutput) {
                        savedTab.state.previewFrames = [previewOutput];
                    }
                }
                savedTab.state.previewSnapshot = editorBaseSnapshot;
                savedTab.state.savedLongBodyComposer = captureLongBodyComposerState(savedTab.state.longBodyComposer);
                savedTab.state.keyImageEditRecipe = null;
                resetEditorHistory();
                return true;
            }

            const remainingTextureTabs = getTextureTabs().filter((tab) => tab.id !== savedTab.id);
            if (remainingTextureTabs.length === 0 && options.closeEditorWhenLast !== false) {
                finalizeEditorClose({ restoreSnapshot: false });
            } else {
                removeTab(savedTab.id, { restorePreview: false });
            }
            return true;
        }

        async function applyKeyImageTextureEditPipeline(options, context) {
            const {
                effParam,
                keyImageApplyScope,
                syncKeyImagePair,
                selectedKeyImageKind,
                recordUndoForApply
            } = context;
            const groups = collectKeyImageEditGroups(keyImageApplyScope, {
                syncPair: syncKeyImagePair,
                selectedKind: selectedKeyImageKind
            });
            if (groups.length === 0) {
                throw new Error('没有找到可应用的 KeyImage 源贴图');
            }
            const params = cloneTextureEditRecipeParams(
                state.keyImageEditRecipe && state.keyImageEditRecipe.params
                    ? state.keyImageEditRecipe.params
                    : getCurrentEditParams(),
                state.rgbAdjustment
            );

            let keyImageMode = (options && options.mode) || 'overwrite';
            if (!options.mode && keyImageApplyScope !== 'all') {
                const otherReferences = [];
                const sourcePaths = new Set();
                for (const group of groups) {
                    for (const entry of group.entries) {
                        const rawSource = (entry.reference && !entry.reference.startsWith('missing:'))
                            ? entry.reference
                            : ((entry.target.resolved && entry.target.resolved.name) ||
                               entry.target.base ||
                               entry.p.key);
                        const sourcePath = normalizeTextureLookupPath(rawSource);
                        if (!sourcePath || sourcePaths.has(sourcePath)) continue;
                        sourcePaths.add(sourcePath);
                        const refs = collectTexturePathReferences(sourcePath).filter((p) => {
                            const track = getParamTrackIndex(p);
                            return track != null && track !== entry.column;
                        });
                        for (const ref of refs) {
                            if (!otherReferences.some((r) => r.key === ref.key)) {
                                otherReferences.push(ref);
                            }
                        }
                    }
                }
                if (otherReferences.length > 0) {
                    const primarySource = Array.from(sourcePaths)[0] || (effParam && effParam.key) || 'KeyImage';
                    const decision = await requestSharedTextureReferenceDecision(primarySource, otherReferences);
                    if (!decision) return false;
                    keyImageMode = (decision === 'all') ? 'overwrite' : 'independent';
                }
            }

            if (state.previewSnapshot) applySkinSnapshot(state.previewSnapshot, { preserveNonTextureSettings: true });
            const stateLabel = syncKeyImagePair
                ? 'KeyImage + KeyImageD'
                : (selectedKeyImageKind === 'down' ? 'KeyImageD' : 'KeyImage');
            const scopeLabel = keyImageApplyScope === 'all' ? '全部轨道' : '当前轨道';
            recordUndoForApply(`贴图编辑: ${stateLabel}（${scopeLabel}）`);
            const prepared = await persistKeyImageEditGroups(groups, params, {
                mode: keyImageMode,
                scope: keyImageApplyScope
            });
            if (!prepared) throw new Error('KeyImage 贴图未能写入皮肤');
            rememberPreparedKeyImageEditRecipes(prepared, params);
            if (keyImageMode === 'independent' && state.selected && state.selected.kind === 'library') {
                const repItem = prepared.find((item) => item.group.entries.some((entry) => entry.isSelected)) || prepared[0];
                if (repItem && repItem.base) {
                    state.selected.base = repItem.base;
                    state.selected.libraryPath = repItem.base;
                    state.selected.libraryStoreKey = repItem.base;
                }
            }
            showToast(
                '贴图编辑成功',
                keyImageMode === 'independent'
                    ? `已更新${scopeLabel}的 ${stateLabel}，已为当前轨道创建独立贴图。`
                    : `已更新${scopeLabel}的 ${stateLabel}，已直接覆盖原图。`
            );
            return completeSavedTab(options);
        }

        async function applyStandardTextureEditPipeline(options, context) {
            const { recordUndoForApply } = context;
            const framesToSave = buildPreviewFrames().map((frame) =>
                applyRgbAdjustmentToCanvas(cloneFrame(frame), state.rgbAdjustment)
            );
            if (!framesToSave || framesToSave.length === 0 || !framesToSave[0]) {
                throw new Error('无法生成要保存的贴图');
            }
            state.previewFrames = framesToSave;
            const savePlan = await resolveTextureEditSavePlan(state.selected, options);
            if (!savePlan) return false;

            const serialized = await serializeFrames(savePlan.savePath, framesToSave);
            if (state.previewSnapshot) applySkinSnapshot(state.previewSnapshot, { preserveNonTextureSettings: true });

            const editingCreatedTexture =
                typeof hasCreatedTextureParams === 'function' &&
                hasCreatedTextureParams(savePlan.sourcePath);
            const hasExistingRecipe = !!getStoredTextureEditRecipe(state.selected);
            if (savePlan.paramKey &&
                typeof preserveHoldHeadsBeforeNoteEdit === 'function') {
                const currentParam = getTextureTabParams().find(
                    (item) => item.key === savePlan.paramKey
                ) || (typeof SKIN_INI_PARAM_SCHEMA !== 'undefined'
                    ? SKIN_INI_PARAM_SCHEMA.find((item) => item.key === savePlan.paramKey)
                    : null);
                if (currentParam) {
                    preserveHoldHeadsBeforeNoteEdit(
                        getActiveKeyCount(),
                        currentParam,
                        { syncInput: true }
                    );
                }
            }
            if (savePlan.mode === 'independent' &&
                state.selected.kind !== 'library' &&
                !hasExistingRecipe &&
                state.originalFrames.length > 0 &&
                typeof installTextureFramesAtPath === 'function') {
                installTextureFramesAtPath(
                    state.originalFrames,
                    savePlan.sourcePath,
                    { draw: false }
                );
            }
            const targetZh = (state.selected && state.selected.p && state.selected.p.zhName) || savePlan.savePath;
            const modeZh = savePlan.mode === 'independent' ? '独立创建' : '同步替换';
            recordUndoForApply(`贴图编辑: ${targetZh}（${modeZh}）`);
            persistTextureFramesAtPath(serialized, savePlan.savePath, {
                refresh: false,
                showToast: false
            });
            if (savePlan.mode === 'independent' && editingCreatedTexture) {
                cloneCreatedTextureParams(
                    savePlan.sourcePath,
                    savePlan.savePath
                );
            }
            pointTextureEditParamToPath(
                savePlan.paramKey,
                savePlan.savePath
            );
            if (savePlan.mode === 'overwrite') {
                if (Array.isArray(savePlan.otherReferences)) {
                    for (const ref of savePlan.otherReferences) {
                        if (ref && ref.key && ref.key !== savePlan.paramKey) {
                            pointTextureEditParamToPath(ref.key, savePlan.savePath);
                        }
                    }
                }
                if (savePlan.paramKey && typeof getTextureParamColumnKeys === 'function') {
                    const curKeys = getActiveKeyCount();
                    const columnKeys = getTextureParamColumnKeys(savePlan.paramKey, curKeys);
                    for (const colKey of columnKeys) {
                        pointTextureEditParamToPath(colKey, savePlan.savePath);
                    }
                }
            }
            if (editingCreatedTexture && typeof saveCreatedTextureGeneralEditParams === 'function') {
                saveCreatedTextureGeneralEditParams(savePlan.savePath, {
                    ...getCurrentEditParams(),
                    imageTransform: cloneImageTransform(state.imageTransform),
                    rgbAdjustment: cloneRgbAdjustment(state.rgbAdjustment)
                });
            }
            state.originalReference = normalizeSkinKey(savePlan.savePath);
            if (state.selected.kind === 'library') {
                state.selected.base = savePlan.savePath;
                state.selected.libraryPath = savePlan.savePath;
                if (state.selected.resolved) {
                    state.selected.resolved.name = savePlan.savePath;
                }
            } else if (state.selected.resolved) {
                state.selected.resolved.name = savePlan.savePath;
            }
            drawFrame();
            renderSkinEditorParams();
            renderPicker();
            if (typeof renderTextureLibrary === 'function') renderTextureLibrary();
            showToast(
                '贴图编辑成功',
                savePlan.mode === 'independent'
                    ? `已创建独立副本 ${savePlan.savePath}`
                    : `已直接覆盖 ${savePlan.savePath}`
            );
            return completeSavedTab(options);
        }

        async function applyLongBodyComposerEditPipeline(options, context) {
            const {
                longBodyTargetColumns,
                applyingAll,
                recordUndoForApply
            } = context;
            setLongBodyProgress('正在生成完整长条...', 0);
            await waitForUiPaint();
            const framesToSave = [await buildLongBodyCompositeAsync(
                state.longBodyComposer.targetHeight,
                (value) => setLongBodyProgress('正在生成完整长条...', value)
            )];
            if (!framesToSave || framesToSave.length === 0 || !framesToSave[0]) {
                throw new Error('无法生成要保存的贴图');
            }
            setLongBodyProgress('正在编码 PNG...', 65, true);
            await waitForUiPaint();
            const serialized = [await serializeLongBodyFrame(framesToSave[0])];
            setLongBodyProgress('正在替换身体贴图...', 82);
            await waitForUiPaint();
            if (state.previewSnapshot) applySkinSnapshot(state.previewSnapshot, { preserveNonTextureSettings: true });

            // 预览期间会临时把 NoteBodyStyle 设为 1；历史快照必须记录进入编辑器前的原值，
            // 否则撤销“一键投皮”时会把临时值一起保留下来。
            restoreNoteBodyStyle();
            recordUndoForApply(applyingAll ? '一键投皮（全部轨道）' : '一键投皮（当前轨道）');
            setNoteBodyStyleOne(false, applyingAll);
            const applyLabel = applyingAll ? '正在应用到全部轨道...' : '正在应用到当前轨道...';
            setLongBodyProgress(applyLabel, 82);
            await waitForUiPaint();
            const longBodySettings = {
                targetHeight: state.longBodyComposer.targetHeight,
                coverage: state.longBodyComposer.coverage,
                fade: state.longBodyComposer.fade,
                tailPreset: state.longBodyComposer.tailPreset,
                presetHeight: state.longBodyComposer.presetHeight,
                rgbAdjustment: cloneRgbAdjustment(state.rgbAdjustment)
            };
            const longBodyApplyPlans = createLongBodyApplyPlans(longBodyTargetColumns);
            const bodyApplied = await applyLongBodyToTracks(
                serialized[0],
                longBodyApplyPlans,
                longBodySettings,
                (value) => setLongBodyProgress(applyLabel, value)
            );
            if (!bodyApplied) throw new Error('完整长条身体未能写入目标轨道');
            const tailLabel = applyingAll ? '正在写入全轨透明尾部...' : '正在写入透明尾部...';
            setLongBodyProgress(tailLabel, 92);
            await waitForUiPaint();
            const tailsApplied = await applyTransparentTailsToTracks(
                longBodyTargetColumns,
                (value) => setLongBodyProgress(tailLabel, value)
            );
            if (!tailsApplied) throw new Error('透明长条尾部未能写入目标轨道');

            setNoteBodyStyleOne(false, applyingAll);
            persistLongBodyComposerSessions(
                longBodyApplyPlans,
                longBodySettings,
                applyingAll ? 'all' : 'current'
            );
            setLongBodyProgress('正在完成...', 100);
            await waitForUiPaint();
            showToast(
                '一键投皮应用成功',
                applyingAll ? `已应用到全部 ${getActiveKeyCount()} 条轨道。` : '已应用到当前轨道。'
            );
            return completeSavedTab(options);
        }

        async function applySelectedTexture(options = {}) {
            const applyTab = getActiveTab();
            if (!state.selected) {
                showToast('尚未选择贴图', '请先点击“选择贴图”。');
                return false;
            }
            const longBodyApplyScope = state.longBodyComposer.active
                ? ((options && (options.longBodyScope || options.scope)) || await requestLongBodyApplyScope())
                : null;
            if (state.longBodyComposer.active && !longBodyApplyScope) return false;
            const effParam = (typeof getEffectiveParamForTarget === 'function')
                ? getEffectiveParamForTarget(state.selected)
                : (state.selected && state.selected.p);
            const editingKeyImage = !state.longBodyComposer.active &&
                effParam &&
                isEditingKeyImageParam(effParam);
            const keyImageApplyScope = editingKeyImage
                ? (options.keyImageScope === 'all' ? 'all' : 'current')
                : null;
            const syncKeyImagePair = editingKeyImage
                ? options.syncKeyImagePair !== false
                : false;
            const selectedKeyImageKind = editingKeyImage
                ? getKeyImageParamKind(effParam)
                : null;
            const longBodyTargetColumns = longBodyApplyScope === 'all'
                ? Array.from({ length: getActiveKeyCount() }, (_, column) => column)
                : [getSelectedTrackIndex()].filter((column) => column != null);
            const applyingAll = longBodyApplyScope === 'all';

            const applyBtn = byId('textureImageApplyBtn');
            const applyMenuBtn = byId('textureImageApplyMenuBtn');
            closeTextureImageSaveMenu();
            if (applyBtn) {
                applyBtn.disabled = true;
                applyBtn.textContent = '正在应用...';
            }
            if (applyMenuBtn) applyMenuBtn.disabled = true;

            let recordedUndoSnapshot = null;
            let savedRedoStack = null;
            const recordUndoForApply = (desc) => {
                if (typeof recordSkinUndoBeforeChange !== 'function') return;
                const prevTop = (typeof undoStack !== 'undefined' && undoStack.length > 0)
                    ? undoStack[undoStack.length - 1]
                    : null;
                const redoBefore = (typeof redoStack !== 'undefined') ? redoStack.slice() : null;
                recordSkinUndoBeforeChange(desc, { force: true });
                if (typeof undoStack !== 'undefined' && undoStack.length > 0) {
                    const nextTop = undoStack[undoStack.length - 1];
                    if (nextTop && nextTop !== prevTop) {
                        recordedUndoSnapshot = nextTop;
                        savedRedoStack = redoBefore;
                    }
                }
            };

            try {
                if (editingKeyImage && !state.longBodyComposer.active) {
                    return await applyKeyImageTextureEditPipeline(options, {
                        effParam,
                        keyImageApplyScope,
                        syncKeyImagePair,
                        selectedKeyImageKind,
                        recordUndoForApply
                    });
                }
                if (state.longBodyComposer.active) {
                    return await applyLongBodyComposerEditPipeline(options, {
                        longBodyTargetColumns,
                        applyingAll,
                        recordUndoForApply
                    });
                }
                return await applyStandardTextureEditPipeline(options, {
                    recordUndoForApply
                });
            } catch (err) {
                console.error('贴图编辑应用失败', err);
                showToast('贴图编辑失败', err.message || '未知错误');
                if (recordedUndoSnapshot && typeof rollbackLastRecordedSkinUndo === 'function') {
                    rollbackLastRecordedSkinUndo(recordedUndoSnapshot, savedRedoStack);
                }
                if (state.longBodyComposer.active) restoreNoteBodyStyle();
                if (state.selected && state.previewFrames.length > 0) {
                    installFramesToStores(state.previewFrames, state.selected, { persist: false });
                }
                return false;
            } finally {
                hideLongBodyProgress();
                if (applyBtn && (!state.selected || getActiveTab() !== applyTab)) {
                    applyBtn.disabled = true;
                }
                updateSelectionSummary();
            }
        }

        function resetCurrentTexture() {
            if (!state.selected) return;
            if (state.longBodyComposer.active) {
                const key = getLongBodySessionKey();
                if (key) longBodyComposerSessions.delete(key);
                disableLongBodyComposer();
                resetRgbAdjustmentInputs();
                refreshLivePreview();
                showToast('已重置', '一键投皮已关闭，长条身体已恢复为进入编辑器前的状态。');
                return;
            }
            commitEditorHistory();
            beginEditorHistory('重置当前贴图', { group: 'reset-texture' });
            state.keyImageEditRecipe = null;
            state.workingFrames = state.originalFrames.map(cloneFrame);
            state.previewFrames = state.workingFrames.map(cloneFrame);
            resetTransformInputs();
            resetRgbAdjustmentInputs();
            state.previewFrames = buildPreviewFrames();
            installFramesToStores(state.previewFrames, state.selected, { persist: false });
            updateMeta();
            commitEditorHistory();
            showToast('已重置', '当前贴图已恢复为打开编辑器时的状态。');
        }
