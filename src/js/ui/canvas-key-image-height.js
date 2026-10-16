// ============================================================================
// canvas-key-image-height.js - KeyImage 高度基线、磁吸与持久化
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

        function getKeyImageHeightContentFrames(frames) {
            const storedOffset = getStoredKeyImageHeightOffset(frames && frames[0]);
            // 无基线缓存时，只能无损恢复编辑器此前增加的底部透明；负偏移裁剪过的像素无法倒推。
            const recoverablePadding1x = storedOffset > 0 ? storedOffset : 0;
            return {
                offset1x: recoverablePadding1x,
                frames: (frames || []).map((frame) => {
                    const source = cloneKeyImageHeightFrame(frame);
                    if (!source) return null;
                    const pixelRatio = source._is2x ? 2 : 1;
                    const removeHeight = Math.min(source.height - 1, Math.round(recoverablePadding1x * pixelRatio));
                    if (removeHeight <= 0) {
                        source._keyImageHeightOffset1x = 0;
                        return source;
                    }
                    const content = document.createElement('canvas');
                    content.width = source.width;
                    content.height = source.height - removeHeight;
                    content._is2x = source._is2x;
                    content._keyImageHeightOffset1x = 0;
                    content.getContext('2d').drawImage(source, 0, 0);
                    return content;
                }).filter(Boolean)
            };
        }

        function collectKeyImageHeightTarget(keys, col) {
            const keyInfo = {};
            const keyName = getManiaNoteTextureName(keys, LML.KeyImage, col, keyInfo);
            if (!keyName || isDummyBlankName(keyName)) return null;

            const currentFrames = keyInfo.explicit
                ? getManiaSkinAnimationFrames(keys, LML.KeyImage, col)
                : (getSkinAnimationFrames(keyName) || getManiaSkinAnimationFrames(keys, LML.KeyImage, col));
            if (!currentFrames || currentFrames.length === 0) return null;

            const currentBase = normalizeKeyImageHeightBase(keyName);
            // 首次调整即复制成该轨专属贴图名，避免继续影响其它轨道或 KeyImageD。
            const base = getIndividualKeyImageBase(currentBase, col);
            const storeKey = normalizeSkinKey(base);
            const baselineKey = storeKey;
            let baseline = keyImageHeightBaselineState.get(baselineKey);
            if (!baseline) {
                const content = getKeyImageHeightContentFrames(currentFrames);
                if (content.frames.length === 0 || !(content.frames[0].width > 0) || !(content.frames[0].height > 0)) return null;
                baseline = {
                    frames: content.frames,
                    offset1x: content.offset1x
                };
                keyImageHeightBaselineState.set(baselineKey, baseline);
            } else {
                const storedOffset = getStoredKeyImageHeightOffset(currentFrames[0]);
                baseline.offset1x = storedOffset;
            }

            const contentFrames = baseline.frames.map(cloneKeyImageHeightFrame);
            if (contentFrames.length === 0 || !(contentFrames[0].width > 0) || !(contentFrames[0].height > 0)) return null;

            return {
                lookup: LML.KeyImage,
                col,
                paramKeys: [`KeyImage${col}`],
                base,
                storeKey,
                is2x: !!contentFrames[0]._is2x,
                stableRefW: (() => {
                    const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, col);
                    const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
                    return rawColW * 1.6 * (contentFrames[0]._is2x ? 2 : 1);
                })(),
                initialOffset1x: baseline.offset1x,
                contentFrames,
                outputFrames: contentFrames.map(cloneKeyImageHeightFrame)
            };
        }

        function collectKeyImageDownHeightTarget(keys, col) {
            const downInfo = {};
            const downName = getManiaNoteTextureName(keys, LML.KeyImageDown, col, downInfo);
            if (!downName || isDummyBlankName(downName)) return null;

            const matchedKey = String(downInfo.matchedKey || '');
            const isActualDownKey = /^keyimage(?:d(?:own)?\d*|\d+(?:d|down))$/i.test(matchedKey);
            if (downInfo.explicit && !isActualDownKey) return null;

            const currentFrames = downInfo.explicit
                ? getManiaSkinAnimationFrames(keys, LML.KeyImageDown, col)
                : getSkinAnimationFrames(downName);
            if (!currentFrames || currentFrames.length === 0) return null;

            const currentBase = normalizeKeyImageHeightBase(downName);
            const base = getIndividualKeyImageDownBase(currentBase, col);
            const storeKey = normalizeSkinKey(base);
            let baseline = keyImageHeightBaselineState.get(storeKey);
            if (!baseline) {
                const content = getKeyImageHeightContentFrames(currentFrames);
                if (content.frames.length === 0 || !(content.frames[0].width > 0) || !(content.frames[0].height > 0)) return null;
                baseline = {
                    frames: content.frames,
                    offset1x: content.offset1x
                };
                keyImageHeightBaselineState.set(storeKey, baseline);
            } else {
                baseline.offset1x = getStoredKeyImageHeightOffset(currentFrames[0]);
            }

            const contentFrames = baseline.frames.map(cloneKeyImageHeightFrame);
            if (contentFrames.length === 0 || !(contentFrames[0].width > 0) || !(contentFrames[0].height > 0)) return null;

            const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, col);
            const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
            return {
                lookup: LML.KeyImageDown,
                col,
                paramKeys: getTextureParamAliases(`KeyImage${col}D`, keys),
                base,
                storeKey,
                is2x: !!contentFrames[0]._is2x,
                stableRefW: rawColW * 1.6 * (contentFrames[0]._is2x ? 2 : 1),
                initialOffset1x: baseline.offset1x,
                contentFrames,
                outputFrames: contentFrames.map(cloneKeyImageHeightFrame)
            };
        }

        function pointKeyImageParamToTargetBase(keys, target) {
            if (!target) return;
            let cfg = maniaSkinConfigurations.get(keys);
            if (!cfg) {
                cfg = ensureManiaConfigForKeys(keys);
                maniaSkinConfigurations.set(keys, cfg);
            }
            if (!cfg.ImageLookups) cfg.ImageLookups = new Map();
            for (const paramKey of target.paramKeys) {
                cfg[paramKey] = target.base;
                cfg.ImageLookups.set(paramKey, target.base);
                cfg.ImageLookups.set(paramKey.toLowerCase(), target.base);
            }
        }

        function installKeyImageHeightTargetFrames(target, frames, keys) {
            if (!target || !frames || frames.length === 0) return;
            const is2x = !!frames[0]._is2x;
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
            pointKeyImageParamToTargetBase(keys, target);
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
            if (!target || !hit || !(target.contentFrames[0].height > 0) || !(hit.w > 0)) {
                return { offset1x, magnetCol: null, magnetHeight: 0 };
            }

            const pixelRatio = target.is2x ? 2 : 1;
            const contentHeight = target.contentFrames[0].height;
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
            const pixelRatio = target.is2x ? 2 : 1;
            const contentHeight = target.contentFrames[0].height;
            const clamped = clampKeyImageHeightOffset(offset1x, contentHeight, pixelRatio);
            const physicalOffset = clamped * pixelRatio;
            const frames = target.contentFrames.map((source) => {
                const canvas = document.createElement('canvas');
                canvas.width = source.width;
                canvas.height = Math.max(1, source.height + physicalOffset);
                canvas._is2x = !!source._is2x;
                canvas._keyImageHeightOffset1x = clamped;
                canvas._isRootLevel = true;
                canvas.getContext('2d').drawImage(source, 0, 0);
                return canvas;
            });
            return { offset1x: clamped, frames };
        }

        function updateKeyImageHeightPreview(dragState, offset1x, keys) {
            const target = dragState && dragState.keyImageHeightTarget;
            if (!target) return;
            const normalOutput = buildKeyImageHeightOutputFrames(target, offset1x);
            dragState.currentOffset1x = normalOutput.offset1x;
            target.outputFrames = normalOutput.frames;
            const baseline = keyImageHeightBaselineState.get(target.storeKey);
            if (baseline) baseline.offset1x = normalOutput.offset1x;
            installKeyImageHeightTargetFrames(target, target.outputFrames, keys);
            syncTextureImageEditorTarget(target);

            const downTarget = dragState.keyImageDownHeightTarget;
            const hit = dragState.element;
            if (downTarget && hit && hit.w > 0) {
                const normalDrawHeight = hit.w * target.outputFrames[0].height / target.stableRefW;
                const downContentHeight = downTarget.contentFrames[0].height;
                const downPixelRatio = downTarget.is2x ? 2 : 1;
                const matchingDownOffset = clampKeyImageHeightOffset(
                    (normalDrawHeight * downTarget.stableRefW / hit.w - downContentHeight) / downPixelRatio,
                    downContentHeight,
                    downPixelRatio
                );
                const downOutput = buildKeyImageHeightOutputFrames(downTarget, matchingDownOffset);
                downTarget.outputFrames = downOutput.frames;
                const downBaseline = keyImageHeightBaselineState.get(downTarget.storeKey);
                if (downBaseline) downBaseline.offset1x = downOutput.offset1x;
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
