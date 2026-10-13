// ============================================================================
// canvas-interactions.js - 画布元素命中、选中、拖动与参数同步
// 依赖：ui/canvas-editor.js、ui/param-core.js、render/diagnostics.js
// ============================================================================

        const KEY_IMAGE_HEIGHT_MAX_PADDING_1X = 4096;
        const KEY_IMAGE_HEIGHT_MAX_CROP_1X = 4096;
        const KEY_IMAGE_HEIGHT_MAGNET_CANVAS_PX = 8;
        const keyImageHeightBaselineState = new Map();
        let keyImageHeightPersistGeneration = 0;

        function invalidateKeyImageHeightPersistence() {
            keyImageHeightPersistGeneration++;
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
            return true;
        }

        function initCanvasEditorUI() {
            // 画布交互点击与拖拽监听
            if (canvas) {
                canvas.addEventListener('mousedown', (e) => {
                    if (!canvasEditMode) return;
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    const mouseX = (e.clientX - rect.left) * scaleX;
                    const mouseY = (e.clientY - rect.top) * scaleY;

                    // 严格分级命中检测算法：
                    // 阶段 1: 判定线、连击数、判定结果评价、血条、发光位置及 HUD 优先检测
                    // 阶段 2: 判定线以上的正在下落活动音符/长条
                    // 阶段 3: 底座按键 (key_0..key_N)
                    // 阶段 4: 各列独立轨道 (track_col_0..N) - 优先选中单轨调整宽度/间距
                    let hit = null;
                    const curKeys = getActiveKeyCount();
                    const mCfg = maniaSkinConfigurations.get(curKeys) || getManiaConfigForKeys(curKeys) || {};
                    const curHitPos = mCfg.HitPosition != null ? (mCfg.HitPosition * (canvas.height / 480)) : (402 * (canvas.height / 480));
                    let keyImageHeightHandleHit = false;

                    // KeyImage 上边框手柄：未选中时也允许直接抓住，避免被同区域的按键发光抢走。
                    if (!hit) {
                        const handlePad = Math.max(8, 12 * (canvas.height / 480));
                        for (const item of canvasInteractiveElements) {
                            if (!item.id.startsWith('key_') || !item.keyImageHeightAdjustable ||
                                item.keyImageResizeEdgeY == null) continue;
                            if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                Math.abs(mouseY - item.keyImageResizeEdgeY) <= handlePad) {
                                keyImageHeightHandleHit = true;
                                hit = item;
                                break;
                            }
                        }
                    }

                    // 阶段 0: 优先检测当前已选中轨道的右边缘拉伸控制条 (白色加粗高亮区域及其右边缘)
                    if (!hit && selectedCanvasElement && selectedCanvasElement.id.startsWith('track_col_')) {
                        const selElem = selectedCanvasElement;
                        const pad = 6;
                        const rightHandleX = selElem.x + selElem.w + pad;
                        const isOverRightHandle = (mouseX >= selElem.x + selElem.w - 14 && mouseX <= rightHandleX + 12 &&
                                                   mouseY >= selElem.y - 10 && mouseY <= selElem.y + selElem.h + 10);
                        if (isOverRightHandle) {
                            hit = selElem;
                        }
                    }

                    // 阶段 0.5: 打击特效 (LightingN / LightingL) —— **选中优先级高于判定线**。
                    // 打击特效贴图以判定线为中心上下对称绘制，必然与判定线元素 (hitPosition) 的
                    // 可点选带 (判定线 ±16px) 重叠；把它排在阶段 1 之前，保证点在可见特效上时
                    // 一定选中特效本身，而不是被判定线抢走。
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (item.dragType !== 'lighting_width') continue;
                            // 已选中时外扩一点，方便直接抓住白色高亮边框向外/向内拉伸宽度
                            const lwPad = (selectedCanvasElement && selectedCanvasElement.id === item.id) ? 8 : 0;
                            if (mouseX >= item.x - lwPad && mouseX <= item.x + item.w + lwPad &&
                                mouseY >= item.y - lwPad && mouseY <= item.y + item.h + lwPad) {
                                hit = item;
                                break;
                            }
                        }
                    }

                    // 阶段 1: 判定线与按键发光位置。
                    // 关键：LightPosition 缺省时等于 HitPosition，二者的可点选带会几乎完全重合，
                    // 若按固定先后顺序取先者，必有一方永远选不中（这正是「无法选中 StageLight」的根因）。
                    // 因此这里不排队，而是「哪条中心线离点击更近就选谁」；两条线完全重合时判定线以上归光柱、
                    // 判定线及以下归判定线，保证两者在任意 LightPosition 配置下都能被选中。
                    if (!hit) {
                        const hp = canvasInteractiveElements.find(el => el.id === 'hitPosition');
                        const lp = canvasInteractiveElements.find(el => el.id === 'lightPosition');
                        const containsRect = (r) => r && mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
                        // 发光位置这一步只承认常驻手柄 band；可见光柱本体在音符之后单独判定，避免遮挡音符
                        const lightHandle = lp ? {
                            x: lp.x,
                            y: (lp.handleY != null) ? lp.handleY : lp.y,
                            w: lp.w,
                            h: (lp.handleH != null) ? lp.handleH : lp.h
                        } : null;
                        const inHit = containsRect(hp);
                        const inLight = containsRect(lightHandle);
                        if (inHit && inLight) {
                            const hitLineY = (hp.lineY != null) ? hp.lineY : (hp.y + hp.h / 2);
                            const lightLineY = (lp.lineY != null) ? lp.lineY : (lightHandle.y + lightHandle.h / 2);
                            const dHit = Math.abs(mouseY - hitLineY);
                            const dLight = Math.abs(mouseY - lightLineY);
                            if (dLight < dHit) hit = lp;
                            else if (dHit < dLight) hit = hp;
                            else hit = (mouseY <= lightLineY) ? lp : hp;
                        } else if (inHit) {
                            hit = hp;
                        } else if (inLight) {
                            hit = lp;
                        }
                    }

                    // 阶段 1.1: 连击数、判定提示、血条与 HUD 核心控制组件
                    if (!hit) {
                        const priorityElements = ['combo', 'judgement', 'healthDisplay'];
                        for (const pId of priorityElements) {
                            const item = canvasInteractiveElements.find(el => el.id === pId);
                            if (item && mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                hit = item;
                                break;
                            }
                        }
                    }
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (item.id.startsWith('hud_')) {
                                const pad = 3;
                                if (mouseX >= item.x - pad && mouseX <= item.x + item.w + pad && mouseY >= item.y - pad && mouseY <= item.y + item.h + pad) {
                                    hit = item;
                                    break;
                                }
                            }
                        }
                    }

                    // 阶段 2: 判定线以上的正在下落活动音符/长条
                    // 播放过程中不能选取 note 与长条相关元素；仅在暂停/非播放时可点选
                    // 采用逆序查找并就近判定：由于 notesList 按时间正序排列（下方/较早到达判定线的 note 在前，上方/较晚的在后），
                    // 从后向前遍历并选择垂直中心离鼠标最近的 note，防止同轨上有多个 note 时点击上面的 note 却选中下方的 note。
                    if (!hit && !isPlaying && mouseY < curHitPos) {
                        let bestNote = null;
                        let minCenterDist = Infinity;
                        for (let i = canvasInteractiveElements.length - 1; i >= 0; i--) {
                            const item = canvasInteractiveElements[i];
                            if (item.id.startsWith('note_') || item.id.startsWith('hold_')) {
                                if (mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                    const centerY = item.y + item.h / 2;
                                    const dist = Math.abs(mouseY - centerY);
                                    if (dist < minCenterDist) {
                                        minCenterDist = dist;
                                        bestNote = item;
                                    }
                                }
                            }
                        }
                        if (bestNote) {
                            hit = bestNote;
                        }
                    }

                    // 阶段 2.5: 可见的按键发光光柱本体 (StageLight)。
                    // 排在音符之后、按键/轨道之前：光柱贴在轨道上方，点击它应当选中「按键发光位置」；
                    // 但音符绘制在光柱之上，所以点在音柱上的音符时仍优先选中音符，不会被光柱抢走。
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (item.id !== 'lightPosition') continue;
                            if (item.visibleY == null || !(item.visibleH > 0)) continue;
                            if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                mouseY >= item.visibleY && mouseY <= item.visibleY + item.visibleH) {
                                hit = item;
                                break;
                            }
                        }
                    }

                    // 阶段 3: 底座按键 (key_0..key_N)
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (item.id.startsWith('key_')) {
                                if (mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                    hit = item;
                                    break;
                                }
                            }
                        }
                    }

                    // 阶段 4: 检查各列独立轨道 (track_col_0..N) - 选中单轨
                    if (!hit) {
                        for (const item of canvasInteractiveElements) {
                            if (item.id.startsWith('track_col_')) {
                                const pad = (selectedCanvasElement && selectedCanvasElement.id === item.id) ? 12 : 6;
                                if (mouseX >= item.x - pad && mouseX <= item.x + item.w + pad && mouseY >= item.y - pad && mouseY <= item.y + item.h + pad) {
                                    hit = item;
                                    break;
                                }
                            }
                        }
                    }

                    // 阶段 5: 检查舞台两侧边界底图 (stageLeft & stageRight)
                    if (!hit) {
                        const stageEdgePad = Math.max(18, Math.round(22 * (canvas.height / 480)));
                        for (const item of canvasInteractiveElements) {
                            const isStageEdge = item.id.startsWith('stageLeft') || item.id.startsWith('stageRight');
                            if (isStageEdge) {
                                const isSelected = selectedCanvasElement && selectedCanvasElement.id === item.id;
                                const padX = isSelected ? Math.round(stageEdgePad * 1.35) : stageEdgePad;
                                const padY = Math.round(stageEdgePad * 0.55);
                                if (mouseX >= item.x - padX && mouseX <= item.x + item.w + padX &&
                                    mouseY >= item.y - padY && mouseY <= item.y + item.h + padY) {
                                    hit = item;
                                    break;
                                }
                            }
                        }
                    }

                    if (hit) {
                        const isDifferentElement = !selectedCanvasElement ||
                            (selectedCanvasElement.noteInstanceKey || hit.noteInstanceKey
                                ? selectedCanvasElement.noteInstanceKey !== hit.noteInstanceKey
                                : selectedCanvasElement.id !== hit.id);
                        if (isDifferentElement) {
                            selectionAnimStartTime = performance.now();
                        }
                        selectedCanvasElement = hit;
                        syncCanvasSelectedCard(hit);
                        if (hit.dragAxis || keyImageHeightHandleHit) {
                            isDraggingCanvasElement = true;
                            const keys = getActiveKeyCount();
                            let cfg = maniaSkinConfigurations.get(keys);
                            if (!cfg) {
                                cfg = ensureManiaConfigForKeys(keys);
                                maniaSkinConfigurations.set(keys, cfg);
                            }
                            let initialVal;
                            let resolvedDragType = keyImageHeightHandleHit ? 'key_image_height' : hit.dragType;
                            // 打击特效宽度：记录本次抓取的是左边缘还是右边缘（向外拖 = 放大，向内拖 = 缩小）
                            let resizeEdge = null;
                            let keyImageHeightTarget = null;
                            let keyImageDownHeightTarget = null;
                            let keyImageLogicalPxPerCanvasPx = 1;

                            if (hit.id.startsWith('track_col_')) {
                                const pad = 6;
                                const rightHandleX = hit.x + hit.w + pad;
                                // 命中右边缘或者白色加粗控制手柄区域时，均触发宽度调整 (column_width)
                                const isRightEdge = (mouseX >= (hit.x + hit.w - 14) && mouseX <= (rightHandleX + 12));
                                if (currentTrackDragMode === 'width') {
                                    resolvedDragType = 'column_width';
                                } else if (currentTrackDragMode === 'spacing') {
                                    resolvedDragType = (hit.colIndex === 0) ? 'column_start' : 'column_spacing';
                                } else {
                                    // auto: 靠近右侧边缘或在白色加粗手柄区域拉伸宽度，主体区域左右拖动调整间距/位置
                                    resolvedDragType = isRightEdge ? 'column_width' : ((hit.colIndex === 0) ? 'column_start' : 'column_spacing');
                                }

                                if (resolvedDragType === 'column_width') {
                                    const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, hit.colIndex);
                                    initialVal = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;
                                } else if (resolvedDragType === 'column_spacing') {
                                    const spacingIdx = hit.colIndex - 1;
                                    const rawSRes = getManiaSkinConfig(keys, LML.ColumnSpacing, spacingIdx);
                                    initialVal = (rawSRes && rawSRes.value != null) ? rawSRes.value : 0;
                                } else if (resolvedDragType === 'column_start') {
                                    const colStartRes = getManiaSkinConfig(keys, LML.ColumnStart);
                                    initialVal = (colStartRes && colStartRes.value != null) ? colStartRes.value : 136;
                                }
                            } else if (resolvedDragType === 'key_image_height') {
                                keyImageHeightTarget = collectKeyImageHeightTarget(keys, hit.colIndex);
                                keyImageDownHeightTarget = collectKeyImageDownHeightTarget(keys, hit.colIndex);
                                initialVal = keyImageHeightTarget ? keyImageHeightTarget.initialOffset1x : 0;
                                const ratio = hit.keyImageIs2x ? 2 : 1;
                                const stableRefW = hit.keyImageStableRefWidth || (30 * 1.6 * ratio);
                                keyImageLogicalPxPerCanvasPx = stableRefW / Math.max(1, hit.w) / ratio;
                            } else if (hit.dragType === 'score_percent_width') {
                                initialVal = getScorePercentPaddingWidth(keys);
                            } else if (hit.dragType === 'lighting_width') {
                                // 打击特效宽度：宽度存在 cfg.ExplosionWidth / cfg.HoldNoteLightWidth 数组里，
                                // 不能像普通数值参数那样直接取 cfg[paramKey]（那会拿到整个数组）。
                                // 未显式配置时从「实际生效值 = 当前列宽」起拖，保证起始宽度不跳变。
                                initialVal = (hit.lightWidthValue != null) ? hit.lightWidthValue : 30;
                                // 判断抓取的是左边缘还是右边缘：向外拖 = 放大，向内拖 = 缩小
                                resizeEdge = (mouseX < hit.x + hit.w / 2) ? 'left' : 'right';
                            } else {
                                if (cfg[hit.paramKey] != null) {
                                    initialVal = cfg[hit.paramKey];
                                } else if (hit.paramKey === 'HitPosition') {
                                    initialVal = 402;
                                } else if (hit.paramKey === 'ScorePosition') {
                                    initialVal = 300;
                                } else if (hit.paramKey === 'ComboPosition') {
                                    initialVal = 111;
                                } else if (hit.paramKey === 'LightPosition') {
                                    initialVal = 413;
                                } else if (hit.paramKey === 'ColumnStart') {
                                    initialVal = 136;
                                } else {
                                    initialVal = 0;
                                }
                            }

                            canvasDragState = {
                                element: hit,
                                dragType: resolvedDragType,
                                startMouseX: mouseX,
                                startMouseY: mouseY,
                                initialVal: initialVal,
                                resizeEdge: resizeEdge,
                                keys: keys,
                                keyImageHeightTarget: keyImageHeightTarget,
                                keyImageDownHeightTarget: keyImageDownHeightTarget,
                                keyImageLogicalPxPerCanvasPx: keyImageLogicalPxPerCanvasPx,
                                currentOffset1x: initialVal
                            };
                        }
                        drawFrame();
                    } else {
                        selectedCanvasElement = null;
                        const card = document.getElementById('canvasSelectedCard');
                        if (card) card.style.display = 'none';
                        drawFrame();
                    }
                });

                window.addEventListener('mousemove', (e) => {
                    if (!canvas || !canvasEditMode) return;
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    const mouseX = (e.clientX - rect.left) * scaleX;
                    const mouseY = (e.clientY - rect.top) * scaleY;
                    const scale48 = canvas.height / 480;

                    if (isDraggingCanvasElement && canvasDragState) {
                        if (!canvasDragState.hasMoved) {
                            canvasDragState.hasMoved = true;
                            recordSkinUndoBeforeChange(`画布拖拽: ${canvasDragState.element.name || canvasDragState.dragType}`);
                        }
                        const elem = canvasDragState.element;
                        let cfg = maniaSkinConfigurations.get(canvasDragState.keys);
                        if (!cfg) {
                            // 只导入谱面（内置默认皮肤）时这里会走到：必须补一份**完整**配置，
                            // 否则残缺配置写回后 getManiaSkinConfig 读 cfg.ColumnWidth.length 会崩。
                            cfg = ensureManiaConfigForKeys(canvasDragState.keys);
                        }

                        const tooltip = document.getElementById('canvasDragTooltip');
                        const dragType = canvasDragState.dragType;

                        if (dragType === 'key_image_height') {
                            const deltaY = canvasDragState.startMouseY - mouseY;
                            const nextOffset1x = canvasDragState.initialVal +
                                deltaY * (canvasDragState.keyImageLogicalPxPerCanvasPx || 1);
                            const magnet = resolveKeyImageHeightMagnet(canvasDragState, nextOffset1x, scale48);
                            updateKeyImageHeightPreview(canvasDragState, magnet.offset1x, canvasDragState.keys);
                            if (tooltip) {
                                const offset = canvasDragState.currentOffset1x;
                                const offsetText = offset >= 0
                                    ? `底部透明 +${offset}px`
                                    : `裁短 ${Math.abs(offset)}px`;
                                const magnetText = magnet.magnetCol != null
                                    ? ` | 已吸附第 ${magnet.magnetCol + 1} 轨`
                                    : '';
                                tooltip.textContent = `按键高度: ${offsetText} (1x)${magnetText}`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'column_width') {
                            const col = elem.colIndex;
                            if (!Array.isArray(cfg.ColumnWidth)) {
                                cfg.ColumnWidth = new Array(canvasDragState.keys).fill(30);
                            }
                            while (cfg.ColumnWidth.length < canvasDragState.keys) {
                                cfg.ColumnWidth.push(30);
                            }
                            const deltaX = (mouseX - canvasDragState.startMouseX) / scale48;
                            let newW = Math.max(5, Math.min(300, Math.round(canvasDragState.initialVal + deltaX)));
                            // 轨道区最大总宽度保护：拖到上限即停住并提示
                            const boundDragW = getTrackParamUpperBound(cfg, canvasDragState.keys, 'ColumnWidth', col);
                            if (newW > boundDragW.maxAllowed) {
                                newW = Math.max(5, Math.floor(boundDragW.maxAllowed));
                                notifyTrackWidthLimit(`第 ${col + 1} 轨列宽`);
                            }
                            cfg.ColumnWidth[col] = newW;
                            syncColumnRightFromLayout(cfg, canvasDragState.keys);
                            if (tooltip) {
                                tooltip.textContent = `第 ${col + 1} 轨宽度: ${newW}px (480p)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue('ColumnWidth', cfg.ColumnWidth);
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'column_spacing') {
                            const spacingIdx = elem.colIndex - 1;
                            const spacingCount = Math.max(0, canvasDragState.keys - 1);
                            if (!Array.isArray(cfg.ColumnSpacing)) {
                                cfg.ColumnSpacing = new Array(spacingCount).fill(0);
                            }
                            while (cfg.ColumnSpacing.length < spacingCount) {
                                cfg.ColumnSpacing.push(0);
                            }
                            const deltaX = (mouseX - canvasDragState.startMouseX) / scale48;
                            // 核心要求：两个轨道之间的最小间距为 0！
                            let newS = Math.max(0, Math.min(200, Math.round(canvasDragState.initialVal + deltaX)));
                            // 轨道区最大总宽度保护：拖到上限即停住并提示
                            const boundDragS = getTrackParamUpperBound(cfg, canvasDragState.keys, 'ColumnSpacing', spacingIdx);
                            if (newS > boundDragS.maxAllowed) {
                                newS = Math.max(0, Math.floor(boundDragS.maxAllowed));
                                notifyTrackWidthLimit(`第 ${spacingIdx + 1} 轨与第 ${spacingIdx + 2} 轨间距`);
                            }
                            cfg.ColumnSpacing[spacingIdx] = newS;
                            syncColumnRightFromLayout(cfg, canvasDragState.keys);
                            if (tooltip) {
                                tooltip.textContent = `第 ${spacingIdx + 1} 轨与第 ${spacingIdx + 2} 轨间距: ${newS}px (最小: 0)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue('ColumnSpacing', cfg.ColumnSpacing);
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'column_start') {
                            const deltaX = (mouseX - canvasDragState.startMouseX) / scale48;
                            const newStart = Math.max(-200, Math.min(600, Math.round(canvasDragState.initialVal + deltaX)));
                            cfg.ColumnStart = newStart;
                            syncColumnRightFromLayout(cfg, canvasDragState.keys);
                            if (tooltip) {
                                tooltip.textContent = `整体轨道起始位置 ColumnStart: ${newStart}px | 靠右偏移 ColumnRight: ${cfg.ColumnRight}px`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue('ColumnStart', newStart);
                            syncParamInputValue('ColumnRight', cfg.ColumnRight);
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'score_percent_width') {
                            // 饼图向左右移动多少，就通过百分号垫片宽度反向换算多少：
                            // accLeftX = accRightX - ... - scorePercentWidth * 0.576 * scale768。
                            const accScale = 0.576 * (canvas.height / 768);
                            const deltaCanvas = mouseX - canvasDragState.startMouseX;
                            const nextWidth = clampScorePercentPaddingWidth(canvasDragState.initialVal - deltaCanvas / accScale);
                            setScorePercentPaddingWidth(nextWidth, canvasDragState.keys);
                            if (tooltip) {
                                tooltip.textContent = `准度位置: score-percent 宽度 ${nextWidth}px (1x)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue('ScorePercentWidth', nextWidth);
                            syncParamInputValue('ScorePercentVisible', false);
                            syncCanvasSelectedCard(elem);
                        } else if (dragType === 'lighting_width') {
                            // 打击特效宽度拖拽：只改宽度，绝不改位置（位置被判定线 + 轨道中心锁死）
                            const col = elem.colIndex;
                            const widthKey = elem.paramKey; // 'ExplosionWidth' | 'HoldNoteLightWidth'
                            if (!Array.isArray(cfg[widthKey])) cfg[widthKey] = new Array(canvasDragState.keys).fill(0);
                            while (cfg[widthKey].length < canvasDragState.keys) cfg[widthKey].push(0);

                            // 按「该贴图 1px 宽度对应的画布像素」换算，拖拽时框边与鼠标严格 1:1 跟随
                            const pxPerUnit = (elem.pxPerUnit > 0) ? elem.pxPerUnit : scale48;
                            const deltaCanvas = mouseX - canvasDragState.startMouseX;
                            // 抓左边缘：向左拖 (deltaCanvas<0) 即向外 → 放大；抓右边缘：向右拖即向外 → 放大。
                            // 归纳起来就是「向外拉 = 放大，向内拉 = 缩小」，两个边缘都支持拉伸。
                            const outwardDelta = (canvasDragState.resizeEdge === 'left') ? -deltaCanvas : deltaCanvas;
                            let newW = Math.round(canvasDragState.initialVal + outwardDelta / pxPerUnit);
                            newW = Math.max(0, Math.min(300, newW));
                            cfg[widthKey][col] = newW;

                            if (tooltip) {
                                tooltip.textContent = `${elem.name}: ${newW}px${newW === 0 ? ' (0 = 跟随列宽)' : ''}`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue(widthKey, cfg[widthKey]);
                            syncCanvasSelectedCard(elem);
                        } else if (elem.dragAxis === 'y') {
                            const deltaY = (mouseY - canvasDragState.startMouseY) / scale48;
                            const udRes = getManiaSkinConfig(canvasDragState.keys, LML.UpsideDown);
                            const isUpsideDown = (udRes && (udRes.value === true || udRes.value === 1 || udRes.value === '1'));
                            const effectiveDeltaY = isUpsideDown ? -deltaY : deltaY;
                            const newVal = Math.max(0, Math.min(480, Math.round(canvasDragState.initialVal + effectiveDeltaY)));
                            cfg[elem.paramKey] = newVal;
                            if (elem.paramKey === 'ScorePosition') {
                                scorePosFromSkin = (isUpsideDown ? (480 - newVal) : newVal) * scale48;
                            }
                            if (tooltip) {
                                tooltip.textContent = `${elem.name}: ${newVal} (480p)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue(elem.paramKey, newVal);
                            syncCanvasSelectedCard(elem);
                        } else if (elem.dragAxis === 'x') {
                            const deltaX = (mouseX - canvasDragState.startMouseX) / scale48;
                            const newVal = Math.max(-200, Math.min(600, Math.round(canvasDragState.initialVal + deltaX)));
                            cfg[elem.paramKey] = newVal;
                            if (tooltip) {
                                tooltip.textContent = `${elem.name}: ${newVal} (480p)`;
                                tooltip.style.left = `${(e.clientX - rect.left) + 16}px`;
                                tooltip.style.top = `${(e.clientY - rect.top) - 32}px`;
                                tooltip.style.display = 'block';
                            }
                            drawFrame();
                            syncParamInputValue(elem.paramKey, newVal);
                            syncCanvasSelectedCard(elem);
                        }
                    } else {
                        // 鼠标悬停改变指针图标 (同样遵循分级检测原则)
                        let hoverHit = null;
                        let hoveringKeyImageHeightHandle = false;
                        const curKeys = getActiveKeyCount();
                        const mCfg = maniaSkinConfigurations.get(curKeys) || getManiaConfigForKeys(curKeys) || {};
                        const curHitPos = mCfg.HitPosition != null ? (mCfg.HitPosition * (canvas.height / 480)) : (402 * (canvas.height / 480));

                        if (!hoverHit) {
                            const handlePad = Math.max(8, 12 * (canvas.height / 480));
                            for (const item of canvasInteractiveElements) {
                                if (!item.id.startsWith('key_') || !item.keyImageHeightAdjustable ||
                                    item.keyImageResizeEdgeY == null) continue;
                                if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                    Math.abs(mouseY - item.keyImageResizeEdgeY) <= handlePad) {
                                    hoverHit = item;
                                    hoveringKeyImageHeightHandle = true;
                                    break;
                                }
                            }
                        }

                        // 阶段 0: 优先检测当前已选中轨道的右边缘拉伸控制条 (白色加粗高亮区域及其右边缘)
                        if (!hoverHit && selectedCanvasElement && selectedCanvasElement.id.startsWith('track_col_')) {
                            const selElem = selectedCanvasElement;
                            const pad = 6;
                            const rightHandleX = selElem.x + selElem.w + pad;
                            const isOverRightHandle = (mouseX >= selElem.x + selElem.w - 14 && mouseX <= rightHandleX + 12 &&
                                                       mouseY >= selElem.y - 10 && mouseY <= selElem.y + selElem.h + 10);
                            if (isOverRightHandle) {
                                hoverHit = selElem;
                            }
                        }

                        // 阶段 0.5: 打击特效 (LightingN / LightingL) —— 与 mousedown 命中顺序保持一致，
                        // 优先级高于判定线，保证点在可见特效上时选中特效本身
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                            if (item.dragType !== 'lighting_width') continue;
                            const lwPad = (selectedCanvasElement && selectedCanvasElement.id === item.id) ? 8 : 0;
                            if (mouseX >= item.x - lwPad && mouseX <= item.x + item.w + lwPad &&
                                mouseY >= item.y - lwPad && mouseY <= item.y + item.h + lwPad) {
                                hoverHit = item;
                                break;
                            }
                            }
                        }

                        // 阶段 1: 判定线与按键发光位置，按「就近中心线」归属（与 mousedown 一致）
                        if (!hoverHit) {
                            const hp = canvasInteractiveElements.find(el => el.id === 'hitPosition');
                            const lp = canvasInteractiveElements.find(el => el.id === 'lightPosition');
                            const containsRect = (r) => r && mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
                            const lightHandle = lp ? {
                                x: lp.x,
                                y: (lp.handleY != null) ? lp.handleY : lp.y,
                                w: lp.w,
                                h: (lp.handleH != null) ? lp.handleH : lp.h
                            } : null;
                            const inHit = containsRect(hp);
                            const inLight = containsRect(lightHandle);
                            if (inHit && inLight) {
                                const hitLineY = (hp.lineY != null) ? hp.lineY : (hp.y + hp.h / 2);
                                const lightLineY = (lp.lineY != null) ? lp.lineY : (lightHandle.y + lightHandle.h / 2);
                                const dHit = Math.abs(mouseY - hitLineY);
                                const dLight = Math.abs(mouseY - lightLineY);
                                if (dLight < dHit) hoverHit = lp;
                                else if (dHit < dLight) hoverHit = hp;
                                else hoverHit = (mouseY <= lightLineY) ? lp : hp;
                            } else if (inHit) {
                                hoverHit = hp;
                            } else if (inLight) {
                                hoverHit = lp;
                            }
                        }

                        // 阶段 1.1: 连击数、判定提示、血条与 HUD
                        if (!hoverHit) {
                            const priorityHoverElements = ['combo', 'judgement', 'healthDisplay'];
                            for (const pId of priorityHoverElements) {
                                const item = canvasInteractiveElements.find(el => el.id === pId);
                                if (item && mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                    hoverHit = item;
                                    break;
                                }
                            }
                        }
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                                if (item.id.startsWith('hud_')) {
                                    const pad = 3;
                                    if (mouseX >= item.x - pad && mouseX <= item.x + item.w + pad && mouseY >= item.y - pad && mouseY <= item.y + item.h + pad) {
                                        hoverHit = item;
                                        break;
                                    }
                                }
                            }
                        }

                        // 阶段 2: 判定线以上的音符优先
                        // 播放过程中不能选取/悬停 note 与长条相关元素
                        // 与 mousedown 保持一致：逆序查找并就近判定，防止同轨上有多个 note 时悬停在上方却高亮下方
                        if (!hoverHit && !isPlaying && mouseY < curHitPos) {
                            let bestHover = null;
                            let minHoverDist = Infinity;
                            for (let i = canvasInteractiveElements.length - 1; i >= 0; i--) {
                                const item = canvasInteractiveElements[i];
                                if (item.id.startsWith('note_') || item.id.startsWith('hold_')) {
                                    if (mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                        const centerY = item.y + item.h / 2;
                                        const dist = Math.abs(mouseY - centerY);
                                        if (dist < minHoverDist) {
                                            minHoverDist = dist;
                                            bestHover = item;
                                        }
                                    }
                                }
                            }
                            if (bestHover) {
                                hoverHit = bestHover;
                            }
                        }

                        // 阶段 2.5: 可见光柱本体 (StageLight) —— 与 mousedown 一致，排在音符之后、按键之前
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                                if (item.id !== 'lightPosition') continue;
                                if (item.visibleY == null || !(item.visibleH > 0)) continue;
                                if (mouseX >= item.x && mouseX <= item.x + item.w &&
                                    mouseY >= item.visibleY && mouseY <= item.visibleY + item.visibleH) {
                                    hoverHit = item;
                                    break;
                                }
                            }
                        }

                        // 阶段 3: 底座按键 (key_0..key_N)
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                                if (item.id.startsWith('key_')) {
                                    if (mouseX >= item.x && mouseX <= item.x + item.w && mouseY >= item.y && mouseY <= item.y + item.h) {
                                        hoverHit = item;
                                        break;
                                    }
                                }
                            }
                        }

                        // 阶段 4: 各列独立轨道 (track_col_0..N)
                        if (!hoverHit) {
                            for (const item of canvasInteractiveElements) {
                                if (item.id.startsWith('track_col_')) {
                                    const pad = (selectedCanvasElement && selectedCanvasElement.id === item.id) ? 12 : 6;
                                    if (mouseX >= item.x && mouseX <= item.x + item.w + pad && mouseY >= item.y && mouseY <= item.y + item.h) {
                                        hoverHit = item;
                                        break;
                                    }
                                }
                            }
                        }

                        if (hoverHit) {
                            if (hoveringKeyImageHeightHandle) {
                                canvas.style.cursor = 'ns-resize';
                            } else if (hoverHit.id.startsWith('track_col_')) {
                                const pad = 6;
                                const rightHandleX = hoverHit.x + hoverHit.w + pad;
                                // 判定是否在右边缘或者白色加粗控制条手柄区域 (包括白色高亮外延)
                                const isRightEdge = (mouseX >= (hoverHit.x + hoverHit.w - 14) && mouseX <= (rightHandleX + 12));
                                if (currentTrackDragMode === 'width') {
                                    canvas.style.cursor = 'ew-resize';
                                } else if (currentTrackDragMode === 'spacing') {
                                    canvas.style.cursor = 'grab';
                                } else {
                                    canvas.style.cursor = isRightEdge ? 'col-resize' : 'grab';
                                }
                            } else if (hoverHit.dragAxis === 'y') {
                                canvas.style.cursor = 'ns-resize';
                            } else if (hoverHit.dragAxis === 'x') {
                                canvas.style.cursor = 'ew-resize';
                            } else {
                                canvas.style.cursor = 'pointer';
                            }
                        } else {
                            canvas.style.cursor = 'default';
                        }
                    }
                });

                window.addEventListener('mouseup', () => {
                    if (isDraggingCanvasElement) {
                        const finishedDragState = canvasDragState;
                        isDraggingCanvasElement = false;
                        canvasDragState = null;
                        continuousActionActive = false;
                        const tooltip = document.getElementById('canvasDragTooltip');
                        if (tooltip) tooltip.style.display = 'none';
                        if (selectedCanvasElement) {
                            syncCanvasSelectedCard(selectedCanvasElement);
                        }
                        if (finishedDragState && finishedDragState.dragType === 'key_image_height' &&
                            finishedDragState.hasMoved && finishedDragState.keyImageHeightTarget) {
                            const persistGeneration = ++keyImageHeightPersistGeneration;
                            const targets = [finishedDragState.keyImageHeightTarget];
                            if (finishedDragState.keyImageDownHeightTarget) {
                                targets.push(finishedDragState.keyImageDownHeightTarget);
                            }
                            void persistKeyImageHeightTargets(targets, persistGeneration)
                                .then((applied) => {
                                    if (!applied) return;
                                    const offset = finishedDragState.currentOffset1x;
                                    const offsetText = offset >= 0
                                        ? `底部透明 +${offset}px`
                                        : `裁短 ${Math.abs(offset)}px`;
                                    showToast('按键高度已调整',
                                        `第 ${finishedDragState.element.colIndex + 1} 轨: ${offsetText}`);
                                })
                                .catch((err) => {
                                    console.error('保存按键高度调整失败', err);
                                    showToast('按键高度保存失败', err.message || '未知错误');
                                });
                        }
                    }
                });
            }
        }
