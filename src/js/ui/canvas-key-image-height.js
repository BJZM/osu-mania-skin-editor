// ============================================================================
// canvas-key-image-height.js - KeyImage 高度基线、磁吸、贴图编辑参数关联与持久化
// 从 canvas-interactions.js 按职责拆分。
// ============================================================================

        function invalidateKeyImageHeightPersistence() {
            keyImageHeightPersistGeneration++;
        }

        function clearKeyImageHeightBaselines() {
            keyImageHeightBaselineState.clear();
            invalidateKeyImageHeightPersistence();
        }

        function getStoredKeyImageHeightOffset(frame) {
            const explicitOffset = Number(frame && frame._keyImageHeightOffset1x);
            if (Number.isFinite(explicitOffset)) return explicitOffset;
            return Number(frame && frame._keyImageHeightPadding1x) || 0;
        }

        function cloneKeyImageHeightFrame(source) {
            if (!source) return null;
            const width = source.naturalWidth || source.videoWidth || source.width || 0;
            const height = source.naturalHeight || source.videoHeight || source.height || 0;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(source, 0, 0);
            canvas._is2x = !!source._is2x;
            canvas._keyImageHeightOffset1x = getStoredKeyImageHeightOffset(source);
            return canvas;
        }

        function normalizeKeyImageHeightBase(name) {
            return String(name || '')
                .trim()
                .replace(/\\/g, '/')
                .replace(/\.(png|jpg|jpeg)$/i, '')
                .replace(/@2x$/i, '');
        }

        function getIndividualKeyImageBase(base, col) {
            const suffix = `_height_col${col + 1}`;
            return base.toLowerCase().endsWith(suffix) ? base : `${base}${suffix}`;
        }

        function getIndividualKeyImageDownBase(base, col) {
            const suffix = `_height_col${col + 1}d`;
            return base.toLowerCase().endsWith(suffix) ? base : `${base}${suffix}`;
        }

        function collectKeyImageHeightTarget(keys, col) {
            const keyInfo = {};
            const keyName = getManiaNoteTextureName(keys, LML.KeyImage, col, keyInfo);
            if (!keyName || isDummyBlankName(keyName)) return null;

            const isCreated = typeof hasCreatedTextureParams === 'function' && hasCreatedTextureParams(keyName);
            let sourceFrames = null;
            let editParams = null;
            const paramKey = `KeyImage${col}`;

            if (isCreated) {
                const createdParams = getCreatedTextureParams(keyName);
                if (!createdParams) return null;
                const genFrame = createSolidShapeTexture(createdParams);
                genFrame._is2x = createdParams.spec === '2x';
                genFrame._isRootLevel = !keyName.includes('/');
                sourceFrames = [genFrame];
                const generalEdit = typeof getCreatedTextureGeneralEditParams === 'function'
                    ? getCreatedTextureGeneralEditParams(keyName)
                    : null;
                editParams = generalEdit ? cloneTextureEditParams(generalEdit) : {
                    left: 0, right: 0, top: 0, bottom: 0,
                    cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
                    cropX: 0, cropY: 0,
                    imageTransform: typeof createDefaultImageTransform === 'function'
                        ? createDefaultImageTransform() : null,
                    rgbAdjustment: typeof createDefaultRgbAdjustment === 'function'
                        ? createDefaultRgbAdjustment() : null
                };
            } else {
                const p = typeof getTextureTabParams === 'function'
                    ? getTextureTabParams().find((item) => item.key === paramKey)
                    : null;
                const target = p && typeof buildEditorTarget === 'function'
                    ? buildEditorTarget(p)
                    : null;
                const recipe = target && typeof getStoredTextureEditRecipe === 'function'
                    ? getStoredTextureEditRecipe(target)
                    : null;
                if (recipe && recipe.sourceFrames && recipe.sourceFrames.length > 0) {
                    sourceFrames = recipe.sourceFrames.map(cloneFrame);
                    editParams = {
                        ...recipe.params,
                        imageTransform: typeof cloneImageTransform === 'function'
                            ? cloneImageTransform(recipe.params.imageTransform)
                            : (recipe.params.imageTransform ? { ...recipe.params.imageTransform } : null),
                        rgbAdjustment: typeof cloneRgbAdjustment === 'function'
                            ? cloneRgbAdjustment(recipe.params.rgbAdjustment)
                            : (recipe.params.rgbAdjustment ? { ...recipe.params.rgbAdjustment } : null)
                    };
                } else {
                    const currentFrames = keyInfo.explicit
                        ? getManiaSkinAnimationFrames(keys, LML.KeyImage, col)
                        : (getSkinAnimationFrames(keyName) || getManiaSkinAnimationFrames(keys, LML.KeyImage, col));
                    if (!currentFrames || currentFrames.length === 0) return null;
                    sourceFrames = currentFrames.map(cloneFrame);
                    editParams = {
                        left: 0, right: 0, top: 0, bottom: 0,
                        cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
                        cropX: 0, cropY: 0,
                        imageTransform: typeof createDefaultImageTransform === 'function'
                            ? createDefaultImageTransform() : null,
                        rgbAdjustment: typeof createDefaultRgbAdjustment === 'function'
                            ? createDefaultRgbAdjustment() : null
                    };
                    const legacyOffset = getStoredKeyImageHeightOffset(currentFrames[0]);
                    if (legacyOffset !== 0) {
                        const ratio = currentFrames[0]._is2x ? 2 : 1;
                        editParams.bottom = legacyOffset * ratio;
                        editParams.cropBottom = editParams.bottom;
                    }
                }
            }

            if (!sourceFrames || sourceFrames.length === 0 || !(sourceFrames[0].width > 0) || !(sourceFrames[0].height > 0)) {
                return null;
            }

            const pixelRatio = sourceFrames[0]._is2x ? 2 : 1;
            const currentBottom = Number(editParams.bottom != null ? editParams.bottom : (editParams.cropBottom || 0));
            const initialOffset1x = Math.round(currentBottom / pixelRatio);

            const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, col);
            const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;

            const base = keyName;
            const storeKey = normalizeSkinKey(base);

            return {
                lookup: LML.KeyImage,
                col,
                paramKeys: [`KeyImage${col}`],
                base,
                storeKey,
                isCreated,
                is2x: !!sourceFrames[0]._is2x,
                pixelRatio,
                stableRefW: rawColW * 1.6 * pixelRatio,
                initialOffset1x,
                sourceFrames,
                contentFrames: sourceFrames.map(cloneFrame),
                editParams,
                currentParams: { ...editParams },
                outputFrames: sourceFrames.map(cloneFrame)
            };
        }

        function collectKeyImageDownHeightTarget(keys, col) {
            const downInfo = {};
            const downName = getManiaNoteTextureName(keys, LML.KeyImageDown, col, downInfo);
            if (!downName || isDummyBlankName(downName)) return null;

            const keyName = getManiaNoteTextureName(keys, LML.KeyImage, col);
            if (normalizeTextureLookupPath(downName) === normalizeTextureLookupPath(keyName)) {
                return null;
            }

            const matchedKey = String(downInfo.matchedKey || '');
            const isActualDownKey = /^keyimage(?:d(?:own)?\d*|\d+(?:d|down))$/i.test(matchedKey);
            if (downInfo.explicit && !isActualDownKey) return null;

            const isCreated = typeof hasCreatedTextureParams === 'function' && hasCreatedTextureParams(downName);
            let sourceFrames = null;
            let editParams = null;
            const paramKey = `KeyImage${col}D`;

            if (isCreated) {
                const createdParams = getCreatedTextureParams(downName);
                if (!createdParams) return null;
                const genFrame = createSolidShapeTexture(createdParams);
                genFrame._is2x = createdParams.spec === '2x';
                genFrame._isRootLevel = !downName.includes('/');
                sourceFrames = [genFrame];
                const generalEdit = typeof getCreatedTextureGeneralEditParams === 'function'
                    ? getCreatedTextureGeneralEditParams(downName)
                    : null;
                editParams = generalEdit ? cloneTextureEditParams(generalEdit) : {
                    left: 0, right: 0, top: 0, bottom: 0,
                    cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
                    cropX: 0, cropY: 0,
                    imageTransform: typeof createDefaultImageTransform === 'function'
                        ? createDefaultImageTransform() : null,
                    rgbAdjustment: typeof createDefaultRgbAdjustment === 'function'
                        ? createDefaultRgbAdjustment() : null
                };
            } else {
                const p = typeof getTextureTabParams === 'function'
                    ? getTextureTabParams().find((item) => item.key === paramKey)
                    : null;
                const target = p && typeof buildEditorTarget === 'function'
                    ? buildEditorTarget(p)
                    : null;
                const recipe = target && typeof getStoredTextureEditRecipe === 'function'
                    ? getStoredTextureEditRecipe(target)
                    : null;
                if (recipe && recipe.sourceFrames && recipe.sourceFrames.length > 0) {
                    sourceFrames = recipe.sourceFrames.map(cloneFrame);
                    editParams = {
                        ...recipe.params,
                        imageTransform: typeof cloneImageTransform === 'function'
                            ? cloneImageTransform(recipe.params.imageTransform)
                            : (recipe.params.imageTransform ? { ...recipe.params.imageTransform } : null),
                        rgbAdjustment: typeof cloneRgbAdjustment === 'function'
                            ? cloneRgbAdjustment(recipe.params.rgbAdjustment)
                            : (recipe.params.rgbAdjustment ? { ...recipe.params.rgbAdjustment } : null)
                    };
                } else {
                    const currentFrames = downInfo.explicit
                        ? getManiaSkinAnimationFrames(keys, LML.KeyImageDown, col)
                        : getSkinAnimationFrames(downName);
                    if (!currentFrames || currentFrames.length === 0) return null;
                    sourceFrames = currentFrames.map(cloneFrame);
                    editParams = {
                        left: 0, right: 0, top: 0, bottom: 0,
                        cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
                        cropX: 0, cropY: 0,
                        imageTransform: typeof createDefaultImageTransform === 'function'
                            ? createDefaultImageTransform() : null,
                        rgbAdjustment: typeof createDefaultRgbAdjustment === 'function'
                            ? createDefaultRgbAdjustment() : null
                    };
                }
            }

            if (!sourceFrames || sourceFrames.length === 0 || !(sourceFrames[0].width > 0) || !(sourceFrames[0].height > 0)) {
                return null;
            }

            const pixelRatio = sourceFrames[0]._is2x ? 2 : 1;
            const currentBottom = Number(editParams.bottom != null ? editParams.bottom : (editParams.cropBottom || 0));
            const initialOffset1x = Math.round(currentBottom / pixelRatio);

            const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, col);
            const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;

            const base = downName;
            const storeKey = normalizeSkinKey(base);

            return {
                lookup: LML.KeyImageDown,
                col,
                paramKeys: getTextureParamAliases(`KeyImage${col}D`, keys),
                base,
                storeKey,
                isCreated,
                is2x: !!sourceFrames[0]._is2x,
                pixelRatio,
                stableRefW: rawColW * 1.6 * pixelRatio,
                initialOffset1x,
                sourceFrames,
                contentFrames: sourceFrames.map(cloneFrame),
                editParams,
                currentParams: { ...editParams },
                outputFrames: sourceFrames.map(cloneFrame)
            };
        }

        function installKeyImageHeightTargetFrames(target, frames, keys) {
            if (!target || !frames || frames.length === 0) return;
            const is2x = !!target.is2x;
            const stores = [skinImageStore, skinFallbackImageStore];

            for (const store of stores) {
                const baseEntry = getOrCreateSkinAssetEntry(store, target.storeKey);
                baseEntry.anim1x = [];
                baseEntry.anim2x = [];
                baseEntry.static1x = null;
                baseEntry.static2x = null;

                if (frames.length === 1) {
                    frames[0]._isRootLevel = true;
                    saveSkinAssetToStore(store, target.base, frames[0], is2x, true, true);
                } else {
                    frames.forEach((frame, index) => {
                        frame._isRootLevel = true;
                        saveSkinAssetToStore(store, `${target.base}-${index}`, frame, is2x, true, true);
                    });
                }
            }
        }

        function syncTextureImageEditorTarget(target) {
            if (!target || !target.outputFrames || target.outputFrames.length === 0) return;
            if (typeof textureImageEditorUi !== 'undefined' && textureImageEditorUi &&
                typeof textureImageEditorUi.syncExternalFrames === 'function') {
                textureImageEditorUi.syncExternalFrames(target, target.outputFrames);
            }
        }

        function clampKeyImageHeightOffset(offset1x, contentHeight, pixelRatio) {
            const maxCrop = Math.min(KEY_IMAGE_HEIGHT_MAX_CROP_1X,
                Math.max(0, Math.floor((contentHeight - 1) / Math.max(1, pixelRatio))));
            const minOffset = -maxCrop;
            return Math.max(minOffset, Math.min(KEY_IMAGE_HEIGHT_MAX_PADDING_1X, Math.round(offset1x)));
        }

        function getKeyImageDrawHeight(keys, col) {
            const img = getManiaSkinImage(keys, LML.KeyImage, col);
            if (!img || !(img.width > 0) || !(img.height > 0)) return 0;
            const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, col);
            const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
            const colW = rawColW * (canvas.height / 480);
            const ratio = img._is2x ? 2 : 1;
            const stableRefW = rawColW * 1.6 * ratio;
            return Math.abs(img.width - stableRefW) < 1
                ? colW * img.height / img.width
                : colW * img.height / stableRefW;
        }

        function resolveKeyImageHeightMagnet(dragState, offset1x, scale48) {
            const target = dragState && dragState.keyImageHeightTarget;
            const hit = dragState && dragState.element;
            if (!target || !hit || !(target.sourceFrames[0].height > 0) || !(hit.w > 0)) {
                return { offset1x, magnetCol: null, magnetHeight: 0 };
            }

            const pixelRatio = target.pixelRatio || (target.is2x ? 2 : 1);
            const contentHeight = target.sourceFrames[0].height;
            const stableRefW = hit.keyImageStableRefWidth || (30 * 1.6 * pixelRatio);
            const heightForOffset = (value) => {
                const height = Math.max(1, contentHeight + value * pixelRatio);
                return hit.w * height / stableRefW;
            };
            const proposed = clampKeyImageHeightOffset(offset1x, contentHeight, pixelRatio);
            const proposedHeight = heightForOffset(proposed);
            const threshold = KEY_IMAGE_HEIGHT_MAGNET_CANVAS_PX * scale48;
            let best = null;

            for (let col = 0; col < dragState.keys; col++) {
                if (col === target.col) continue;
                // 如果该轨道引用的是当前正在调整的同一个贴图，跳过磁吸（避免跟随变高的图导致自吸附死锁）
                if (typeof getManiaNoteTextureName === 'function') {
                    const otherKeyName = getManiaNoteTextureName(dragState.keys, LML.KeyImage, col);
                    if (normalizeTextureLookupPath(otherKeyName) === normalizeTextureLookupPath(target.base)) {
                        continue;
                    }
                }
                const otherHeight = getKeyImageDrawHeight(dragState.keys, col);
                if (!(otherHeight > 1)) continue;

                const matchingOffset = clampKeyImageHeightOffset(
                    (otherHeight * stableRefW / hit.w - contentHeight) / pixelRatio,
                    contentHeight,
                    pixelRatio
                );
                const actualHeight = heightForOffset(matchingOffset);
                const delta = Math.abs(actualHeight - proposedHeight);
                if (delta <= threshold && (!best || delta < best.delta)) {
                    best = { offset1x: matchingOffset, col, height: actualHeight, delta };
                }
            }

            return best
                ? { offset1x: best.offset1x, magnetCol: best.col, magnetHeight: best.height }
                : { offset1x: proposed, magnetCol: null, magnetHeight: 0 };
        }

        function buildKeyImageHeightOutputFrames(target, offset1x) {
            const pixelRatio = target.pixelRatio || (target.is2x ? 2 : 1);
            const contentHeight = target.sourceFrames[0].height;
            const clamped = clampKeyImageHeightOffset(offset1x, contentHeight, pixelRatio);
            const physicalBottom = clamped * pixelRatio;
            const currentParams = {
                ...target.editParams,
                bottom: physicalBottom,
                cropBottom: physicalBottom,
                cropY: -Number(target.editParams.top || 0),
                cropHeight: contentHeight + Number(target.editParams.top || 0) + physicalBottom,
                heightDelta: Number(target.editParams.top || 0) + physicalBottom,
                keyImageHeightOffset1x: clamped
            };
            target.currentParams = currentParams;

            const result = typeof buildEditedFrames === 'function'
                ? buildEditedFrames(target.sourceFrames, currentParams)
                : null;
            let frames = result && result.frames && result.frames.length > 0
                ? result.frames
                : target.sourceFrames.map((source) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = source.width;
                    canvas.height = Math.max(1, source.height + physicalBottom);
                    canvas._is2x = !!source._is2x;
                    canvas.getContext('2d').drawImage(source, 0, 0);
                    return canvas;
                });

            if (currentParams.rgbAdjustment && typeof applyRgbAdjustmentToCanvas === 'function') {
                frames = frames.map((frame) =>
                    applyRgbAdjustmentToCanvas(cloneFrame(frame), currentParams.rgbAdjustment)
                );
            }
            frames.forEach((frame) => {
                frame._is2x = target.is2x;
                frame._isRootLevel = true;
                frame._keyImageHeightOffset1x = clamped;
            });
            return { offset1x: clamped, frames, params: currentParams };
        }

        function updateKeyImageHeightPreview(dragState, offset1x, keys) {
            const target = dragState && dragState.keyImageHeightTarget;
            if (!target) return;
            const normalOutput = buildKeyImageHeightOutputFrames(target, offset1x);
            dragState.currentOffset1x = normalOutput.offset1x;
            target.outputFrames = normalOutput.frames;
            installKeyImageHeightTargetFrames(target, target.outputFrames, keys);
            syncTextureImageEditorTarget(target);

            const downTarget = dragState.keyImageDownHeightTarget;
            const hit = dragState.element;
            if (downTarget && hit && hit.w > 0) {
                const downContentHeight = downTarget.sourceFrames[0].height;
                const downPixelRatio = downTarget.pixelRatio || (downTarget.is2x ? 2 : 1);
                const hasPairTransform =
                    (typeof hasImageTransform === 'function' &&
                        hasImageTransform(normalOutput.params.imageTransform)) ||
                    (typeof hasImageTransform === 'function' &&
                        hasImageTransform(downTarget.editParams && downTarget.editParams.imageTransform));
                const matchingDownOffset = hasPairTransform
                    ? normalOutput.offset1x
                    : clampKeyImageHeightOffset(
                        (hit.w * target.outputFrames[0].height / target.stableRefW *
                            downTarget.stableRefW / hit.w - downContentHeight) / downPixelRatio,
                        downContentHeight,
                        downPixelRatio
                    );
                const downOutput = buildKeyImageHeightOutputFrames(downTarget, matchingDownOffset);
                downTarget.outputFrames = downOutput.frames;
                installKeyImageHeightTargetFrames(downTarget, downTarget.outputFrames, keys);
                syncTextureImageEditorTarget(downTarget);
            }
            drawFrame();
        }

        function canvasFrameToPngBuffer(frame) {
            return new Promise((resolve, reject) => {
                frame.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('无法生成按键贴图 PNG'));
                        return;
                    }
                    blob.arrayBuffer().then(resolve).catch(reject);
                }, 'image/png');
            });
        }

        function revertKeyImagePreviewInStores(target) {
            if (!target) return;
            const stores = [skinImageStore, skinFallbackImageStore];
            let origFrames = target.contentFrames;
            if (target.isCreated && typeof createSolidShapeTexture === 'function') {
                const cParams = getCreatedTextureParams(target.base);
                if (cParams) {
                    const frame = createSolidShapeTexture(cParams);
                    frame._is2x = cParams.spec === '2x';
                    frame._isRootLevel = true;
                    const genEdit = typeof getCreatedTextureGeneralEditParams === 'function'
                        ? getCreatedTextureGeneralEditParams(target.base)
                        : null;
                    if (genEdit && typeof buildEditedFrames === 'function') {
                        const res = buildEditedFrames([frame], genEdit);
                        origFrames = (res && res.frames) || [frame];
                    } else {
                        origFrames = [frame];
                    }
                }
            } else if (target.editParams && typeof buildEditedFrames === 'function') {
                const prev = buildEditedFrames(target.sourceFrames, target.editParams);
                if (prev && prev.frames.length > 0) {
                    origFrames = prev.frames;
                }
            }
            for (const store of stores) {
                if (origFrames.length === 1) {
                    saveSkinAssetToStore(store, target.base, origFrames[0], !!origFrames[0]._is2x, true, true);
                } else {
                    origFrames.forEach((frame, index) => {
                        saveSkinAssetToStore(store, `${target.base}-${index}`, frame, !!frame._is2x, true, true);
                    });
                }
            }
        }

        function saveKeyImageRecipe(keys, paramKey, reference, sourceFrames, params, outputFrames) {
            if (typeof textureEditRecipes === 'undefined' || !(textureEditRecipes instanceof Map)) return;
            const recipeKey = `${keys}|${paramKey}`;
            textureEditRecipes.set(recipeKey, {
                sourceFrames: (sourceFrames || []).map(cloneFrame),
                originalReference: normalizeSkinKey(reference),
                keyImageOriginalSources: {},
                params: {
                    ...params,
                    imageTransform: typeof cloneImageTransform === 'function'
                        ? cloneImageTransform(params.imageTransform)
                        : (params.imageTransform ? { ...params.imageTransform } : null),
                    rgbAdjustment: typeof cloneRgbAdjustment === 'function'
                        ? cloneRgbAdjustment(params.rgbAdjustment)
                        : (params.rgbAdjustment ? { ...params.rgbAdjustment } : null)
                },
                outputFrames: (outputFrames || []).map(cloneFrame)
            });
        }

        function pointKeyImageParamToPath(keys, col, oldSourcePath, newPath) {
            let cfg = maniaSkinConfigurations.get(keys);
            if (!cfg) {
                cfg = ensureManiaConfigForKeys(keys);
                maniaSkinConfigurations.set(keys, cfg);
            }
            if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
            for (const alias of getTextureParamAliases(`KeyImage${col}`, keys)) {
                cfg[alias] = newPath;
                cfg.ImageLookups.set(alias, newPath);
                cfg.ImageLookups.set(alias.toLowerCase(), newPath);
            }
            syncParamInputValue(`KeyImage${col}`, newPath);

            const downInfo = {};
            const downName = getManiaNoteTextureName(keys, LML.KeyImageDown, col, downInfo);
            if (normalizeTextureLookupPath(downName) === normalizeTextureLookupPath(oldSourcePath)) {
                for (const alias of getTextureParamAliases(`KeyImage${col}D`, keys)) {
                    cfg[alias] = newPath;
                    cfg.ImageLookups.set(alias, newPath);
                    cfg.ImageLookups.set(alias.toLowerCase(), newPath);
                }
                syncParamInputValue(`KeyImage${col}D`, newPath);
            }
        }

        async function persistKeyImageHeightTargets(targets, generation) {
            for (const target of targets) {
                if (!target || !target.outputFrames || target.outputFrames.length === 0) continue;
                const is2x = !!target.outputFrames[0]._is2x;
                const currentSuffix = is2x ? '@2x.png' : '.png';
                const oppositeSuffix = is2x ? '.png' : '@2x.png';

                for (let i = 0; i < target.outputFrames.length; i++) {
                    const frameBase = target.outputFrames.length > 1 ? `${target.base}-${i}` : target.base;
                    const buffer = await canvasFrameToPngBuffer(target.outputFrames[i]);
                    if (generation !== keyImageHeightPersistGeneration) return false;
                    userReplacedTextures.set(`${frameBase}${currentSuffix}`, buffer);
                    userReplacedTextures.delete(`${frameBase}${oppositeSuffix}`);
                }
            }
            if (typeof textureImageEditorUi !== 'undefined' && textureImageEditorUi &&
                typeof textureImageEditorUi.commitExternalChanges === 'function') {
                textureImageEditorUi.commitExternalChanges();
            }
            return true;
        }

        async function handleKeyImageHeightDragEnd(dragState) {
            const target = dragState.keyImageHeightTarget;
            if (!target) return;
            const keys = dragState.keys;
            const col = target.col;
            const sourcePath = normalizeTextureLookupPath(target.base);

            // 检查是否有其他轨道或地方引用了该贴图
            const references = typeof collectTexturePathReferences === 'function'
                ? collectTexturePathReferences(sourcePath)
                : [];
            const otherReferences = references.filter((p) => {
                const track = typeof getParamTrackIndex === 'function' ? getParamTrackIndex(p) : null;
                const kind = typeof getKeyImageParamKind === 'function' ? getKeyImageParamKind(p) : null;
                if (track === col && kind === 'normal') return false;
                if (track === col && kind === 'down') return false;
                return true;
            });

            let decision = 'all';
            if (otherReferences.length > 0 && typeof requestLongBodyApplyScope === 'function') {
                decision = await requestLongBodyApplyScope({
                    title: '贴图被多处引用',
                    text: `“${sourcePath}”还被其他 ${otherReferences.length} 个地方引用。是否同步替换所有引用？选择“同步替换”将直接更新原贴图；选择“独立创建”将为当前轨道独立创建贴图。`,
                    currentLabel: '独立创建',
                    allLabel: '同步替换'
                });
                if (!decision) {
                    // 用户取消：撤回实时预览产生的变动
                    if (typeof undoStack !== 'undefined' && undoStack.length > 0) {
                        const cancelSnap = undoStack.pop();
                        applySkinSnapshot(cancelSnap);
                        drawFrame();
                        updateUndoButtonState();
                    }
                    return;
                }
            }

            const persistGeneration = ++keyImageHeightPersistGeneration;

            if (decision === 'current') {
                // 为当前轨道独立创建新贴图
                const independentBase = createIndependentTexturePath(sourcePath, `KeyImage${col}`);

                // 1. 先把原贴图 sourcePath 在 stores 中的实时预览还原为未拖动前的状态
                revertKeyImagePreviewInStores(target);

                // 2. 如果是自建贴图，拷贝创建参数并保存通用设置
                if (target.isCreated && typeof cloneCreatedTextureParams === 'function') {
                    cloneCreatedTextureParams(sourcePath, independentBase);
                    if (typeof saveCreatedTextureGeneralEditParams === 'function') {
                        saveCreatedTextureGeneralEditParams(independentBase, target.currentParams);
                    }
                } else {
                    saveKeyImageRecipe(keys, `KeyImage${col}`, independentBase, target.sourceFrames, target.currentParams, target.outputFrames);
                }

                // 3. 将新贴图安装到 stores
                const independentTarget = {
                    ...target,
                    base: independentBase,
                    storeKey: normalizeSkinKey(independentBase)
                };
                installKeyImageHeightTargetFrames(independentTarget, target.outputFrames, keys);

                // 4. 将当前轨道的 KeyImage（及如果原本共享同一图的 KeyImageD）重定向到 independentBase
                pointKeyImageParamToPath(keys, col, sourcePath, independentBase);

                // 5. 持久化新贴图到 userReplacedTextures
                await persistKeyImageHeightTargets([independentTarget], persistGeneration);

                drawFrame();
                renderSkinEditorParams();
                showToast('按键高度已调整', `已为第 ${col + 1} 轨创建独立贴图 “${independentBase}”`);
            } else {
                // 同步替换（或无其他引用直接更新原图）
                const allRefs = references.length > 0 ? references : [{ key: `KeyImage${col}` }];
                target.paramKeys = allRefs.map((r) => r.key);

                if (target.isCreated) {
                    if (typeof saveCreatedTextureGeneralEditParams === 'function') {
                        saveCreatedTextureGeneralEditParams(sourcePath, target.currentParams);
                    }
                } else {
                    for (const ref of allRefs) {
                        if (ref && ref.key) {
                            saveKeyImageRecipe(keys, ref.key, sourcePath, target.sourceFrames, target.currentParams, target.outputFrames);
                        }
                    }
                }

                installKeyImageHeightTargetFrames(target, target.outputFrames, keys);
                syncTextureImageEditorTarget(target);

                const targetsToPersist = [target];
                if (dragState.keyImageDownHeightTarget) {
                    const downTarget = dragState.keyImageDownHeightTarget;
                    const downSourcePath = normalizeTextureLookupPath(downTarget.base);
                    const downRefs = typeof collectTexturePathReferences === 'function'
                        ? collectTexturePathReferences(downSourcePath)
                        : [];
                    const allDownRefs = downRefs.length > 0 ? downRefs : [{ key: `KeyImage${col}D` }];
                    downTarget.paramKeys = allDownRefs.map((r) => r.key);

                    if (downTarget.isCreated && typeof saveCreatedTextureGeneralEditParams === 'function') {
                        saveCreatedTextureGeneralEditParams(downSourcePath, downTarget.currentParams);
                    } else {
                        for (const ref of allDownRefs) {
                            if (ref && ref.key) {
                                saveKeyImageRecipe(keys, ref.key, downSourcePath, downTarget.sourceFrames, downTarget.currentParams, downTarget.outputFrames);
                            }
                        }
                    }
                    installKeyImageHeightTargetFrames(downTarget, downTarget.outputFrames, keys);
                    syncTextureImageEditorTarget(downTarget);
                    targetsToPersist.push(downTarget);
                }

                // syncExternalFrames 会主动移除旧 recipe；外部帧同步完成后必须用
                // 本次拖拽的原图与参数重新登记，否则下一次拖拽会把已缩放输出当成原图。
                if (!target.isCreated) {
                    for (const ref of allRefs) {
                        if (ref && ref.key) {
                            saveKeyImageRecipe(
                                keys,
                                ref.key,
                                sourcePath,
                                target.sourceFrames,
                                target.currentParams,
                                target.outputFrames
                            );
                        }
                    }
                }
                if (dragState.keyImageDownHeightTarget && !dragState.keyImageDownHeightTarget.isCreated) {
                    const downTarget = dragState.keyImageDownHeightTarget;
                    const downSourcePath = normalizeTextureLookupPath(downTarget.base);
                    const downRefs = typeof collectTexturePathReferences === 'function'
                        ? collectTexturePathReferences(downSourcePath)
                        : [];
                    const allDownRefs = downRefs.length > 0 ? downRefs : [{ key: `KeyImage${col}D` }];
                    for (const ref of allDownRefs) {
                        if (ref && ref.key) {
                            saveKeyImageRecipe(
                                keys,
                                ref.key,
                                downSourcePath,
                                downTarget.sourceFrames,
                                downTarget.currentParams,
                                downTarget.outputFrames
                            );
                        }
                    }
                }

                await persistKeyImageHeightTargets(targetsToPersist, persistGeneration);

                drawFrame();
                renderSkinEditorParams();
                const offset = dragState.currentOffset1x;
                const offsetText = offset >= 0
                    ? `底部透明 +${offset}px`
                    : `裁短 ${Math.abs(offset)}px`;
                showToast('按键高度已调整', `第 ${col + 1} 轨: ${offsetText}`);
            }
        }
