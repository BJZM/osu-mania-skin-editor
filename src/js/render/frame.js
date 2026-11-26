// ============================================================================
// frame.js - 主 Canvas 帧绘制：背景、轨道、音符、长条与特效
// 依赖：render/textures.js、render/combo.js、render/hold-note-geometry.js、
//       render/frame-notes.js、core/state.js
// ============================================================================

        function drawFrame() {
            // 纯皮肤预览（无谱面）时若渲染了多帧贴图，需要在函数末尾保持 rAF 循环，动画才会真正播放。
            let skinFrameAnimationActive = false;
            let comboburstAnimationActive = false;
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

                // 启动流程中先只展示谱面背景；皮肤来源确定前不绘制舞台与音符。
                if (typeof shouldDeferSkinRendering === 'function' && shouldDeferSkinRendering()) {
                    return;
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
                const noteFrameSlots = new Array(4 * keys);
                const resolveNoteFrames = (lookup, col) => {
                    const base = lookup === LML.NoteImage ? 0
                        : (lookup === LML.HoldNoteHeadImage ? 1
                        : (lookup === LML.HoldNoteBodyImage ? 2
                        : (lookup === LML.HoldNoteTailImage ? 3 : -1)));
                    if (base < 0 || col < 0 || col >= keys) {
                        return getManiaSkinAnimationFrames(keys, lookup, col) || null;
                    }
                    const slot = base * keys + col;
                    let frames = noteFrameSlots[slot];
                    if (frames === undefined) {
                        frames = getManiaSkinAnimationFrames(keys, lookup, col) || null;
                        noteFrameSlots[slot] = frames;
                    }
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
                let rawColWidths = [];
                for (let i = 0; i < keys; i++) {
                    const res = getManiaSkinConfig(keys, LML.ColumnWidth, i);
                    const rawW = (res && res.value > 0) ? res.value : 30;
                    rawColWidths.push(rawW);
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
                    notesList = buildPreviewDummyNotes(keys, scale48, speedFactor);
                }

                const KEY_PRESS_DURATION = 90; // 单键音符贴图触碰判定线后的按键高亮时长(ms)
                const notesIndex = (!isPreviewMode && notesList.length > 0 && typeof getOrBuildNotesRenderIndex === 'function')
                    ? getOrBuildNotesRenderIndex(notesList)
                    : null;
                const useIndexedNotes = !!(notesIndex && notesIndex.sorted);
                let {
                    columnPressed,
                    columnLastReleaseTime,
                    activeHoldNotes,
                    currentCombo,
                    isHoldingLN
                } = computeFrameNotePressAndComboState({
                    notesList,
                    keys,
                    currentTime,
                    isPreviewMode,
                    useIndexedNotes,
                    notesIndex,
                    keyPressDuration: KEY_PRESS_DURATION
                });

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

                const triggerPlaybackNoteJudgement = (now) => {
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
                };

                if (!isPreviewMode) {
                    advanceFrameNoteHitCursors({
                        notesList,
                        currentTime,
                        useIndexedNotes,
                        notesIndex,
                        triggerPlaybackNoteJudgement
                    });
                }

                // ---- 5. 录制长条身体与长条尾巴的绘制批次（与 Note 共用层级） ----
                const activeNoteElements = [];
                const wnRes = getManiaSkinConfig(keys, LML.WidthForNoteHeightScale);
                const widthForNoteHeightScalePx = (wnRes && wnRes.value > 0) ? (wnRes.value * scale48) : 0;
                const colNoteBodyStyles = new Array(keys);
                let noteTextureNames = null;
                let holdHeadTextureNames = null;
                let holdBodyTextureNames = null;
                let holdTailTextureNames = null;
                if (canvasEditMode) {
                    noteTextureNames = new Array(keys);
                    holdHeadTextureNames = new Array(keys);
                    holdBodyTextureNames = new Array(keys);
                    holdTailTextureNames = new Array(keys);
                    for (let c = 0; c < keys; c++) {
                        noteTextureNames[c] = getManiaNoteTextureName(keys, LML.NoteImage, c);
                        holdHeadTextureNames[c] = getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, c);
                        holdBodyTextureNames[c] = getManiaNoteTextureName(keys, LML.HoldNoteBodyImage, c);
                        holdTailTextureNames[c] = getManiaNoteTextureName(keys, LML.HoldNoteTailImage, c);
                    }
                }

                let visStartIdx = 0;
                let visEndIdx = notesList.length;
                const earlyVisibleHolds = [];
                if (useIndexedNotes) {
                    const windowPad = Math.max(400, 400 * scale48);
                    const minVisibleScrollPos = currentScrollPosition + (hitPos - canvas.height - windowPad) / speedFactor;
                    const maxVisibleScrollPos = currentScrollPosition + (hitPos + windowPad) / speedFactor;
                    visStartIdx = lowerBoundByScrollStart(notesList, minVisibleScrollPos);
                    visEndIdx = upperBoundByScrollStart(notesList, maxVisibleScrollPos);

                    const holdSearchEnd = upperBoundInt32(notesIndex.holdNoteIndices, visStartIdx - 1);
                    for (let j = holdSearchEnd - 1; j >= 0; j--) {
                        if (notesIndex.holdPrefixMaxScrollEnd[j] < minVisibleScrollPos ||
                            notesIndex.holdPrefixMaxEnd[j] <= currentTime) {
                            break;
                        }
                        const hold = notesIndex.holds[j];
                        if (hold.endTime > currentTime && hold.scrollPositionEnd >= minVisibleScrollPos) {
                            earlyVisibleHolds.push(hold);
                        }
                    }
                    if (earlyVisibleHolds.length > 1) earlyVisibleHolds.reverse();
                }

                const renderHoldNotes = createHoldNotesRenderer({
                    notesList, earlyVisibleHolds, visStartIdx, visEndIdx,
                    useIndexedNotes, isPreviewMode, colWidths, colXCache,
                    hitPos, currentScrollPosition, speedFactor, canvas,
                    canvasEditMode, activeNoteElements, currentTime,
                    resolveAnimatedNoteImage, keys, scale48, rectTop,
                    widthForNoteHeightScalePx, colNoteBodyStyles,
                    holdBodyTextureNames, holdTailTextureNames,
                    triggerPlaybackNoteJudgement
                });

                // ---- 6 & 7. 渲染按键 KeyImage 与 Note ----
                // 依据 skin.ini 中的 KeysUnderNotes 参数决定图层层叠顺序：
                // 如果为 1：note 渲染在 keyimage 上 (先 keyimage，后 note)
                // 如果为 0 (或未配置默认 0)：note 渲染在 keyimage 下 (先 note，后 keyimage)
                const kunRes = getManiaSkinConfig(keys, LML.KeysUnderNotes);
                const keysUnderNotes = (kunRes && (kunRes.value === 1 || kunRes.value === '1' || kunRes.value === true)) ? 1 : 0;

                const renderKeyImages = createKeyImageRenderer({
                    keys, colWidths, rawColWidths, colXCache, columnPressed, hitPos, canvas
                });
                const renderNotes = createNoteRenderer({
                    notesList, earlyVisibleHolds, visStartIdx, visEndIdx,
                    colWidths, colXCache, hitPos, currentScrollPosition,
                    speedFactor, canvas, canvasEditMode, activeNoteElements, currentTime,
                    resolveAnimatedNoteImage, keys, scale48, rectTop,
                    widthForNoteHeightScalePx, noteTextureNames, holdHeadTextureNames
                });
                // 根据 keysUnderNotes 决定渲染层级：
                // 1: Note 渲染在 KeyImage 上
                // 0 (默认): Note 渲染在 KeyImage 下
                if (keysUnderNotes === 1) {
                    renderKeyImages();
                    renderHoldNotes();
                    renderNotes();
                } else {
                    renderHoldNotes();
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
                    ctx, isPreviewMode, notesList, activeHoldNotes: useIndexedNotes ? activeHoldNotes : null,
                    currentTime, keys, colXCache, colWidths,
                    scale768, scale48, canvasEditMode, selectedCanvasElement,
                    activeExplosions, effectAnimClockMs, lightPosY, lightFps, rectTop
                });
                // ---- Mania 演奏区绘制结束：退出 UpsideDown 镜像，HUD (连击/判定/血条/右上角) 恢复常规坐标系 ----
                closeUpsideDownMirror();

                syncComboburstPlayback(currentCombo, keys);
                comboburstAnimationActive = drawComboburstEffects({
                    ctx, canvas, stageSegments, scale768
                });

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
                    isComboHoldColourTransitionActive() ||
                    (performance.now() < testComboBreakUntil) ||
                    (performance.now() - bgFadeStartTime < BG_FADE_DURATION) ||
                    (performance.now() < testHoldingUntil) ||
                    comboburstAnimationActive ||
                    (isPreviewMode && isPreviewJudgementActive) ||
                    (selectedCanvasElement && (performance.now() - selectionAnimStartTime < 240));
                if ((isPlaying || hasRunningAnims) && (currentBeatmap || isPreviewMode)) {
                    cancelAnimationFrame(animationId);
                    animationId = requestAnimationFrame(drawFrame);
                }
            }
        }
