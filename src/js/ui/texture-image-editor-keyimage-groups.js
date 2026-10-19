// ============================================================================
// texture-image-editor-keyimage-groups.js - KeyImage 编辑组收集与全轨分组持久化
// 由 texture-image-editor.js 按职责拆分；所有脚本共享既有经典脚本作用域。
// ============================================================================

        function getSelectedAliases(selected) {
            const p = selected.p;
            const aliases = new Set([p.key, selected.base]);
            const isPerTrack = p._trackCol != null ||
                /^(NoteImage|HoldNoteHeadImage|HoldNoteBodyImage|HoldNoteTailImage|KeyImageDown|KeyImage)\d+/i.test(p.key);
            if (isPerTrack) {
                for (const alias of getTextureParamAliases(p.key, selected.keys)) aliases.add(alias);
            }
            return { aliases, isPerTrack };
        }

        function getKeyImageParamKind(p) {
            if (!p) return null;
            if (p._trackLookup === LML.KeyImageDown || /^KeyImage(?:\d+)?(?:D|Down)$/i.test(p.key || '')) {
                return 'down';
            }
            if (p._trackLookup === LML.KeyImage || /^KeyImage(?:\d+)?$/i.test(p.key || '')) {
                return 'normal';
            }
            return null;
        }

        function isEditingKeyImageParam(p) {
            return getKeyImageParamKind(p) != null;
        }

        function collectKeyImageEditGroups(scope, options = {}) {
            const keys = getActiveKeyCount();
            const effParam = (typeof getEffectiveParamForTarget === 'function')
                ? getEffectiveParamForTarget(state.selected)
                : (state.selected && state.selected.p);
            let selectedCol = getSelectedTrackIndex();
            if (selectedCol == null && isEditingKeyImageParam(effParam)) {
                selectedCol = 0;
            }
            if (selectedCol == null) return [];
            const selectedKind = options.selectedKind || getKeyImageParamKind(effParam);
            const syncPair = options.syncPair !== false;
            const kinds = syncPair
                ? ['normal', 'down']
                : [selectedKind].filter(Boolean);
            if (kinds.length === 0) return [];
            const editRecipe = state.keyImageEditRecipe;
            const columns = scope === 'all'
                ? Array.from({ length: keys }, (_, column) => column)
                : [selectedCol];
            const params = getTextureTabParams();
            const findParam = (column, kind) => params.find((p) =>
                getParamTrackIndex(p) === column &&
                getKeyImageParamKind(p) === kind
            ) || null;
            const entries = [];

            for (const column of columns) {
                for (const kind of kinds) {
                    const p = findParam(column, kind);
                    if (!p) continue;
                    const target = buildEditorTarget(p);
                    if (!target) continue;
                    const isSelected = state.selected && (
                        (state.selected.p && state.selected.p.key === p.key) ||
                        (effParam && effParam.key === p.key)
                    );
                    const cachedSource = state.keyImageOriginalSources[p.key] ||
                        (isSelected && editRecipe
                            ? editRecipe.keyImageOriginalSources[p.key]
                            : null);
                    const storedRecipe = !isSelected
                        ? getStoredTextureEditRecipe(target)
                        : null;
                    const selectedRecipeFrames = isSelected && editRecipe
                        ? editRecipe.sourceFrames.map(cloneFrame)
                        : null;
                    let sourceFrames = selectedRecipeFrames ||
                        (cachedSource
                            ? cachedSource.frames.map(cloneFrame)
                            : (isSelected
                                ? state.workingFrames.map(cloneFrame)
                                : ((storedRecipe && storedRecipe.sourceFrames) ||
                                    target.frames).map(cloneFrame)));
                    if (!isSelected && !cachedSource && (!storedRecipe || !storedRecipe.sourceFrames || storedRecipe.sourceFrames.length === 0) &&
                        typeof hasCreatedTextureParams === 'function' &&
                        hasCreatedTextureParams(target.base) &&
                        typeof createSolidShapeTexture === 'function') {
                        const cParams = getCreatedTextureParams(target.base);
                        if (cParams) {
                            const gen = createSolidShapeTexture(cParams);
                            gen._is2x = cParams.spec === '2x';
                            gen._isRootLevel = !target.base.includes('/');
                            sourceFrames = [gen];
                        }
                    }
                    const explicitReference = isSelected && editRecipe && editRecipe.originalReference
                        ? editRecipe.originalReference
                        : (cachedSource
                        ? cachedSource.reference
                            : (storedRecipe && storedRecipe.originalReference) ||
                                (sourceFrames.length > 0
                                    ? (isSelected && state.originalReference
                                        ? state.originalReference
                                        : normalizeSkinKey(
                                            (target.resolved && target.resolved.name) ||
                                            target.base ||
                                            p.key
                                        ))
                                    : ''));
                    entries.push({
                        p,
                        target,
                        column,
                        kind,
                        isSelected,
                        sourceFrames,
                        rgbAdjustment: cloneRgbAdjustment(
                            isSelected
                                ? state.rgbAdjustment
                                : (storedRecipe && storedRecipe.params
                                    ? storedRecipe.params.rgbAdjustment
                                    : null)
                        ),
                        reference: explicitReference || `missing:${column}:${kind}`
                    });
                }
            }

            for (const entry of entries) {
                if (entry.sourceFrames.length === 0 ||
                    state.keyImageOriginalSources[entry.p.key]) {
                    continue;
                }
                state.keyImageOriginalSources[entry.p.key] = {
                    frames: entry.sourceFrames.map(cloneFrame),
                    reference: entry.reference
                };
            }

            const groups = new Map();
            for (const entry of entries) {
                if (entry.sourceFrames.length === 0) continue;
                const groupKey = `${entry.kind}|${entry.reference}`;
                const group = groups.get(groupKey) || {
                    reference: entry.reference,
                    kind: entry.kind,
                    sourceFrames: entry.sourceFrames,
                    rgbAdjustment: entry.rgbAdjustment,
                    entries: []
                };
                group.entries.push(entry);
                if (entry.isSelected) {
                    group.sourceFrames = entry.sourceFrames;
                    group.rgbAdjustment = entry.rgbAdjustment;
                }
                groups.set(groupKey, group);
            }
            return Array.from(groups.values());
        }

        function pointKeyImageParamToBase(p, base) {
            const keys = getActiveKeyCount();
            let cfg = maniaSkinConfigurations.get(keys);
            if (!cfg) {
                cfg = ensureManiaConfigForKeys(keys);
                maniaSkinConfigurations.set(keys, cfg);
            }
            if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
            for (const alias of getTextureParamAliases(p.key, keys)) {
                cfg[alias] = base;
                cfg.ImageLookups.set(alias, base);
                cfg.ImageLookups.set(alias.toLowerCase(), base);
            }
            syncParamInputValue(p.key, base);
        }

        function chooseKeyImageGroupBase(group, usedBases) {
            const representative = group.entries.find((entry) => entry.isSelected) ||
                group.entries[0];
            const requested = stripTextureName(representative.target.base || representative.p.key) ||
                `keyimage_edit_${group.entries[0].column + 1}`;
            let base = requested;
            let suffix = 2;
            while (usedBases.has(base.toLowerCase())) {
                base = `${requested}_${suffix++}`;
            }
            usedBases.add(base.toLowerCase());
            return base;
        }

        async function persistKeyImageEditGroups(groups, params, options = {}) {
            if (!groups || groups.length === 0) return false;
            const prepared = [];
            const usedBases = new Set();
            const mode = options.mode || 'overwrite';

            for (const group of groups) {
                const representative = group.entries.find((entry) => entry.isSelected) ||
                    group.entries[0];
                const rawSource = (representative.reference && !representative.reference.startsWith('missing:'))
                    ? representative.reference
                    : ((representative.target.resolved && representative.target.resolved.name) ||
                       representative.target.base ||
                       representative.p.key);
                const sourcePath = normalizeTextureLookupPath(rawSource);
                let base;
                if (mode === 'overwrite' && !usedBases.has(sourcePath.toLowerCase())) {
                    base = normalizeTextureLookupPath(sourcePath);
                } else if (mode === 'independent' || usedBases.has(sourcePath.toLowerCase())) {
                    base = createIndependentTexturePath(sourcePath, representative.p.key);
                } else {
                    base = chooseKeyImageGroupBase(group, usedBases);
                }
                usedBases.add(base.toLowerCase());
                const result = buildEditedFrames(group.sourceFrames, params);
                if (!result || result.frames.length === 0) return false;
                const frames = result.frames.map((frame) =>
                    applyRgbAdjustmentToCanvas(frame, group.rgbAdjustment)
                );
                const serialized = await serializeFrames(base, frames);
                prepared.push({ group, base, frames, serialized, sourcePath });
            }

            for (const item of prepared) {
                const representativeEntry = item.group.entries.find((entry) => entry.isSelected) ||
                    item.group.entries[0];
                const representative = {
                    ...representativeEntry.target,
                    base: item.base
                };
                installFramesToStores(item.frames, representative, {
                    persist: false,
                    draw: false
                });
                for (const entry of item.group.entries) {
                    pointKeyImageParamToBase(entry.p, item.base);
                }
                if (options.scope === 'all') {
                    const curKeys = getActiveKeyCount();
                    let curCfg = maniaSkinConfigurations.get(curKeys) || ensureManiaConfigForKeys(curKeys);
                    if (!curCfg.ImageLookups) curCfg.ImageLookups = new Map();
                    if (item.group.kind === 'normal') {
                        curCfg['KeyImage'] = item.base;
                        curCfg.ImageLookups.set('KeyImage', item.base);
                        curCfg.ImageLookups.set('keyimage', item.base);
                        if (typeof syncParamInputValue === 'function') syncParamInputValue('KeyImage', item.base);
                    } else if (item.group.kind === 'down') {
                        curCfg['KeyImageDown'] = item.base;
                        curCfg.ImageLookups.set('KeyImageDown', item.base);
                        curCfg.ImageLookups.set('keyimagedown', item.base);
                        if (typeof syncParamInputValue === 'function') syncParamInputValue('KeyImageDown', item.base);
                    }
                }
                const createdRef = item.sourcePath || item.group.reference;
                if (typeof hasCreatedTextureParams === 'function' &&
                    hasCreatedTextureParams(createdRef)) {
                    if (mode === 'independent') {
                        cloneCreatedTextureParams(createdRef, item.base);
                    }
                    if (typeof saveCreatedTextureGeneralEditParams === 'function') {
                        saveCreatedTextureGeneralEditParams(item.base, {
                            ...params,
                            imageTransform: cloneImageTransform(params.imageTransform),
                            rgbAdjustment: cloneRgbAdjustment(item.group.rgbAdjustment)
                        });
                    }
                }

                const is2x = !!(item.frames[0] && item.frames[0]._is2x);
                const currentSuffix = is2x ? '@2x.png' : '.png';
                const oppositeSuffix = is2x ? '.png' : '@2x.png';
                item.serialized.forEach((frame, index) => {
                    const frameKey = item.serialized.length > 1
                        ? `${item.base}-${index}`
                        : item.base;
                    userReplacedTextures.set(`${frameKey}${currentSuffix}`, frame.arrayBuffer);
                    userReplacedTextures.delete(`${frameKey}${oppositeSuffix}`);
                });
                if (item.serialized.length > 1) {
                    for (let i = item.serialized.length; i < 64; i++) {
                        const frameKey = `${item.base}-${i}`;
                        skinImageStore.delete(frameKey);
                        skinFallbackImageStore.delete(frameKey);
                        userReplacedTextures.delete(`${frameKey}.png`);
                        userReplacedTextures.delete(`${frameKey}@2x.png`);
                    }
                }
            }
            drawFrame();
            renderSkinEditorParams();
            return prepared;
        }
