// ============================================================================
// texture-image-editor-save-close.js - 贴图保存、重置与编辑器关闭流程
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function refreshSavedTabTarget(savedTab) {
            if (!savedTab || savedTab.kind !== 'texture' || !savedTab.target) {
                return;
            }
            if (savedTab.target.kind === 'library') {
                const path = savedTab.target.libraryPath || savedTab.target.base;
                const source = collectExistingTextureSources().find((item) =>
                    normalizeSkinKey(item.path) === normalizeSkinKey(path)
                );
                if (!source) return;
                const target = buildTextureLibraryEditorTarget(source, {
                    paramKey: savedTab.target.libraryParamKey
                });
                if (!target) return;
                savedTab.target = target;
                savedTab.title = target.p.zhName;
                if (getActiveTab() === savedTab) state.selected = target;
                return;
            }
            if (!savedTab.target.p) return;
            const p = getTextureTabParams().find((item) => item.key === savedTab.target.p.key);
            if (!p) return;
            const target = buildEditorTarget(p);
            if (!target || !target.selectable) return;
            savedTab.target = target;
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

        function collectTexturePathReferences(path) {
            const normalizedPath = normalizeTextureLookupPath(path);
            if (!normalizedPath) return [];
            const keys = getActiveKeyCount();
            const references = [];
            for (const p of getTextureTabParams()) {
                const resolved = resolveTextureParam(keys, p);
                if (!resolved || resolved.state !== 'ok') continue;
                if (normalizeTextureLookupPath(resolved.name) !== normalizedPath) continue;
                references.push(p);
            }
            return references;
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

        async function resolveTextureEditSavePlan(selected) {
            const sourcePath = getTextureEditSourcePath(selected);
            if (!sourcePath) {
                throw new Error('无法确定当前贴图路径');
            }
            const paramKey = getTextureEditParamKey(selected);
            const references = collectTexturePathReferences(sourcePath);
            const currentParam = paramKey
                ? getTextureTabParams().find((p) => p.key === paramKey)
                : null;
            const currentTrack = currentParam ? getParamTrackIndex(currentParam) : null;
            const otherReferences = currentTrack == null
                ? []
                : references.filter((p) => {
                    if (p.key === paramKey) return false;
                    const track = getParamTrackIndex(p);
                    if (track == null) return false;
                    if (track !== currentTrack) return true;
                    const currentKind = getKeyImageParamKind(currentParam);
                    const otherKind = getKeyImageParamKind(p);
                    return !(currentKind && otherKind && currentKind !== otherKind);
                });
            if (otherReferences.length === 0) {
                return {
                    sourcePath,
                    savePath: sourcePath,
                    paramKey,
                    mode: 'overwrite',
                    otherReferences
                };
            }
            const decision = await requestLongBodyApplyScope({
                title: '贴图被多处引用',
                text: `“${sourcePath}”还被其他 ${otherReferences.length} 个轨道引用。是否同步替换所有引用？选择“同步替换”将直接覆盖原图；选择“独立创建”将为当前轨道独立创建贴图。`,
                currentLabel: '独立创建',
                allLabel: '同步替换'
            });
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

        async function applySelectedTexture(options = {}) {
            const applyTab = getActiveTab();
            if (!state.selected) {
                showToast('尚未选择贴图', '请先点击“选择贴图”。');
                return false;
            }
            const longBodyApplyScope = state.longBodyComposer.active
                ? await requestLongBodyApplyScope()
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

            try {
                const committingLongBodyComposer = state.longBodyComposer.active;
                if (editingKeyImage && !committingLongBodyComposer) {
                    const groups = collectKeyImageEditGroups(keyImageApplyScope, {
                        syncPair: syncKeyImagePair,
                        selectedKind: selectedKeyImageKind
                    });
                    if (groups.length === 0) {
                        throw new Error('没有找到可应用的 KeyImage 源贴图');
                    }
                    const params = {
                        ...(state.keyImageEditRecipe && state.keyImageEditRecipe.params
                            ? {
                            ...state.keyImageEditRecipe.params,
                            imageTransform: cloneImageTransform(
                                state.keyImageEditRecipe.params.imageTransform
                            )
                            }
                            : getCurrentEditParams()),
                        rgbAdjustment: cloneRgbAdjustment(state.rgbAdjustment)
                    };

                    let keyImageMode = 'overwrite';
                    if (keyImageApplyScope !== 'all') {
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
                            const decision = await requestLongBodyApplyScope({
                                title: '贴图被多处引用',
                                text: `“${primarySource}”还被其他 ${otherReferences.length} 个轨道引用。是否同步替换所有引用？选择“同步替换”将直接覆盖原图；选择“独立创建”将为当前轨道独立创建贴图。`,
                                currentLabel: '独立创建',
                                allLabel: '同步替换'
                            });
                            if (!decision) return false;
                            keyImageMode = (decision === 'all') ? 'overwrite' : 'independent';
                        }
                    }

                    if (state.previewSnapshot) applySkinSnapshot(state.previewSnapshot, { preserveNonTextureSettings: true });
                    const stateLabel = syncKeyImagePair
                        ? 'KeyImage + KeyImageD'
                        : (selectedKeyImageKind === 'down' ? 'KeyImageD' : 'KeyImage');
                    const scopeLabel = keyImageApplyScope === 'all' ? '全部轨道' : '当前轨道';
                    recordSkinUndoBeforeChange(
                        `贴图编辑: ${stateLabel}（${scopeLabel}）`,
                        { force: true }
                    );
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
                    const trackCount = prepared.reduce(
                        (count, item) => count + item.group.entries.length,
                        0
                    );
                    showToast(
                        '贴图编辑成功',
                        keyImageMode === 'independent'
                            ? `已更新${scopeLabel}的 ${stateLabel}，已为当前轨道创建独立贴图。`
                            : `已更新${scopeLabel}的 ${stateLabel}，已直接覆盖原图。`
                    );
                    return completeSavedTab(options);
                }
                let framesToSave;
                if (committingLongBodyComposer) {
                    setLongBodyProgress('正在生成完整长条...', 0);
                    await waitForUiPaint();
                    framesToSave = [await buildLongBodyCompositeAsync(
                        state.longBodyComposer.targetHeight,
                        (value) => setLongBodyProgress('正在生成完整长条...', value)
                    )];
                } else {
                    framesToSave = buildPreviewFrames();
                }
                if (!framesToSave || framesToSave.length === 0 || !framesToSave[0]) {
                    throw new Error('无法生成要保存的贴图');
                }
                if (!committingLongBodyComposer) state.previewFrames = framesToSave;
                const savePlan = committingLongBodyComposer
                    ? null
                    : await resolveTextureEditSavePlan(state.selected);
                if (!committingLongBodyComposer && !savePlan) return false;
                if (committingLongBodyComposer) {
                    setLongBodyProgress('正在编码 PNG...', 65, true);
                    await waitForUiPaint();
                }
                const serialized = committingLongBodyComposer
                    ? [await serializeLongBodyFrame(framesToSave[0])]
                    : await serializeFrames(savePlan.savePath, framesToSave);
                if (committingLongBodyComposer) {
                    setLongBodyProgress('正在替换身体贴图...', 82);
                    await waitForUiPaint();
                }
                if (state.previewSnapshot) applySkinSnapshot(state.previewSnapshot, { preserveNonTextureSettings: true });

                if (!committingLongBodyComposer) {
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
                    if (typeof recordSkinUndoBeforeChange === 'function') {
                        const targetZh = (state.selected && state.selected.p && state.selected.p.zhName) || savePlan.savePath;
                        const modeZh = savePlan.mode === 'independent' ? '独立创建' : '同步替换';
                        recordSkinUndoBeforeChange(
                            `贴图编辑: ${targetZh}（${modeZh}）`,
                            { force: true }
                        );
                    }
                    persistTextureFramesAtPath(serialized, savePlan.savePath, {
                        refresh: false,
                        showToast: false
                    });
                    if (savePlan.mode === 'independent') {
                        if (editingCreatedTexture) {
                            cloneCreatedTextureParams(
                                savePlan.sourcePath,
                                savePlan.savePath
                            );
                        }
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
                    if (editingCreatedTexture) {
                        if (typeof saveCreatedTextureGeneralEditParams === 'function') {
                            saveCreatedTextureGeneralEditParams(savePlan.savePath, {
                                ...getCurrentEditParams(),
                                imageTransform: cloneImageTransform(state.imageTransform),
                                rgbAdjustment: cloneRgbAdjustment(state.rgbAdjustment)
                            });
                        }
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

                let longBodyApplyPlans = null;
                let longBodySettings = null;
                if (committingLongBodyComposer) {
                    // 预览期间会临时把 NoteBodyStyle 设为 1；历史快照必须记录进入编辑器前的原值，
                    // 否则撤销“一键投皮”时会把临时值一起保留下来。
                    restoreNoteBodyStyle();
                    recordSkinUndoBeforeChange(
                        applyingAll ? '一键投皮（全部轨道）' : '一键投皮（当前轨道）',
                        { force: true }
                    );
                    setNoteBodyStyleOne(false, applyingAll);
                    const applyLabel = applyingAll ? '正在应用到全部轨道...' : '正在应用到当前轨道...';
                    setLongBodyProgress(applyLabel, 82);
                    await waitForUiPaint();
                    longBodySettings = {
                        targetHeight: state.longBodyComposer.targetHeight,
                        coverage: state.longBodyComposer.coverage,
                        fade: state.longBodyComposer.fade,
                        tailPreset: state.longBodyComposer.tailPreset,
                        presetHeight: state.longBodyComposer.presetHeight,
                        rgbAdjustment: cloneRgbAdjustment(state.rgbAdjustment)
                    };
                    longBodyApplyPlans = createLongBodyApplyPlans(longBodyTargetColumns);
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
                }
                if (committingLongBodyComposer) {
                    setNoteBodyStyleOne(false, applyingAll);
                    persistLongBodyComposerSessions(longBodyApplyPlans, longBodySettings);
                    setLongBodyProgress('正在完成...', 100);
                    await waitForUiPaint();
                    showToast(
                        '一键投皮应用成功',
                        applyingAll ? `已应用到全部 ${getActiveKeyCount()} 条轨道。` : '已应用到当前轨道。'
                    );
                }
                return completeSavedTab(options);
            } catch (err) {
                console.error('贴图编辑应用失败', err);
                showToast('贴图编辑失败', err.message || '未知错误');
                if (state.longBodyComposer.active) setNoteBodyStyleOne(false, false);
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

        function refreshTextureImageEditorAfterSkinImport() {
            const modal = byId('textureImageEditorModal');
            if (!modal || !modal.classList.contains('active')) return false;

            const activeTab = getActiveTab();
            const previousKind = activeTab ? activeTab.kind : 'menu';
            const previousParamKey = activeTab && activeTab.kind === 'texture' && activeTab.target && activeTab.target.p
                ? activeTab.target.p.key
                : null;

            for (const tab of tabs) {
                if (tab.state) clearEditorStateTimers(tab.state);
            }
            if (!hasActiveTextureProjectImport()) {
                longBodyComposerSessions.clear();
                textureEditRecipes.clear();
            }
            externalFrameUpdates.clear();
            externalChangesPending = false;

            Object.assign(menuState, createEditorState());
            state = menuState;
            tabs = [menuTab, libraryTab];
            activeTabId = menuTab.id;
            nextTextureTabId = 1;
            resetTextureCreatorState();

            editorBaseSnapshot = isSkinEditingWorkspaceReady()
                ? createSkinSnapshot('贴图编辑基线')
                : null;
            menuState.previewSnapshot = editorBaseSnapshot;
            renderTabs();
            renderPicker();
            if (textureLibraryUi) textureLibraryUi.refresh();

            if (editorBaseSnapshot && previousKind === 'texture' && previousParamKey) {
                const param = getTextureTabParams().find((item) => item.key === previousParamKey);
                const target = param ? buildEditorTarget(param) : null;
                if (target && target.selectable) {
                    selectTarget(target);
                    return true;
                }
            }

            if (editorBaseSnapshot && previousKind === 'library') {
                activateTab('texture-library', { force: true });
                return true;
            }

            setViews(true);
            updateSelectionSummary();
            updateEditorHistoryButtons();
            updateStretchFixUI();
            return true;
        }

        function open() {
            const modal = byId('textureImageEditorModal');
            if (!modal) return false;
            const skinEditingReady = syncSkinEditingAvailabilityUI();
            if (modal.classList.contains('active')) {
                if (typeof bringFloatingWindowToFront === 'function') {
                    bringFloatingWindowToFront('texture-editor');
                }
                return true;
            }
            Object.assign(menuState, createEditorState());
            state = menuState;
            tabs = [menuTab, libraryTab];
            activeTabId = menuTab.id;
            nextTextureTabId = 1;
            externalFrameUpdates.clear();
            externalChangesPending = false;
            resetTextureCreatorState();
            renderTabs();
            updateSelectionSummary();
            updateEditorHistoryButtons();
            updateStretchFixUI();
            modal.classList.add('active');
            modal.style.display = 'block';
            if (typeof bringFloatingWindowToFront === 'function') {
                bringFloatingWindowToFront('texture-editor');
            }
            if (!skinEditingReady) return true;

            editorBaseSnapshot = createSkinSnapshot('贴图编辑基线');
            menuState.previewSnapshot = editorBaseSnapshot;
            renderPicker();
            setViews(true);
            return true;
        }

        async function closeTab(tabId) {
            const tab = getTabById(tabId);
            if (!tab || tab.kind === 'menu' || tab.kind === 'library') return false;
            if (activeTabId !== tab.id) activateTab(tab.id);
            commitActiveTabState();

            if (isTabDirty(tab)) {
                const decision = await requestUnsavedDecision({
                    title: getTabTitle(tab),
                    count: 1
                });
                if (decision === 'cancel') return false;
                if (decision === 'save') {
                    return applySelectedTexture({
                        closeTabAfterSave: true,
                        closeEditorWhenLast: true
                    });
                }
            }

            removeTab(tab.id, { restorePreview: true });
            return true;
        }

        function discardAndCloseEditor() {
            for (const tab of tabs) {
                if (tab.kind === 'texture') clearEditorStateTimers(tab.state);
            }
            finalizeEditorClose({ restoreSnapshot: true });
            return true;
        }

        async function close() {
            commitActiveTabState();
            const dirtyTabs = tabs.filter(isTabDirty);
            if (dirtyTabs.length === 0) {
                finalizeEditorClose({ restoreSnapshot: false });
                return true;
            }

            const decision = await requestUnsavedDecision({
                title: dirtyTabs[0] ? getTabTitle(dirtyTabs[0]) : '',
                count: dirtyTabs.length
            });
            if (decision === 'cancel') return false;
            if (decision === 'discard') {
                finalizeEditorClose({ restoreSnapshot: true });
                return true;
            }

            for (const dirtyTab of dirtyTabs) {
                const current = getTabById(dirtyTab.id);
                if (!current) continue;
                activateTab(current.id);
                const saved = await applySelectedTexture({
                    closeTabAfterSave: true,
                    closeEditorWhenLast: false
                });
                if (!saved) return false;
            }
            finalizeEditorClose({ restoreSnapshot: false });
            return true;
        }

        const getEl = typeof byId === 'function' ? byId : (id) => document.getElementById(id);
        const dialog = getEl('textureImageEditorDialog');
        const header = getEl('textureImageEditorHeader');
        const dockBtn = getEl('dockTextureImageEditorBtn');
        const collapseBtn = getEl('collapseTextureImageEditorBtn');

        if (dialog && header) {
            dialog.addEventListener('mousedown', () => {
                if (typeof bringFloatingWindowToFront === 'function') {
                    bringFloatingWindowToFront('texture-editor');
                }
            });

            let isDraggingWindow = false;
            let dragStartX = 0;
            let dragStartY = 0;
            let dialogStartLeft = 0;
            let dialogStartTop = 0;

            header.addEventListener('mousedown', (event) => {
                if (event.target.closest('button') || event.target.closest('input') || event.target.closest('select')) return;

                isDraggingWindow = true;
                dragStartX = event.clientX;
                dragStartY = event.clientY;

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
                    const nextLeft = Math.max(
                        -dialog.offsetWidth + 80,
                        Math.min(window.innerWidth - 80, dialogStartLeft + moveEvent.clientX - dragStartX)
                    );
                    const nextTop = Math.max(
                        0,
                        Math.min(window.innerHeight - 50, dialogStartTop + moveEvent.clientY - dragStartY)
                    );
                    dialog.style.left = `${nextLeft}px`;
                    dialog.style.top = `${nextTop}px`;
                };

                const onMouseUp = () => {
                    isDraggingWindow = false;
                    dialog.classList.remove('is-dragging');
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
                event.preventDefault();
            });

            header.addEventListener('dblclick', (event) => {
                if (event.target.closest('button')) return;
                if (collapseBtn) collapseBtn.click();
            });

            if (collapseBtn) {
                collapseBtn.onclick = () => {
                    const isCollapsed = dialog.classList.toggle('is-collapsed');
                    collapseBtn.textContent = isCollapsed ? '+' : '−';
                    collapseBtn.title = isCollapsed ? '展开窗口' : '折叠窗口';
                };
            }

            if (dockBtn) {
                dockBtn.onclick = () => {
                    dialog.style.left = 'auto';
                    dialog.style.top = '48px';
                    dialog.style.right = '24px';
                    dialog.style.bottom = 'auto';
                    dialog.style.width = '860px';
                    dialog.style.height = '84vh';
                    dialog.classList.remove('is-collapsed');
                    if (collapseBtn) {
                        collapseBtn.textContent = '−';
                        collapseBtn.title = '折叠/展开窗口';
                    }
                };
            }
        }
