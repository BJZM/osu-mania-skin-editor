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
            if (p._trackLookup === LML.KeyImageDown || /^KeyImage\d+(?:D|Down)$/i.test(p.key || '')) {
                return 'down';
            }
            if (p._trackLookup === LML.KeyImage || /^KeyImage\d+$/i.test(p.key || '')) {
                return 'normal';
            }
            return null;
        }

        function isEditingKeyImageParam(p) {
            return getKeyImageParamKind(p) != null;
        }

        function collectKeyImageEditGroups(scope) {
            const keys = getActiveKeyCount();
            const selectedCol = getSelectedTrackIndex();
            if (selectedCol == null) return [];
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
                for (const kind of ['normal', 'down']) {
                    const p = findParam(column, kind);
                    if (!p) continue;
                    const target = buildEditorTarget(p);
                    if (!target) continue;
                    const isSelected = state.selected && state.selected.p.key === p.key;
                    const cachedSource = state.keyImageOriginalSources[p.key] ||
                        (isSelected && editRecipe
                            ? editRecipe.keyImageOriginalSources[p.key]
                            : null);
                    const selectedRecipeFrames = isSelected && editRecipe
                        ? editRecipe.sourceFrames.map(cloneFrame)
                        : null;
                    const sourceFrames = selectedRecipeFrames ||
                        (cachedSource
                            ? cachedSource.frames.map(cloneFrame)
                            : (isSelected
                                ? state.workingFrames.map(cloneFrame)
                                : target.frames.map(cloneFrame)));
                    const explicitReference = isSelected && editRecipe && editRecipe.originalReference
                        ? editRecipe.originalReference
                        : (cachedSource
                        ? cachedSource.reference
                        : (sourceFrames.length > 0
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
                        reference: explicitReference || `missing:${column}:${kind}`
                    });
                }
            }

            for (const column of columns) {
                const normal = entries.find((entry) => entry.column === column && entry.kind === 'normal');
                const down = entries.find((entry) => entry.column === column && entry.kind === 'down');
                if (!normal || !down) continue;
                if (normal.sourceFrames.length === 0 && down.sourceFrames.length > 0) {
                    normal.sourceFrames = down.sourceFrames.map(cloneFrame);
                    normal.reference = `missing:${column}:normal`;
                } else if (down.sourceFrames.length === 0 && normal.sourceFrames.length > 0) {
                    down.sourceFrames = normal.sourceFrames.map(cloneFrame);
                    down.reference = `missing:${column}:down`;
                }
                if (normal.sourceFrames.length > 0 && !state.keyImageOriginalSources[normal.p.key]) {
                    state.keyImageOriginalSources[normal.p.key] = {
                        frames: normal.sourceFrames.map(cloneFrame),
                        reference: normal.reference
                    };
                }
                if (down.sourceFrames.length > 0 && !state.keyImageOriginalSources[down.p.key]) {
                    state.keyImageOriginalSources[down.p.key] = {
                        frames: down.sourceFrames.map(cloneFrame),
                        reference: down.reference
                    };
                }
            }

            const groups = new Map();
            for (const entry of entries) {
                if (entry.sourceFrames.length === 0) continue;
                const group = groups.get(entry.reference) || {
                    reference: entry.reference,
                    sourceFrames: entry.sourceFrames,
                    entries: []
                };
                group.entries.push(entry);
                if (entry.isSelected) group.sourceFrames = entry.sourceFrames;
                groups.set(entry.reference, group);
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

        async function persistKeyImageEditGroups(groups, params) {
            if (!groups || groups.length === 0) return false;
            const prepared = [];
            const usedBases = new Set();

            for (const group of groups) {
                const base = chooseKeyImageGroupBase(group, usedBases);
                const result = buildEditedFrames(group.sourceFrames, params);
                if (!result || result.frames.length === 0) return false;
                const serialized = await serializeFrames(base, result.frames);
                prepared.push({ group, base, frames: result.frames, serialized });
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
                for (let i = item.serialized.length; i < 64; i++) {
                    const frameKey = `${item.base}-${i}`;
                    skinImageStore.delete(frameKey);
                    skinFallbackImageStore.delete(frameKey);
                    userReplacedTextures.delete(`${frameKey}.png`);
                    userReplacedTextures.delete(`${frameKey}@2x.png`);
                }
            }
            drawFrame();
            renderSkinEditorParams();
            return prepared;
        }
