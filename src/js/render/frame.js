// ============================================================================
// frame.js - 主 Canvas 帧绘制：背景、轨道、音符、长条与特效
// 依赖：render/textures.js、render/combo.js、core/state.js
// ============================================================================

        // osu!stable 长条时间锚点：
        // - 头部贴图下端在 startTime 对应位置；按住后固定在判定线。
        // - 尾部贴图下端在 endTime 对应位置。
        function getStableHoldHeadAnchorY(note, currentScrollPosition, currentTime, hitPos, speedFactor) {
            if (currentTime < note.startTime) {
                return hitPos - (note.scrollPositionStart - currentScrollPosition) * speedFactor;
            }
            return hitPos;
        }

        function getStableHoldTailAnchorY(note, currentScrollPosition, hitPos, speedFactor) {
            return hitPos - (note.scrollPositionEnd - currentScrollPosition) * speedFactor;
        }

        // 身体长度只等于头尾两个下端锚点之间的距离，不包含头部半高，也不受尾巴顶端影响。
        // 身体近端位于头部贴图中心，因此远端自然为“尾端锚点 - 头部半高”。
        function getStableHoldNoteGeometry(note, currentScrollPosition, currentTime, hitPos, speedFactor, headHeight, tailHeight) {
            const headAnchorY = getStableHoldHeadAnchorY(
                note, currentScrollPosition, currentTime, hitPos, speedFactor
            );
            const tailAnchorY = getStableHoldTailAnchorY(
                note, currentScrollPosition, hitPos, speedFactor
            );
            const headTopY = headAnchorY - headHeight;
            const headCenterY = headAnchorY - headHeight / 2;
            const tailTopY = tailAnchorY - tailHeight;
            const bodyBottomY = headCenterY;
            const bodyLength = Math.max(0, headAnchorY - tailAnchorY);
            const bodyTopY = bodyBottomY - bodyLength;

            return {
                headAnchorY,
                headTopY,
                headCenterY,
                tailAnchorY,
                tailTopY,
                bodyTopY,
                bodyBottomY,
                bodyLength,
                bodyHeight: Math.max(0, bodyBottomY - bodyTopY),
                headFrozen: currentTime >= note.startTime
            };
        }

        // NoteBodyStyle 只负责身体矩形内部的贴图取样方式，不改变身体矩形本身。
        function drawStableHoldBodyTexture(targetCtx, image, style, x, width, bodyTopY, bodyHeight) {
            if (!image || width <= 0 || bodyHeight <= 0.5) return;

            const nativeW = image.width || 1;
            const nativeH = image.height || 1;
            const scaledNativeH = Math.max(1, nativeH * (width / nativeW));
            const bodyBottomY = bodyTopY + bodyHeight;

            targetCtx.save();
            targetCtx.beginPath();
            targetCtx.rect(x, bodyTopY, width, bodyHeight);
            targetCtx.clip();

            if (style === NOTE_BODY_STYLE.Stretch) {
                targetCtx.drawImage(image, x, bodyTopY, width, bodyHeight);
            } else if (style === NOTE_BODY_STYLE.RepeatTopAndBottom) {
                for (let y = bodyTopY; y < bodyBottomY; y += scaledNativeH) {
                    targetCtx.drawImage(image, x, y, width, scaledNativeH);
                }
                for (let y = bodyBottomY; y > bodyTopY; y -= scaledNativeH) {
                    targetCtx.drawImage(image, x, y - scaledNativeH, width, scaledNativeH);
                }
            } else if (style === NOTE_BODY_STYLE.RepeatFromHead) {
                for (let y = bodyBottomY; y > bodyTopY; y -= scaledNativeH) {
                    targetCtx.drawImage(image, x, y - scaledNativeH, width, scaledNativeH);
                }
            } else {
                for (let y = bodyTopY; y < bodyBottomY; y += scaledNativeH) {
                    targetCtx.drawImage(image, x, y, width, scaledNativeH);
                }
            }

            targetCtx.restore();
        }

        function drawFrame() {
            // 纯皮肤预览（无谱面）时若渲染了多帧贴图，需要在函数末尾保持 rAF 循环，动画才会真正播放。
            let skinFrameAnimationActive = false;
            try {
                // 特效动画时钟：播放时前进、暂停时冻结（见 config.js updateEffectAnimClock）
                updateEffectAnimClock();
                if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
                    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                        canvas.width = canvas.clientWidth;
                        canvas.height = canvas.clientHeight;
                    }
                }
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                let currentTime = 0;
                if (currentBeatmap) {
                    const playbackTime = (isSeeking && ui.progressRange)
                        ? parseFloat(ui.progressRange.value)
                        : getPlaybackTimeSeconds();
                    currentTime = playbackTime * 1000;
                    syncStoryboardVideoToTime(currentTime, isPlaying);
                    if (!isSeeking && isPlaying && ui.progressRange) {
                        ui.progressRange.value = playbackTime;
                        const totalDuration = (audio.duration && isFinite(audio.duration) && audio.duration > 0)
                            ? audio.duration
                            : parseFloat(ui.progressRange.max) || 0;
                        updateTimeLabels(playbackTime, totalDuration);
                        updateProgressFill(playbackTime, totalDuration);
                    }
                }

                // ---- 背景渲染、淡入淡出过渡动画与背景暗化 ----
                let hasStoryboardBackground = false;
                if (hasCanvasBg && canvasBgImage && canvasBgImage.complete) {
                    const elapsed = performance.now() - bgFadeStartTime;
                    const fadeProgress = Math.min(1.0, Math.max(0, elapsed / BG_FADE_DURATION));
                    const isFading = (fadeProgress < 1.0);

                    // 1. 若处于切换过渡中且有上一张背景，先以 (1 - fadeProgress) 淡出上一张背景图
                    if (isFading && prevCanvasBgImage && prevCanvasBgImage.complete) {
                        ctx.save();
                        ctx.globalAlpha = 1.0 - fadeProgress;
                        drawCoverImage(ctx, prevCanvasBgImage, canvas.width, canvas.height);
                        ctx.restore();
                    }

                    // 2. 绘制当前新背景图 (若处于淡入中，透明度为 fadeProgress)
                    const currentAlpha = isFading ? fadeProgress : 1.0;
                    ctx.save();
                    ctx.globalAlpha = currentAlpha;
                    drawCoverImage(ctx, canvasBgImage, canvas.width, canvas.height);
                    ctx.restore();

                    // 如果暂停状态下背景淡入淡出过渡尚未完成，继续请求动画帧驱动过渡
                    if (!isPlaying && isFading) {
                        cancelAnimationFrame(animationId);
                        animationId = requestAnimationFrame(drawFrame);
                    } else if (!isFading) {
                        prevCanvasBgImage = null;
                    }
                }

                hasStoryboardBackground = drawStoryboardComposite(
                    ctx,
                    currentTime,
                    canvas.width,
                    canvas.height
                );

                // 背景暗化统一作用于静态图、视频和故事板背景。
                const dimFactor = Math.min(1.0, Math.max(0, bgDim / 100));
                const hasBackgroundContent = hasCanvasBg || hasStoryboardBackground ||
                    !!(storyboardPlaybackState && storyboardPlaybackState.elements.length > 0);
                if (hasBackgroundContent && dimFactor > 0) {
                    ctx.fillStyle = `rgba(0, 0, 0, ${dimFactor})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }

                let keys;
                let notesList = activeNotes;
                isPreviewMode = false;

                if (currentBeatmap) {
                    keys = Math.round(currentBeatmap.difficulty.circleSize);
                } else if (skinImageStore.size > 0 || skinFallbackImageStore.size > 0 || maniaSkinConfigurations.size > 0) {
                    isPreviewMode = true;
                    if (activeEditorKeyCount) {
                        keys = activeEditorKeyCount;
                    } else if (maniaSkinConfigurations.has(4)) {
                        keys = 4;
                    } else if (maniaSkinConfigurations.size > 0) {
                        keys = maniaSkinConfigurations.keys().next().value || 4;
                    } else {
                        keys = 4;
                    }
                } else {
                    // 未导入谱面且未导入自定义皮肤，保持纯净背景，不渲染默认预览舞台
                    return;
                }

                // skin.ini 坐标体系基于 480 虚拟网格 (HitPosition, ColumnWidth 等)，而贴图资源原生基于 768p (1x) / 1536p (2x) 分辨率
                const scale48 = canvas.height / 480;
                const scale768 = canvas.height / 768;

                // LegacyNotePiece 序列帧使用 [General] AnimationFramerate，并以所属 HitObject 的
                // AnimationStartTime (StartTime - 10000ms) 为相位原点。
                // 纯皮肤预览同样走这条时间轴；虚拟时钟只负责在无谱面时持续前进。
                const skinAnimationFps = getSkinAnimationFramerate();
                const skinAnimationClockMs = currentBeatmap ? currentTime : effectAnimClockMs;
                const noteFrameCache = new Map();
                const resolveNoteFrames = (lookup, col) => {
                    const cacheKey = `${lookup}|${col}`;
                    if (noteFrameCache.has(cacheKey)) return noteFrameCache.get(cacheKey);
                    const frames = getManiaSkinAnimationFrames(keys, lookup, col) || null;
                    noteFrameCache.set(cacheKey, frames);
                    return frames;
                };
                const resolveAnimatedNoteImage = (lookup, col, animationStartTimeMs = null) => {
                    const frames = resolveNoteFrames(lookup, col);
                    if (frames && frames.length > 1) skinFrameAnimationActive = true;
                    const animationClockMs = Number.isFinite(animationStartTimeMs)
                        ? getLegacyNoteAnimationClockMs(skinAnimationClockMs, animationStartTimeMs)
                        : skinAnimationClockMs;
                    return selectSkinAnimationFrame(frames, animationClockMs, skinAnimationFps)
                        || getManiaSkinImage(keys, lookup, col);
                };

                const udRes = getManiaSkinConfig(keys, LML.UpsideDown);
                const isUpsideDown = (udRes && (udRes.value === true || udRes.value === 1 || udRes.value === '1'));

                let colWidths = [];
                for (let i = 0; i < keys; i++) {
                    const res = getManiaSkinConfig(keys, LML.ColumnWidth, i);
                    const rawW = (res && res.value > 0) ? res.value : 30;
                    colWidths.push(rawW * scale48);
                }

                let colSpacings = [];
                for (let i = 0; i < keys; i++) {
                    const res = getManiaSkinConfig(keys, LML.ColumnSpacing, i);
                    const rawS = (res && res.value > 0) ? res.value : 0;
                    colSpacings.push(rawS * scale48);
                }

                const colStartRes = getManiaSkinConfig(keys, LML.ColumnStart);
                const columnStartRaw = (colStartRes && colStartRes.value != null) ? colStartRes.value : 136;
                const startX = columnStartRaw * scale48;

                const splitStagesRes = getManiaSkinConfig(keys, LML.SplitStages);
                const splitStages = isManiaSplitStagesEnabled(
                    { SplitStages: splitStagesRes && splitStagesRes.value },
                    keys
                );
                const stageSplitAfter = splitStages ? getManiaStageSplitAfter(keys) : -1;
                const stageSeparationRes = getManiaSkinConfig(keys, LML.StageSeparation);
                const stageSeparationRaw = (stageSeparationRes && stageSeparationRes.value != null && !isNaN(stageSeparationRes.value))
                    ? Math.max(0, parseFloat(stageSeparationRes.value))
                    : 40;
                const stageSeparationPx = (stageSplitAfter >= 0) ? stageSeparationRaw * scale48 : 0;

                const totalTrackWidth = colWidths.reduce((a, b) => a + b, 0)
                    + colSpacings.slice(0, keys - 1).reduce((a, b) => a + b, 0)
                    + stageSeparationPx;
                const trailingSpacing = colSpacings[keys - 1] || 0;

                const hpRes = getManiaSkinConfig(keys, LML.HitPosition);
                const hitPos = ((hpRes && hpRes.value) ? hpRes.value : DEFAULT_HIT_POSITION) * scale48;

                // ---- UpsideDown (上下颠倒 / 上升模式) 坐标体系说明 ----
                // 整个 Mania 演奏区（小节线 / 判定线 / 按键 / 音符 / 长条 / 特效 / 舞台底图）
                // 在开启 UpsideDown 时沿画布垂直中线整体镜像：音符自下而上运动，按键与判定线移到上方。
                // 实现方式：演奏区内部仍然全部按「下落坐标系」计算 Y（沿用原有代码，无需逐个翻转），
                // 只需在演奏区绘制前后各加一次 canvas 镜像变换（见下方 openUpsideDownMirror / closeUpsideDownMirror），
                // 这样贴图内容与位置会一起被镜像，无需为每张贴图单独写翻转逻辑。
                // 例外：交互元素外接矩形（activeNoteElements / canvasInteractiveElements）必须记录真实屏幕坐标，
                // 因此用 rectTop() 把下落坐标系中的矩形顶端换算成镜像后的真实顶端。
                // （镜像后判定线位于 canvas.height - hitPos，按键位于其上方，音符自下而上运动。）
                const rectTop = (y, h) => (isUpsideDown ? (canvas.height - y - h) : y);
                const openUpsideDownMirror = () => {
                    if (!isUpsideDown) return;
                    ctx.save();
                    ctx.translate(0, canvas.height);
                    ctx.scale(1, -1);
                };
                const closeUpsideDownMirror = () => {
                    if (!isUpsideDown) return;
                    ctx.restore();
                };

                let scorePosFromSkin = null;
                const spRes = getManiaSkinConfig(keys, LML.ScorePosition);
                if (spRes && spRes.value != null) {
                    scorePosFromSkin = (isUpsideDown ? (480 - spRes.value) : spRes.value) * scale48;
                }

                let noteBodyStyleCfg = NOTE_BODY_STYLE.RepeatFromTail;
                const nbsRes = getManiaSkinConfig(keys, LML.NoteBodyStyle);
                if (nbsRes && nbsRes.value !== null && nbsRes.value !== undefined) noteBodyStyleCfg = nbsRes.value;

                // 对齐 osu!stable / lazer 机制的流速计算：
                // 1. scrollSpeed 在 [1, 40] 范围内，可见时间窗口 scrollTime = MAX_TIME_RANGE / scrollSpeed (MAX_TIME_RANGE = 11485)
                // 2. 基础像素速度 = (DEFAULT_HIT_POSITION / scrollTime) * scale48 (DEFAULT_HIT_POSITION = 402)
                // 3. 该机制使音符实际下落流速严格恒定，独立于 skin.ini 自定义的 HitPosition
                const speedFactor = getManiaSpeedFactor(scrollSpeed, scale48);
                const activeScrollState = isPreviewMode ? null : currentManiaScrollState;
                const currentScrollPosition = getManiaScrollPositionAt(currentTime, activeScrollState);
                const scrollDistanceAtTime = (time) => {
                    return (getManiaScrollPositionAt(time, activeScrollState) - currentScrollPosition) * speedFactor;
                };

                if (isPreviewMode) {
                    notesList = [];
                    for (let c = 0; c < keys; c++) {
                        const isHoldCol = (c === 1 || (keys > 4 && c === keys - 2));
                        // 预览音符间距同样基于 480 虚拟网格，需乘 scale48 才能在不同画布尺寸下保持
                        // 与真实演奏一致的相对布局（否则全屏时音符会全部挤在命中线附近）。
                        const noteDist = (120 + (c % 4) * 80) * scale48;
                        const startTime = (noteDist / speedFactor);
                        if (isHoldCol) {
                            const endTime = ((noteDist + 160 * scale48) / speedFactor);
                            notesList.push({
                                column: c,
                                isHold: true,
                                startTime: startTime,
                                endTime: endTime,
                                scrollPositionStart: startTime,
                                scrollPositionEnd: endTime,
                                hit: false,
                                holdHeadFrozen: false
                            });
                        } else {
                            notesList.push({
                                column: c,
                                isHold: false,
                                startTime: startTime,
                                endTime: startTime,
                                scrollPositionStart: startTime,
                                scrollPositionEnd: startTime,
                                hit: false
                            });
                        }
                    }
                }

                let columnPressed = Array(keys).fill(false);
                let columnLastReleaseTime = Array(keys).fill(-Infinity);
                const KEY_PRESS_DURATION = 90; // 单键音符贴图触碰判定线后的按键高亮时长(ms)

                for (let i = 0; i < notesList.length; i++) {
                    let note = notesList[i];
                    const col = note.column;
                    if (col < 0 || col >= keys) continue;
                    const noteEndTime = note.isHold ? note.endTime : (note.startTime + KEY_PRESS_DURATION);
                    if (currentTime >= note.startTime && currentTime <= noteEndTime) {
                        columnPressed[col] = true;
                    } else if (currentTime > noteEndTime) {
                        if (noteEndTime > columnLastReleaseTime[col]) {
                            columnLastReleaseTime[col] = noteEndTime;
                        }
                    }
                }

                let currentX = startX;
                const colXCache = [];
                for (let i = 0; i < keys; i++) {
                    colXCache.push(currentX);
                    const w = colWidths[i] || colWidths[0];
                    currentX += w;
                    if (i < keys - 1) {
                        currentX += (colSpacings[i] || 0);
                        if (i === stageSplitAfter) currentX += stageSeparationPx;
                    }
                }

                const stageSegments = [];
                if (stageSplitAfter >= 0) {
                    const firstStageEndX = colXCache[stageSplitAfter] + (colWidths[stageSplitAfter] || colWidths[0]);
                    const secondStageStartX = colXCache[stageSplitAfter + 1];
                    stageSegments.push({ x: startX, width: firstStageEndX - startX });
                    stageSegments.push({ x: secondStageStartX, width: startX + totalTrackWidth - secondStageStartX });
                } else {
                    stageSegments.push({ x: startX, width: totalTrackWidth });
                }

                const {
                    showLine, stageLightLpRes, stageLightPosY, stageLightFps,
                    stageLightFadeDuration: STAGE_LIGHT_FADE_DURATION,
                    stageLightPreviewActive
                } = renderFramePlayfield({
                    ctx, keys, colWidths, colSpacings, colXCache, stageSegments,
                    startX, totalTrackWidth, stageSplitAfter, canvas, isUpsideDown, hitPos,
                    openUpsideDownMirror, currentTime, activeScrollState, speedFactor,
                    scrollDistanceAtTime, currentTimingPoints, isPreviewMode, scale48,
                    scale768, globalSkinVersion, getManiaConfigForKeys,
                    getManiaSkinConfig, getManiaSkinImage, getVisibleBarlines
                });
                const activeStageLightBoxes = renderStageLightColumns({
                    ctx, keys, columnPressed, columnLastReleaseTime, currentTime,
                    stageLightPreviewActive, colWidths, colXCache, stageLightPosY,
                    stageLightFps, stageLightFadeDuration: STAGE_LIGHT_FADE_DURATION,
                    scale768, rectTop
                });
                // ---- 计算连击数与长按状态 ----
                let currentCombo = 0;
                let isHoldingLN = false;
                if (!isPreviewMode) {
                    for (let i = 0; i < notesList.length; i++) {
                        const n = notesList[i];
                        if (n.isHold) {
                            if (currentTime >= n.startTime) {
                                currentCombo++;
                                if (currentTime < n.endTime) {
                                    isHoldingLN = true;
                                }
                            }
                            // 对齐 std 模式 Slider 的 Tick 连击逻辑：长按过程中每经过一个 Tick，Combo 持续递增
                            if (n.ticks && n.ticks.length > 0) {
                                for (let k = 0; k < n.ticks.length; k++) {
                                    if (currentTime >= n.ticks[k]) {
                                        currentCombo++;
                                    } else {
                                        break;
                                    }
                                }
                            }
                            if (currentTime >= n.endTime) {
                                currentCombo++;
                            }
                        } else {
                            if (currentTime >= n.startTime) currentCombo++;
                        }
                    }
                } else {
                    currentCombo = 100;
                    isHoldingLN = false;
                }

                if (performance.now() < testHoldingUntil) {
                    isHoldingLN = true;
                }
                if (performance.now() < testComboBreakUntil) {
                    currentCombo = 0;
                }
                if (isPreviewJudgementActive) {
                    if (isPlaying) {
                        if (playbackBreakResumeTime > 0 && performance.now() < playbackBreakResumeTime) {
                            currentCombo = 0;
                        }
                    } else if (isPreviewMode) {
                        if (previewBreakResumeTime > 0 && performance.now() < previewBreakResumeTime) {
                            currentCombo = 0;
                        } else {
                            currentCombo = previewSimCombo;
                        }
                    }
                }

                // ---- 4. 更新判定与音符命中状态 ----
                const triggerJudgement = createJudgementTrigger({
                    isUpsideDown, scorePosFromSkin, scale48, startX, totalTrackWidth, keys
                });
                // 若在纯皮肤预览模式（未加载谱面播放）且启用了判定演示，执行动态仿真步进
                if (isPreviewMode && isPreviewJudgementActive) {
                    const now = performance.now();
                    if (now - lastPreviewTickTime >= 420) {
                        lastPreviewTickTime = now;
                        if (previewBreakResumeTime > 0 && now >= previewBreakResumeTime) {
                            // 动画播放完之后还按原来的连击数继续播放
                            previewSimCombo = (previewSavedCombo > 0) ? previewSavedCombo : 100;
                            previewBreakResumeTime = 0;
                        }

                        const nextLookup = JUDGEMENT_PREVIEW_PATTERN[judgementPreviewIndex % JUDGEMENT_PREVIEW_PATTERN.length];
                        judgementPreviewIndex++;

                        // 随机触发一列打击特效
                        const randCol = Math.floor(Math.random() * keys);
                        // hitTime 用特效动画时钟：暂停时不再流逝，特效保持可见、便于点选
                        activeExplosions.push({ column: randCol, hitTime: effectAnimClockMs, duration: 200 });

                        if (nextLookup === LML.Hit0) {
                            // Miss 判定：触发断连并播放断连动画
                            triggerJudgement(now, LML.Hit0);
                            previewSavedCombo = previewSimCombo;
                            comboAnimState.breakStartTime = now;
                            comboAnimState.breakCount = (previewSimCombo > 0) ? previewSimCombo : 100;
                            comboAnimState.lastCombo = 0;
                            previewBreakResumeTime = now + 380;
                            previewSimCombo = 0;
                            currentCombo = 0;
                        } else {
                            if (previewBreakResumeTime === 0) {
                                previewSimCombo++;
                                comboAnimState.incStartTime = now;
                            }
                            triggerJudgement(now, nextLookup);
                            currentCombo = previewSimCombo;
                        }
                    }
                }

                if (!isPreviewMode) {
                    const now = performance.now();
                    for (let i = 0; i < notesList.length; i++) {
                        let note = notesList[i];
                        if (!note.hit && currentTime >= note.startTime) {
                            note.hit = true;
                            // 单键音符触碰判定线时显示判定；长条音符按下时仅触发打击特效，松开(endTime)时才触发判定提示
                            if (!note.isHold) {
                                if (isPreviewJudgementActive) {
                                    const nextLookup = JUDGEMENT_PREVIEW_PATTERN[judgementPreviewIndex % JUDGEMENT_PREVIEW_PATTERN.length];
                                    judgementPreviewIndex++;
                                    triggerJudgement(now, nextLookup);
                                    if (nextLookup === LML.Hit0) {
                                        // Miss 判定：触发断连爆破动画
                                        if (currentCombo > 0) {
                                            playbackSavedCombo = currentCombo;
                                        }
                                        comboAnimState.breakStartTime = now;
                                        comboAnimState.breakCount = (currentCombo > 0) ? currentCombo : ((playbackSavedCombo > 0) ? playbackSavedCombo : 100);
                                        comboAnimState.lastCombo = 0;
                                        playbackBreakResumeTime = now + 380;
                                        currentCombo = 0;
                                    }
                                } else {
                                    triggerJudgement(now, LML.Hit300g);
                                }
                            }
                            activeExplosions.push({ column: note.column, hitTime: effectAnimClockMs, duration: 200 });
                        }
                    }
                }

                // ---- 5. 渲染长条身体与长条尾巴（在 KeyImage 按键下方图层渲染） ----
                const activeNoteElements = [];
                for (let i = 0; i < notesList.length; i++) {
                    let note = notesList[i];
                    if (!note.isHold) continue;
                    if (currentTime >= note.endTime) {
                        if (!note.tailHit) {
                            note.tailHit = true;
                            const now = performance.now();
                            activeExplosions.push({ column: note.column, hitTime: effectAnimClockMs, duration: 200 });
                            if (!isPreviewMode) {
                                if (isPreviewJudgementActive) {
                                    const nextLookup = JUDGEMENT_PREVIEW_PATTERN[judgementPreviewIndex % JUDGEMENT_PREVIEW_PATTERN.length];
                                    judgementPreviewIndex++;
                                    triggerJudgement(now, nextLookup);
                                    if (nextLookup === LML.Hit0) {
                                        if (currentCombo > 0) {
                                            playbackSavedCombo = currentCombo;
                                        }
                                        comboAnimState.breakStartTime = now;
                                        comboAnimState.breakCount = (currentCombo > 0) ? currentCombo : ((playbackSavedCombo > 0) ? playbackSavedCombo : 100);
                                        comboAnimState.lastCombo = 0;
                                        playbackBreakResumeTime = now + 380;
                                        currentCombo = 0;
                                    }
                                } else {
                                    triggerJudgement(now, LML.Hit300g);
                                }
                            }
                        }
                        continue;
                    }

                    let w = colWidths[note.column];
                    let colX = colXCache[note.column];

                    const holdHeadImg = resolveAnimatedNoteImage(LML.HoldNoteHeadImage, note.column, note.startTime);
                    const holdTailImg = resolveAnimatedNoteImage(LML.HoldNoteTailImage, note.column, note.endTime);
                    const holdBodyImg = resolveAnimatedNoteImage(LML.HoldNoteBodyImage, note.column);

                    const headDrawHeight = holdHeadImg ? getManiaNoteDrawHeight(keys, note.column, holdHeadImg, w, scale48) : Math.round(20 * scale48);
                    const tailDrawHeight = holdTailImg ? getManiaNoteDrawHeight(keys, note.column, holdTailImg, w, scale48) : Math.round(20 * scale48);

                    const holdGeometry = getStableHoldNoteGeometry(
                        note, currentScrollPosition, currentTime, hitPos, speedFactor,
                        headDrawHeight, tailDrawHeight
                    );
                    note.holdHeadFrozen = holdGeometry.headFrozen;

                    const {
                        headAnchorY,
                        headTopY,
                        headCenterY,
                        tailAnchorY: tailBottomY,
                        tailTopY,
                        bodyTopY: bodyTop,
                        bodyBottomY: bodyBottom,
                        bodyHeight
                    } = holdGeometry;

                    const wholeTop = Math.min(headTopY, tailTopY, bodyTop);
                    const wholeBottom = Math.max(headAnchorY, tailBottomY, bodyBottom);
                    if (wholeBottom < -100 || wholeTop > canvas.height + 100) continue;

                    // 5a. 身体 (近端位于头部中心，长度只由头尾下端锚点决定)
                    if (bodyHeight > 0.5) {
                        if (canvasEditMode && bodyHeight > 4 && bodyTop < canvas.height && bodyBottom > 0 && bodyTop <= hitPos + 25) {
                            activeNoteElements.push({
                                id: `hold_body_${note.column}`,
                                noteInstanceKey: `hold_body_${note.column}_${note.startTime}`,
                                name: `第 ${note.column + 1} 轨长条身`,
                                paramKey: `NoteImage${note.column}L`,
                                fallbackParamKey: 'HoldNoteBodyImage',
                                category: 'Mania',
                                x: colX,
                                y: rectTop(bodyTop, bodyHeight),
                                w: w,
                                h: bodyHeight,
                                isTexture: true,
                                textureName: getManiaNoteTextureName(keys, LML.HoldNoteBodyImage, note.column),
                                textureKey: LML.HoldNoteBodyImage,
                                colIndex: note.column,
                                dragAxis: null,
                                valFormatter: () => `第 ${note.column + 1} 轨长条身`
                            });
                        }

                        if (holdBodyImg) {
                            const nbsRes = getManiaSkinConfig(keys, LML.NoteBodyStyle, note.column);
                            const style = (nbsRes && nbsRes.value != null) ? nbsRes.value : NOTE_BODY_STYLE.RepeatFromTail;
                            drawStableHoldBodyTexture(ctx, holdBodyImg, style, colX, w, bodyTop, bodyHeight);
                        } else {
                            const inset = 5;
                            const bx = colX + inset;
                            const bw = w - inset * 2;
                            const grad = ctx.createLinearGradient(bx, bodyTop, bx, bodyBottom);
                            const baseColor = note.column % 2 === 0 ? '0, 229, 255' : '255, 255, 255';
                            grad.addColorStop(0, `rgba(${baseColor}, 0.55)`);
                            grad.addColorStop(1, `rgba(${baseColor}, 0.75)`);
                            ctx.fillStyle = grad;
                            roundRect(ctx, bx, bodyTop, bw, bodyHeight, 4);
                            ctx.fill();

                            ctx.save();
                            ctx.globalAlpha = 0.35;
                            ctx.fillStyle = `rgba(255,255,255,0.85)`;
                            ctx.fillRect(bx + bw * 0.35, bodyTop + 2, bw * 0.3, bodyHeight);
                            ctx.restore();
                        }
                    }

                    // 5b. 尾巴 (到达头部中点即停止渲染)
                    if (tailBottomY > -tailDrawHeight * 2 && tailTopY < canvas.height + tailDrawHeight * 2) {
                        if (canvasEditMode && tailBottomY <= hitPos + 25) {
                            activeNoteElements.push({
                                id: `hold_tail_${note.column}`,
                                noteInstanceKey: `hold_tail_${note.column}_${note.startTime}`,
                                name: `第 ${note.column + 1} 轨长条尾`,
                                paramKey: `NoteImage${note.column}T`,
                                fallbackParamKey: 'HoldNoteTailImage',
                                category: 'Mania',
                                x: colX,
                                y: rectTop(tailTopY, tailDrawHeight),
                                w: w,
                                h: tailDrawHeight,
                                isTexture: true,
                                textureName: getManiaNoteTextureName(keys, LML.HoldNoteTailImage, note.column),
                                textureKey: LML.HoldNoteTailImage,
                                colIndex: note.column,
                                dragAxis: null,
                                valFormatter: () => `第 ${note.column + 1} 轨长条尾`
                            });
                        }

                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(0, 0, canvas.width, Math.max(0, headCenterY));
                        ctx.clip();

                        if (holdTailImg) {
                            ctx.save();
                            ctx.translate(colX, tailBottomY);
                            ctx.scale(1, -1);
                            ctx.drawImage(holdTailImg, 0, 0, w, tailDrawHeight);
                            ctx.restore();
                        } else {
                            ctx.fillStyle = note.column % 2 === 0 ? '#00b8d4' : '#cccccc';
                            const rh = tailDrawHeight;
                            roundRect(ctx, colX + 4, tailTopY, w - 8, rh, 4);
                            ctx.fill();
                        }
                        ctx.restore();
                    }
                }

                // ---- 6 & 7. 渲染按键 KeyImage 与 Note ----
                // 依据 skin.ini 中的 KeysUnderNotes 参数决定图层层叠顺序：
                // 如果为 1：note 渲染在 keyimage 上 (先 keyimage，后 note)
                // 如果为 0 (或未配置默认 0)：note 渲染在 keyimage 下 (先 note，后 keyimage)
                const kunRes = getManiaSkinConfig(keys, LML.KeysUnderNotes);
                const keysUnderNotes = (kunRes && (kunRes.value === 1 || kunRes.value === '1' || kunRes.value === true)) ? 1 : 0;

                const renderKeyImages = createKeyImageRenderer({
                    keys, colWidths, colXCache, columnPressed, hitPos, canvas
                });
                const renderNotes = createNoteRenderer({
                    notesList, colWidths, colXCache, hitPos, currentScrollPosition,
                    speedFactor, canvas, canvasEditMode, activeNoteElements, currentTime,
                    resolveAnimatedNoteImage, keys, scale48, rectTop
                });
                // 根据 keysUnderNotes 决定渲染层级：
                // 1: Note 渲染在 KeyImage 上
                // 0 (默认): Note 渲染在 KeyImage 下
                if (keysUnderNotes === 1) {
                    renderKeyImages();
                    renderNotes();
                } else {
                    renderNotes();
                    renderKeyImages();
                }

                // ---- 8. 渲染舞台底图 StageBottom（最上层覆盖渲染，置于音符与按键之上） ----
                const stageBottomImg = getManiaSkinImage(keys, LML.BottomStageImage);
                if (stageBottomImg && stageBottomImg.width > 0 && stageBottomImg.height > 0) {
                    // 保持贴图原生纵横比，通过分辨率系数 scale48 进行等比缩放，水平居中对齐轨道，底部对齐画布底部
                    const is2x = !!stageBottomImg._is2x;
                    const nativeW = is2x ? stageBottomImg.width / 2 : stageBottomImg.width;
                    const nativeH = is2x ? stageBottomImg.height / 2 : stageBottomImg.height;
                    const sbW = nativeW * scale48;
                    const sbH = nativeH * scale48;
                    const sbY = canvas.height - sbH;

                    const hasColumnSpacing = colSpacings.slice(0, keys - 1).some(s => s > 0);
                    for (const segment of stageSegments) {
                        const segmentStartCol = colXCache.findIndex(colX => Math.abs(colX - segment.x) < 0.001);
                        const sbX = segment.x + (segment.width - sbW) / 2;
                        if (hasColumnSpacing || stageSegments.length > 1) {
                            for (let i = Math.max(0, segmentStartCol); i < keys; i++) {
                                const colX = colXCache[i];
                                const w = colWidths[i] || colWidths[0];
                                if (colX >= segment.x + segment.width - 0.001) break;
                                ctx.save();
                                ctx.beginPath();
                                ctx.rect(colX, sbY, w, sbH);
                                ctx.clip();
                                ctx.drawImage(stageBottomImg, sbX, sbY, sbW, sbH);
                                ctx.restore();
                            }
                        } else {
                            ctx.drawImage(stageBottomImg, sbX, sbY, sbW, sbH);
                        }
                    }
                }

                // ---- 8.5 渲染打击特效 LightingN (单键命中爆发) 与 LightingL (长条按住持续光效) ----
                const fpsRes = getManiaSkinConfig(keys, LML.LightFramePerSecond);
                const lightFps = (fpsRes && fpsRes.value > 0) ? fpsRes.value : 60;
                // 对齐 osu!lazer 核心逻辑 (LegacyHitExplosion / LegacySkin):
                // 1. 特效垂直中心对齐判定线 (HitPosition)，水平中心对齐当前轨道中心
                // 2. 基础尺寸基于贴图原生尺寸 (nativeW, nativeH)，随窗口 768p 分辨率等比缩放 (* scale768)
                // 3. 特效缩放倍率由 LightingNWidth / LightingLWidth 换算（数值 / 30），未配置时自动按 ColumnWidth / 30 缩放
                const lightPosY = hitPos;

                // 本帧「真实渲染出来」的打击特效矩形（画布坐标）。
                // 画布交互层据此判断某一轨的打击特效此刻是否可见：只有可见（正在爆发 / 正在按住长条）
                // 时，该轨元素才可被点选——与音符等元素一致，不再依赖常驻占位框。
                const activeLightingBoxes = renderLightingEffects({
                    ctx, isPreviewMode, notesList, currentTime, keys, colXCache, colWidths,
                    scale768, scale48, canvasEditMode, selectedCanvasElement,
                    activeExplosions, effectAnimClockMs, lightPosY, lightFps, rectTop
                });
                // ---- Mania 演奏区绘制结束：退出 UpsideDown 镜像，HUD (连击/判定/血条/右上角) 恢复常规坐标系 ----
                closeUpsideDownMirror();

                // 连击数状态更新与动画触发（对齐 osu!lazer: 增长纵向拉伸弹跳 + 断连红色爆破扩散）
                if (currentCombo > comboAnimState.lastCombo) {
                    comboAnimState.incStartTime = performance.now();
                } else if (currentCombo < comboAnimState.lastCombo && comboAnimState.lastCombo > 0) {
                    comboAnimState.breakStartTime = performance.now();
                    comboAnimState.breakCount = comboAnimState.lastCombo;
                }
                comboAnimState.lastCombo = currentCombo;

                const cpRes = getManiaSkinConfig(keys, LML.ComboPosition);
                let comboPosY;
                if (cpRes && cpRes.value != null && !isNaN(cpRes.value)) {
                    comboPosY = (isUpsideDown ? (480 - cpRes.value) : cpRes.value) * scale48;
                } else {
                    comboPosY = (isUpsideDown ? (480 - DEFAULT_COMBO_POSITION) : DEFAULT_COMBO_POSITION) * scale48;
                }
                let comboPosX = startX + totalTrackWidth / 2;
                drawCombo(currentCombo, comboPosX, comboPosY, keys, scale768, isHoldingLN, startX, totalTrackWidth);

                const defaultScorePosRaw = isUpsideDown ? (480 - DEFAULT_SCORE_POSITION) : DEFAULT_SCORE_POSITION;
                let scorePosY = (scorePosFromSkin !== null)
                    ? scorePosFromSkin
                    : defaultScorePosRaw * scale48;
                let scorePosX = startX + totalTrackWidth / 2;

                // 血条先绘制，保证与判定提示重叠时位于其下层。
                // 对齐 osu!lazer / stable 规范：位于轨道右侧，逆时针旋转 90 度，底部对齐，满血常驻展示。
                drawHealthDisplay(startX, totalTrackWidth, trailingSpacing, scale768);

                // 判定提示后绘制，与血条重叠时优先显示在上层。
                if (isPlaying || (isPreviewJudgementActive && judgements.length > 0)) {
                    drawJudgements(scale768, scorePosX, scorePosY);
                } else {
                    if (judgements.length > 0) {
                        // 暂停定格展示：同样传入当前帧的轨道区中心与 ScorePosition，
                        // 保证拖动轨道 / 修改判定位置时判定提示立即自动居中。
                        drawJudgements(scale768, scorePosX, scorePosY);
                    } else {
                        drawStaticJudgementPreview(keys, scorePosX, scorePosY, scale768);
                    }
                }

                // 渲染右上角分数、准度与歌曲进度饼图（对齐 osu!lazer LegacySkin 规范）
                const hudInteractiveElements = drawTopRightHUD(keys, scale768);


                // 更新可交互画布元素外接矩形与选中框渲染 (支持画布直接框选、拖拽与贴图替换)
                updateCanvasInteractiveElements({
                    keys, startX, totalTrackWidth, trailingSpacing,
                    colWidths, colSpacings, colXCache, hitPos, scorePosFromSkin,
                    comboPosX, comboPosY, scale48, scale768, stageLightLpRes, hpRes,
                    activeNoteElements, hudInteractiveElements, isUpsideDown,
                    activeLightingBoxes, activeStageLightBoxes
                });

                if (debugMode) {
                    drawDebugWindow({
                        keys, scale48, colWidths, colSpacings, startX, totalTrackWidth,
                        hitPos, scorePosFromSkin, comboPosY, noteBodyStyleCfg, showLine,
                        columnStartRaw, columnPressed, colXCache, keysUnderNotes,
                    });
                }

            } catch (err) {
                console.error("[drawFrame] 渲染异常（已捕获并跳过）：", err);
                try {
                    for (let i = 0; i < 64; i++) {
                        let threw = false;
                        try { ctx.restore(); } catch (_) { threw = true; }
                        if (threw) break;
                    }
                    ctx.save();
                    ctx.fillStyle = 'rgba(224, 84, 139, 0.85)';
                    ctx.font = 'bold 14px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Render Error: ' + (err.message || err), canvas.width / 2, 30);
                    ctx.restore();
                } catch (_) { }
            } finally {
                // 注意：暂停时特效时钟冻结，爆炸不会变化 —— 此时不应再靠它维持 rAF 循环，
                // 否则会空转（预览模式没有音频，仍需靠它驱动，故用 isPlaying || isPreviewMode 门控）。
                const hasRunningAnims = ((isPlaying || isPreviewMode) && activeExplosions.length > 0) || (isPlaying && judgements.length > 0) ||
                    (isPreviewMode && skinFrameAnimationActive) ||
                    (performance.now() - comboAnimState.breakStartTime < 400) ||
                    (performance.now() - comboAnimState.incStartTime < 300) ||
                    (performance.now() < testComboBreakUntil) ||
                    (performance.now() - bgFadeStartTime < BG_FADE_DURATION) ||
                    (performance.now() < testHoldingUntil) ||
                    (isPreviewMode && isPreviewJudgementActive) ||
                    (selectedCanvasElement && (performance.now() - selectionAnimStartTime < 240));
                if ((isPlaying || hasRunningAnims) && (currentBeatmap || isPreviewMode)) {
                    cancelAnimationFrame(animationId);
                    animationId = requestAnimationFrame(drawFrame);
                }
            }
        }
