// ============================================================================
// frame-lighting.js - 帧内 LightingN 与 LightingL 打击特效
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        function renderLightingEffects(context) {
            const {
                ctx, isPreviewMode, notesList, currentTime, keys, colXCache, colWidths,
                scale768, scale48, canvasEditMode, selectedCanvasElement,
                activeExplosions, effectAnimClockMs, lightPosY, lightFps, rectTop
            } = context;
            const activeLightingBoxes = [];
            const pushLightingBox = (kind, col, drawW, drawH) => {
                const colX = colXCache[col];
                const colW = colWidths[col] || colWidths[0];
                const cx = colX + colW / 2;
                activeLightingBoxes.push({
                    kind: kind, col: col,
                    x: cx - drawW / 2,
                    y: rectTop(lightPosY - drawH / 2, drawH),
                    w: drawW, h: drawH
                });
            };

            // 渲染 LightingL: 当前正在按住的长条（对齐 osu!lazer LegacySkin / HoldNoteLightScale）
            if (!isPreviewMode) {
                for (let i = 0; i < notesList.length; i++) {
                    const note = notesList[i];
                    if (!note.isHold) continue;
                    if (currentTime >= note.startTime && currentTime <= note.endTime) {
                        const col = note.column;
                        const frames = getManiaSkinAnimationFrames(keys, LML.HoldNoteLightImage, col);
                        let drewLight = false;
                        if (frames && frames.length > 0) {
                            const frameIdx = Math.floor(((currentTime - note.startTime) / 1000) * lightFps) % frames.length;
                            const img = frames[frameIdx];
                            if (img && img.width > 0 && img.height > 0) {
                                const colX = colXCache[col];
                                const colW = colWidths[col] || colWidths[0];
                                // 对齐 osu!lazer: HoldNoteLightScale 缩放 (LightingLWidth / 30 或 ColumnWidth / 30)
                                const hlsRes = getManiaSkinConfig(keys, LML.HoldNoteLightScale, col);
                                const holdLightScale = (hlsRes && hlsRes.value > 0) ? hlsRes.value : 1.0;
                                const is2x = !!img._is2x;
                                const nativeW = is2x ? img.width / 2 : img.width;
                                const nativeH = is2x ? img.height / 2 : img.height;
                                const drawW = nativeW * scale768 * holdLightScale;
                                const drawH = nativeH * scale768 * holdLightScale;
                                const cx = colX + colW / 2;

                                ctx.save();
                                ctx.globalCompositeOperation = 'lighter';
                                ctx.globalAlpha = 0.9;
                                ctx.drawImage(img, cx - drawW / 2, lightPosY - drawH / 2, drawW, drawH);
                                ctx.restore();
                                if (canvasEditMode) pushLightingBox('LightingL', col, drawW, drawH);
                                drewLight = true;
                            }
                        }
                        // 皮肤里没有 LightingL 贴图时，仍按 30px 等效尺寸登记可点选区域，便于导入贴图
                        if (!drewLight && canvasEditMode) {
                            const fb = 30 * scale48;
                            pushLightingBox('LightingL', col, fb, fb);
                        }
                    }
                }
            }

            // 渲染 LightingN: 单键命中爆炸特效 (对齐 osu!lazer LegacyHitExplosion 与 ExplosionScale)
            // 用特效动画时钟而非 performance.now()：暂停时 elapsed 不再增长，
            // 爆炸特效会定格在暂停那一刻（否则 200ms 后就消失，根本来不及点选）。
            const now = effectAnimClockMs;

            for (let i = activeExplosions.length - 1; i >= 0; i--) {
                const exp = activeExplosions[i];
                const elapsed = now - exp.hitTime;
                if (elapsed < 0 || elapsed > exp.duration) {
                    activeExplosions.splice(i, 1);
                    continue;
                }

                const col = exp.column;
                const frames = getManiaSkinAnimationFrames(keys, LML.ExplosionImage, col);
                if (!frames || frames.length === 0) {
                    // 皮肤里没有 LightingN 贴图时，仍按 30px 等效尺寸登记可点选区域，便于导入贴图
                    if (canvasEditMode) {
                        const fb = 30 * scale48;
                        pushLightingBox('LightingN', col, fb, fb);
                    }
                    continue;
                }

                // 对齐 osu!lazer: FadeInFromZero(80) -> FadeOut(120), 寿命 200ms
                let alpha = 1.0;
                if (elapsed < 80) {
                    alpha = Math.min(1.0, elapsed / 80.0);
                } else {
                    alpha = Math.max(0.0, 1.0 - (elapsed - 80.0) / 120.0);
                }

                let img = null;
                if (frames.length === 1) {
                    img = frames[0];
                } else {
                    // 对齐 osu!lazer LegacyHitExplosion: frameLength = Math.Max(1000 / 60.0, 170.0 / frameCount)
                    const frameLength = Math.max(1000 / 60.0, 170.0 / frames.length);
                    const frameIdx = Math.floor(elapsed / frameLength);
                    if (frameIdx >= frames.length) {
                        img = frames[frames.length - 1];
                    } else {
                        img = frames[frameIdx];
                    }
                }
                if (img && img.width > 0 && img.height > 0) {
                    const colX = colXCache[col];
                    const colW = colWidths[col] || colWidths[0];
                    // 对齐 osu!lazer: ExplosionScale 缩放 (LightingNWidth / 30 或 ColumnWidth / 30)
                    const expScaleRes = getManiaSkinConfig(keys, LML.ExplosionScale, col);
                    const explosionScale = (expScaleRes && expScaleRes.value > 0) ? expScaleRes.value : 1.0;
                    const is2x = !!img._is2x;
                    const nativeW = is2x ? img.width / 2 : img.width;
                    const nativeH = is2x ? img.height / 2 : img.height;
                    const drawW = nativeW * scale768 * explosionScale;
                    const drawH = nativeH * scale768 * explosionScale;
                    const cx = colX + colW / 2;

                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(img, cx - drawW / 2, lightPosY - drawH / 2, drawW, drawH);
                    ctx.restore();
                    if (canvasEditMode) pushLightingBox('LightingN', col, drawW, drawH);
                }
            }

            // 选中打击特效元素时，常驻渲染一帧该特效，方便实时观察宽度调整效果。
            // 仅当本帧该轨该特效尚未被激活渲染时才补充，避免重复绘制。
            if (canvasEditMode && selectedCanvasElement &&
                selectedCanvasElement.dragType === 'lighting_width' && selectedCanvasElement.colIndex != null) {
                const selCol = selectedCanvasElement.colIndex;
                const selKind = (selectedCanvasElement.textureParamKey === 'LightingL') ? 'LightingL' : 'LightingN';
                const alreadyActive = activeLightingBoxes.some(b => b.kind === selKind && b.col === selCol);
                if (!alreadyActive) {
                    const selLookup = (selKind === 'LightingL') ? LML.HoldNoteLightImage : LML.ExplosionImage;
                    const selScaleLookup = (selKind === 'LightingL') ? LML.HoldNoteLightScale : LML.ExplosionScale;
                    const selFrames = getManiaSkinAnimationFrames(keys, selLookup, selCol);
                    const selImg = (selFrames && selFrames.length > 0) ? selFrames[0] : getManiaSkinImage(keys, selLookup, selCol);
                    if (selImg && selImg.width > 0 && selImg.height > 0) {
                        const selScaleRes = getManiaSkinConfig(keys, selScaleLookup, selCol);
                        const selScale = (selScaleRes && selScaleRes.value > 0) ? selScaleRes.value : 1.0;
                        const is2x = !!selImg._is2x;
                        const nativeW = is2x ? selImg.width / 2 : selImg.width;
                        const nativeH = is2x ? selImg.height / 2 : selImg.height;
                        const drawW = nativeW * scale768 * selScale;
                        const drawH = nativeH * scale768 * selScale;
                        const colX = colXCache[selCol];
                        const colW = colWidths[selCol] || colWidths[0];
                        const cx = colX + colW / 2;
                        ctx.save();
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.globalAlpha = 0.85;
                        ctx.drawImage(selImg, cx - drawW / 2, lightPosY - drawH / 2, drawW, drawH);
                        ctx.restore();
                        pushLightingBox(selKind, selCol, drawW, drawH);
                    } else {
                        const fb = 30 * scale48;
                        pushLightingBox(selKind, selCol, fb, fb);
                    }
                }
            }
            return activeLightingBoxes;
        }
