// ============================================================================
// texture-image-editor-recipes.js - 贴图编辑配方与外部帧同步
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function cloneKeyImageEditSources(sources) {
            const cloned = {};
            for (const [key, source] of Object.entries(sources || {})) {
                cloned[key] = {
                    reference: source && source.reference,
                    frames: ((source && source.frames) || []).map(cloneFrame)
                };
            }
            return cloned;
        }

        function getTextureEditRecipeKey(target) {
            if (!target) return null;
            if (target.kind === 'library' && target.libraryPath) {
                return `library|${normalizeSkinKey(target.libraryPath)}`;
            }
            if (!target.p || !target.p.key) return null;
            return `${getActiveKeyCount()}|${target.p.key}`;
        }

        function removeTextureEditRecipe(targetOrTab) {
            const target = targetOrTab && targetOrTab.kind === 'texture'
                ? targetOrTab.target
                : targetOrTab;
            const key = getTextureEditRecipeKey(target);
            if (!key) return false;
            return textureEditRecipes.delete(key);
        }

        function renameTextureLibraryEditRecipe(oldPath, newPath) {
            if (!oldPath || !newPath) return false;
            const oldKey = `library|${normalizeSkinKey(oldPath)}`;
            const recipe = textureEditRecipes.get(oldKey);
            if (!recipe) return false;
            textureEditRecipes.delete(oldKey);
            recipe.originalReference = normalizeSkinKey(newPath);
            textureEditRecipes.set(`library|${normalizeSkinKey(newPath)}`, recipe);
            return true;
        }

        function textureEditRecipeOutputMatches(recipe, target) {
            if (!recipe || !target || !Array.isArray(recipe.outputFrames)) return false;
            const currentFrames = target.frames || [];
            if (recipe.outputFrames.length !== currentFrames.length) return false;
            return recipe.outputFrames.every((frame, index) => {
                const current = currentFrames[index];
                if (!frame || !current) return false;
                if (frame === current) return true;
                return frame.width === current.width && frame.height === current.height;
            });
        }

        function getStoredTextureEditRecipe(target) {
            const key = getTextureEditRecipeKey(target);
            if (!key) return null;
            const recipe = textureEditRecipes.get(key);
            if (!recipe) return null;
            if (!textureEditRecipeOutputMatches(recipe, target)) {
                textureEditRecipes.delete(key);
                return null;
            }
            return recipe;
        }

        function captureTextureEditRecipe(editorState, outputTarget) {
            if (!editorState || !editorState.selected ||
                editorState.longBodyComposer.active ||
                editorState.originalFrames.length === 0 ||
                !editorState.cropRect ||
                !outputTarget || !outputTarget.frames || outputTarget.frames.length === 0) {
                return null;
            }
            const baseFrame = editorState.originalFrames[0];
            if (!baseFrame || baseFrame._isBlankPlaceholder) return null;
            const cropRect = editorState.cropRect;
            return {
                sourceFrames: editorState.originalFrames.map(cloneFrame),
                originalReference: editorState.originalReference,
                keyImageOriginalSources: cloneKeyImageEditSources(
                    editorState.keyImageOriginalSources
                ),
                params: {
                    left: -Number(cropRect.x || 0),
                    right: Number(cropRect.x || 0) + Number(cropRect.width || 0) - Number(baseFrame.width || 0),
                    top: -Number(cropRect.y || 0),
                    bottom: Number(cropRect.y || 0) + Number(cropRect.height || 0) - Number(baseFrame.height || 0),
                    cropLeft: -Number(cropRect.x || 0),
                    cropRight: Number(cropRect.x || 0) + Number(cropRect.width || 0) - Number(baseFrame.width || 0),
                    cropTop: -Number(cropRect.y || 0),
                    cropBottom: Number(cropRect.y || 0) + Number(cropRect.height || 0) - Number(baseFrame.height || 0),
                    cropX: -Number(cropRect.x || 0),
                    cropY: -Number(cropRect.y || 0),
                    widthDelta: Number(cropRect.width || 0) - Number(baseFrame.width || 0),
                    heightDelta: Number(cropRect.height || 0) - Number(baseFrame.height || 0),
                    imageTransform: cloneImageTransform(editorState.imageTransform),
                    rgbAdjustment: cloneRgbAdjustment(editorState.rgbAdjustment)
                },
                outputFrames: outputTarget.frames.slice()
            };
        }

        function rememberTextureEditRecipe(tab) {
            if (!tab || tab.kind !== 'texture') return false;
            const recipe = captureTextureEditRecipe(tab.state, tab.target);
            if (!recipe) {
                removeTextureEditRecipe(tab);
                return false;
            }
            textureEditRecipes.set(getTextureEditRecipeKey(tab.target), recipe);
            return true;
        }

        function rememberPreparedKeyImageEditRecipes(prepared, params) {
            if (!prepared || prepared.length === 0 || !params) return false;
            const originalSources = cloneKeyImageEditSources(state.keyImageOriginalSources);
            for (const item of prepared) {
                if (!item || !item.group || !item.group.entries) continue;
                for (const entry of item.group.entries) {
                    originalSources[entry.p.key] = {
                        reference: item.group.reference,
                        frames: item.group.sourceFrames.map(cloneFrame)
                    };
                }
            }

            for (const item of prepared) {
                if (!item || !item.group || !item.group.entries) continue;
                for (const entry of item.group.entries) {
                    const target = buildEditorTarget(entry.p);
                    if (!target || !target.frames || target.frames.length === 0) continue;
                    textureEditRecipes.set(getTextureEditRecipeKey(target), {
                        sourceFrames: item.group.sourceFrames.map(cloneFrame),
                        originalReference: item.group.reference,
                        keyImageOriginalSources: cloneKeyImageEditSources(originalSources),
                        params: {
                            ...params,
                            imageTransform: cloneImageTransform(params.imageTransform),
                            rgbAdjustment: cloneRgbAdjustment(
                                item.group.rgbAdjustment != null
                                    ? item.group.rgbAdjustment
                                    : params.rgbAdjustment
                            )
                        },
                        outputFrames: target.frames.slice()
                    });
                }
            }
            return true;
        }

        function applyStoredTextureEditRecipe(editorState, recipe) {
            if (!editorState || !recipe || !recipe.params ||
                editorState.workingFrames.length === 0) {
                return false;
            }
            try {
                const result = buildEditedFrames(editorState.workingFrames, recipe.params);
                if (!result || result.frames.length === 0) return false;
                editorState.cropRect = { ...result.cropRect };
                editorState.imageTransform = cloneImageTransform(
                    recipe.params.imageTransform
                );
                editorState.rgbAdjustment = cloneRgbAdjustment(
                    recipe.params.rgbAdjustment
                );
                editorState.previewFrames = result.frames.map((frame) =>
                    applyRgbAdjustmentToCanvas(cloneFrame(frame), editorState.rgbAdjustment)
                );
                updateCropInputs(editorState.cropRect);
                updateImageTransformInputs();
                updateRgbAdjustmentInputs();
                return true;
            } catch (err) {
                console.warn('恢复贴图编辑参数失败:', err);
                return false;
            }
        }

        function invalidateKeyImageEditRecipe() {
            if (state.keyImageEditRecipe) state.keyImageEditRecipe = null;
        }

        function applyExternalFramesToTab(tab, frames, target) {
            if (!tab || tab.kind !== 'texture' || !frames || frames.length === 0) return false;
            const keyImageEditRecipe = tab.state.keyImageEditRecipe ||
                captureTextureEditRecipe(tab.state, tab.target);
            const copied = frames.map(cloneFrame);
            removeTextureEditRecipe(tab);
            tab.target = {
                ...tab.target,
                frames: copied,
                selectable: true,
                state: 'set'
            };
            clearEditorStateTimers(tab.state);
            tab.state.selected = tab.target;
            tab.state.originalReference = normalizeSkinKey(
                (tab.target.resolved && tab.target.resolved.name) ||
                tab.target.base ||
                tab.target.p.key
            );
            tab.state.keyImageOriginalSources = cloneKeyImageEditSources(
                keyImageEditRecipe && keyImageEditRecipe.keyImageOriginalSources
            );
            const sourceFrames = (target && target.sourceFrames && target.sourceFrames.length > 0)
                ? target.sourceFrames.map(cloneFrame)
                : copied.map(cloneFrame);
            tab.state.originalFrames = sourceFrames.map(cloneFrame);
            tab.state.workingFrames = sourceFrames.map(cloneFrame);
            tab.state.previewFrames = copied.map(cloneFrame);
            if (target && target.currentParams) {
                const params = target.currentParams;
                const left = Number(params.left) || 0;
                const right = Number(params.right) || 0;
                const top = Number(params.top) || 0;
                const bottom = Number(params.bottom) || 0;
                const baseW = sourceFrames[0].width;
                const baseH = sourceFrames[0].height;
                tab.state.imageTransform = cloneImageTransform(
                    params.imageTransform || tab.state.imageTransform
                );
                tab.state.cropRect = {
                    x: -left,
                    y: -top,
                    width: baseW + left + right,
                    height: baseH + top + bottom
                };
                if (typeof updateCropInputs === 'function') {
                    updateCropInputs(tab.state.cropRect);
                }
            } else {
                tab.state.cropRect = {
                    x: 0,
                    y: 0,
                    width: copied[0].width,
                    height: copied[0].height
                };
                tab.state.imageTransform = createDefaultImageTransform();
            }
            tab.state.previewBaseViewport = null;
            tab.state.previewViewport = null;
            tab.state.snapGuides = null;
            tab.state.contentBoundsCache = null;
            tab.state.editorUndoStack = [];
            tab.state.editorRedoStack = [];
            tab.state.editorHistoryTransaction = null;
            tab.state.keyImageEditRecipe = keyImageEditRecipe;
            return true;
        }

        function applyKeyImageHeightCropInputOverride(tab, target) {
            const params = target && target.currentParams;
            if (!params || !Number.isFinite(Number(params.keyImageHeightOffset1x))) return false;
            const bottomInput = byId('textureImageCropBottom');
            if (!bottomInput) return false;
            const value = String(Math.round(Number(params.keyImageHeightOffset1x)));
            bottomInput.value = value;
            if (tab.state.cropInputSnapshot && tab.state.cropInputSnapshot.values) {
                tab.state.cropInputSnapshot.values.bottom = Number(value);
            }
            return true;
        }

        function syncExternalFrames(target, frames) {
            const modal = byId('textureImageEditorModal');
            if (!modal || !modal.classList.contains('active') || !target || !frames || frames.length === 0) {
                return false;
            }
            const copiedFrames = frames.map(cloneFrame);
            const update = {
                target: {
                    ...target,
                    paramKeys: (target.paramKeys || []).slice(),
                    frames: copiedFrames
                },
                frames: copiedFrames
            };
            for (const paramKey of update.target.paramKeys) {
                externalFrameUpdates.set(paramKey, update);
            }
            externalChangesPending = true;

            for (const tab of getTextureTabs()) {
                if (!update.target.paramKeys.includes(tab.target.p.key)) continue;
                applyExternalFramesToTab(tab, copiedFrames, target);
                if (tab.id === activeTabId) {
                    syncActiveTabView({ installPreview: false });
                    applyKeyImageHeightCropInputOverride(tab, target);
                }
            }
            const pickerView = byId('textureImagePickerView');
            if (pickerView && getComputedStyle(pickerView).display !== 'none') {
                renderPicker();
            }
            return true;
        }

        function installExternalUpdateFrames(update) {
            if (!update || !update.target || !update.frames || update.frames.length === 0) return false;
            const primaryKey = (update.target.paramKeys && update.target.paramKeys[0]) ||
                (update.target.p && update.target.p.key);
            const p = primaryKey ? getTextureTabParams().find((item) => item.key === primaryKey) : null;
            const selected = {
                ...(p ? buildEditorTarget(p) : {}),
                ...update.target,
                base: update.target.base || (update.target.resolved && update.target.resolved.name) || (p && p.default) || 'texture',
                storeKey: update.target.storeKey || normalizeSkinKey(update.target.base)
            };
            installFramesToStores(update.frames, selected, {
                persist: false,
                draw: false
            });
            return true;
        }

        function syncTextureEditorSnapshotsWithCurrentManiaConfigs() {
            if (!editorBaseSnapshot && tabs.every((t) => !t.state || !t.state.previewSnapshot)) {
                return;
            }
            const currentConfigs = maniaSkinConfigurations;
            if (!currentConfigs || currentConfigs.size === 0) return;

            function updateSnapshotConfigs(snap) {
                if (!snap || !snap.maniaSkinConfigurations) return;
                for (const [k, currentCfg] of currentConfigs.entries()) {
                    let snapCfg = snap.maniaSkinConfigurations.get(k);
                    if (!snapCfg) {
                        snapCfg = cloneManiaSkinConfig(currentCfg);
                        snap.maniaSkinConfigurations.set(k, snapCfg);
                    } else if (typeof copyNonTextureManiaProperties === 'function') {
                        copyNonTextureManiaProperties(currentCfg, snapCfg);
                    }
                }
            }

            if (editorBaseSnapshot) {
                updateSnapshotConfigs(editorBaseSnapshot);
            }
            for (const tab of tabs) {
                if (tab.state && tab.state.previewSnapshot) {
                    updateSnapshotConfigs(tab.state.previewSnapshot);
                }
                if (tab.kind === 'creator' && tab.creatorState && tab.creatorState.previewSnapshot) {
                    updateSnapshotConfigs(tab.creatorState.previewSnapshot);
                }
            }
        }

        function absorbExternalChanges() {
            if (!externalChangesPending || !editorBaseSnapshot) return false;
            const activeTab = getActiveTab();
            const preservedRecipes = new Map();
            for (const update of externalFrameUpdates.values()) {
                for (const paramKey of (update.target && update.target.paramKeys) || []) {
                    const recipeKey = `${getActiveKeyCount()}|${paramKey}`;
                    if (textureEditRecipes.has(recipeKey)) {
                        preservedRecipes.set(recipeKey, textureEditRecipes.get(recipeKey));
                    }
                }
            }
            if (activeTab && activeTab.kind === 'texture' && activeTab.state.previewSnapshot) {
                applySkinSnapshot(activeTab.state.previewSnapshot, { preserveNonTextureSettings: true });
            }

            const persistedTextures = new Map(userReplacedTextures);
            const appliedUpdates = new Set();
            for (const update of externalFrameUpdates.values()) {
                const identity = update.target.storeKey || update.target.base || update.target.paramKeys.join('|');
                if (appliedUpdates.has(identity)) continue;
                appliedUpdates.add(identity);
                installExternalUpdateFrames(update);
            }
            for (const [recipeKey, recipe] of preservedRecipes.entries()) {
                textureEditRecipes.set(recipeKey, recipe);
            }
            for (const [name, buffer] of persistedTextures.entries()) {
                const normalized = normalizeSkinKey(name);
                if (Array.from(appliedUpdates).some((identity) => normalized.startsWith(identity))) {
                    userReplacedTextures.set(name, buffer);
                }
            }

            editorBaseSnapshot = createSkinSnapshot('贴图编辑外部变更');
            for (const tab of getTextureTabs()) {
                tab.state.previewSnapshot = editorBaseSnapshot;
            }
            drawFrame();
            externalFrameUpdates.clear();
            externalChangesPending = false;
            return true;
        }

        function removeTab(tabId, options = {}) {
            const index = tabs.findIndex((tab) => tab.id === tabId);
            if (index < 0) return false;
            const tab = tabs[index];
            if (tab.kind === 'menu') return false;

            absorbExternalChanges();
            const wasActive = tab.id === activeTabId;
            if (tab.state) {
                clearEditorStateTimers(tab.state);
                if (wasActive && options.restorePreview !== false && tab.state.previewSnapshot) {
                    applySkinSnapshot(tab.state.previewSnapshot, { preserveNonTextureSettings: true });
                }
            }
            if (tab.kind === 'creator' &&
                tab.creatorState &&
                wasActive &&
                options.restorePreview !== false &&
                tab.creatorState.previewSnapshot) {
                applySkinSnapshot(tab.creatorState.previewSnapshot, { preserveNonTextureSettings: true });
                drawFrame();
            }
            tabs.splice(index, 1);
            if (!wasActive) {
                renderTabs();
                return true;
            }

            if (tab.kind === 'creator') {
                const nextCreatorTab = tabs.slice(index).find((item) => item.kind === 'creator') ||
                    tabs.slice(0, index).reverse().find((item) => item.kind === 'creator') ||
                    null;
                if (nextCreatorTab) {
                    activeTabId = '';
                    return activateTab(nextCreatorTab.id, { force: true });
                }
                activeTabId = '';
                const fallbackTabId = (tab.previousTabId && tabs.some((item) => item.id === tab.previousTabId))
                    ? tab.previousTabId
                    : (tabs.some((t) => t.id === 'texture-library') ? 'texture-library' : 'menu');
                if (typeof resetTextureCreatorState === 'function') {
                    resetTextureCreatorState();
                }
                return activateTab(fallbackTabId, { force: true });
            }

            const remainingTextureTabs = tabs.filter((t) => t.kind === 'texture');
            const nextIndex = Math.min(index, tabs.length - 1);
            const nextTab = remainingTextureTabs.length > 0 ? (tabs[Math.max(0, nextIndex)] || menuTab) : menuTab;
            activeTabId = '';
            return activateTab(nextTab.id, { force: true });
        }

        function finalizeEditorClose(options = {}) {
            for (const tab of tabs) {
                if (tab.kind === 'texture') clearEditorStateTimers(tab.state);
            }
            absorbExternalChanges();
            if (editorBaseSnapshot && options.restoreSnapshot !== false) {
                applySkinSnapshot(editorBaseSnapshot, { preserveNonTextureSettings: true });
            }

            Object.assign(menuState, createEditorState());
            menuState.previewSnapshot = null;
            state = menuState;
            tabs = [menuTab, libraryTab];
            activeTabId = menuTab.id;
            editorBaseSnapshot = null;
            externalFrameUpdates.clear();
            externalChangesPending = false;

            const modal = byId('textureImageEditorModal');
            if (modal) {
                modal.classList.remove('active');
                modal.style.display = 'none';
            }
            if (typeof activeFloatingWindow !== 'undefined' && activeFloatingWindow === 'texture-editor') {
                const skinModal = document.getElementById('skinEditorModal');
                if (skinModal && skinModal.classList.contains('active')) {
                    if (typeof bringFloatingWindowToFront === 'function') {
                        bringFloatingWindowToFront('skin-editor');
                    }
                } else {
                    activeFloatingWindow = null;
                }
            }
            renderTabs();
            setViews(true);
            updateSelectionSummary();
            updateEditorHistoryButtons();
            updateStretchFixUI();
        }
