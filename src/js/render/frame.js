// ============================================================================
// frame.js - 主 Canvas 帧绘制：背景、轨道、音符、长条与特效
// 依赖：render/textures.js、render/combo.js、core/state.js
// ============================================================================

        function drawFrame() {
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
                    currentTime = (isSeeking && ui.progressRange)
                        ? (parseFloat(ui.progressRange.value) * 1000)
                        : (audio.currentTime * 1000);
                    syncStoryboardVideoToTime(currentTime, isPlaying);
                    if (!isSeeking && isPlaying && ui.progressRange) {
                        ui.progressRange.value = audio.currentTime;
                        const totalDuration = (audio.duration && isFinite(audio.duration) && audio.duration > 0)
                            ? audio.duration
                            : parseFloat(ui.progressRange.max) || 0;
                        updateTimeLabels(audio.currentTime, totalDuration);
                        updateProgressFill(audio.currentTime, totalDuration);
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

                // 1. 舞台背景渲染（轨道底色及透明度 Colour1~ColourN / ColourColumn1~ColourColumnN）：
                // osu! 官方经典规范中轨道默认背景色为 Color4.Black (0, 0, 0, 255 - 纯黑全不透明)；
                // 皮肤若配置了 Colour# (如 0,0,0,0 全透明，或 0,0,0,200 半透明)，则严格应用对应 RGBA 颜色；
                // 连续且相同颜色的轨道区间合并渲染，消除逐轨浮点抗锯齿拼接缝，同时兼容 ColumnSpacing 间距留空与不同轨独立颜色。
                let currentSegmentColor = null;
                let segStartX = 0;
                let segWidth = 0;

                for (let i = 0; i < keys; i++) {
                    const bgRes = getManiaSkinConfig(keys, LML.ColumnBackgroundColour, i);
                    const c = (bgRes && bgRes.value) ? bgRes.value : { r: 0, g: 0, b: 0, a: 255 };
                    // 对齐 osu!stable / lazer 历史兼容特性 (LegacyColourCompatibility.ApplyWithDoubledAlpha):
                    // 在 osu!stable 构造函数中设置颜色会导致 Alpha 被重复叠加两次：
                    // 当 A > 0 时实际生效透明度为 (A / 255)^2；当 A == 0 时保持 0 全透明
                    const rawAlpha = (c.a != null ? c.a : 255) / 255;
                    const effectiveAlpha = rawAlpha > 0 ? (rawAlpha * rawAlpha) : 0;
                    const colorStr = `rgba(${c.r}, ${c.g}, ${c.b}, ${effectiveAlpha})`;
                    const colW = colWidths[i] || colWidths[0] || 0;
                    const colX = colXCache[i];
                    const prevSpacing = (i > 0) ? (colSpacings[i - 1] || 0) : 0;
                    const prevStageGap = (i > 0 && (i - 1) === stageSplitAfter) ? stageSeparationPx : 0;

                    if (currentSegmentColor === null) {
                        currentSegmentColor = colorStr;
                        segStartX = colX;
                        segWidth = colW;
                    } else if (prevSpacing === 0 && prevStageGap === 0 && colorStr === currentSegmentColor) {
                        segWidth += colW;
                    } else {
                        if (segWidth > 0 && currentSegmentColor !== 'rgba(0, 0, 0, 0)') {
                            ctx.fillStyle = currentSegmentColor;
                            ctx.fillRect(segStartX, 0, segWidth, canvas.height);
                        }
                        currentSegmentColor = colorStr;
                        segStartX = colX;
                        segWidth = colW;
                    }
                }
                if (segWidth > 0 && currentSegmentColor !== null && currentSegmentColor !== 'rgba(0, 0, 0, 0)') {
                    ctx.fillStyle = currentSegmentColor;
                    ctx.fillRect(segStartX, 0, segWidth, canvas.height);
                }

                // 2. 舞台左右边界底图 StageLeft / StageRight
                // 对齐 osu!lazer 核心逻辑 (LegacyStageBackground):
                // 1. 水平宽度 (X): 保持基于 768p 原生分辨率标准 (Scale.X = 1，即 nativeW * scale768)，不随 480 虚拟网格横向放大
                // 2. 垂直高度 (Y): 严格纵向拉伸至覆盖整个舞台高度 (Scale.Y = DrawHeight / Texture.Height，即 canvas.height)
                // 3. SplitStages 开启时，每一组舞台各自绘制左右边界。
                const stageLeftImg = getManiaSkinImage(keys, LML.LeftStageImage);
                let stageLeftWidth = 0;
                if (stageLeftImg && stageLeftImg.width > 0 && stageLeftImg.height > 0) {
                    const is2x = !!stageLeftImg._is2x;
                    const nativeW = is2x ? stageLeftImg.width / 2 : stageLeftImg.width;
                    stageLeftWidth = nativeW * scale768;
                }

                let stageRightWidth = 0;
                const stageRightImg = getManiaSkinImage(keys, LML.RightStageImage);
                if (stageRightImg && stageRightImg.width > 0 && stageRightImg.height > 0) {
                    const is2x = !!stageRightImg._is2x;
                    const nativeW = is2x ? stageRightImg.width / 2 : stageRightImg.width;
                    stageRightWidth = nativeW * scale768;
                }

                for (const segment of stageSegments) {
                    if (stageLeftWidth > 0) {
                        ctx.drawImage(stageLeftImg, segment.x - stageLeftWidth, 0, stageLeftWidth, canvas.height);
                    }
                    if (stageRightWidth > 0) {
                        ctx.drawImage(stageRightImg, segment.x + segment.width, 0, stageRightWidth, canvas.height);
                    }
                }

                // ---- 2.4 渲染轨道分界线 ColumnLineWidth ----
                // 对齐 osu!lazer LegacyStageBackground：
                // - ColumnLineWidth 长度为 keys + 1，第 i 项是第 i 轨左线，第 i + 1 项是第 i 轨右线。
                // - 该参数在 LegacyManiaSkinDecoder 中不做 1.6 倍列宽换算，因此这里按 768p 尺度绘制。
                // - 线条横向额外乘 0.740，并只绘制在判定线以上的演奏区。
                // - 非最后一轨的右线仅在 skin Version >= 2.4 时显示；颜色读取 ColourColumnLine，缺省为白色。
                const lineCfg = getManiaConfigForKeys(keys);
                const rawLineWidths = (lineCfg && Array.isArray(lineCfg.ColumnLineWidth))
                    ? lineCfg.ColumnLineWidth
                    : new Array(keys + 1).fill(2);
                const lineVersion = Number((lineCfg && lineCfg.SkinVersion != null) ? lineCfg.SkinVersion : globalSkinVersion);
                const effectiveLineVersion = Number.isFinite(lineVersion) ? lineVersion : 2.7;
                const lineTop = isUpsideDown ? Math.max(0, canvas.height - hitPos) : 0;
                const lineHeight = Math.max(0, Math.min(canvas.height, hitPos));
                const lineWidthScale = 0.740 * scale768;

                const parseColumnLineColour = (value) => {
                    if (!value) return { r: 255, g: 255, b: 255, a: 255 };
                    if (typeof value === 'object') {
                        const n = (v, fallback) => {
                            const parsed = Number(v);
                            return Number.isFinite(parsed) ? Math.max(0, Math.min(255, parsed)) : fallback;
                        };
                        return {
                            r: n(value.r, 255),
                            g: n(value.g, 255),
                            b: n(value.b, 255),
                            a: n(value.a, 255)
                        };
                    }

                    const text = String(value).trim();
                    const rgbaMatch = text.match(/^rgba?\(([^)]+)\)$/i);
                    const parts = (rgbaMatch ? rgbaMatch[1] : text).split(',').map(part => parseFloat(part.trim()));
                    if (parts.length < 3 || parts.slice(0, 3).some(part => !Number.isFinite(part))) {
                        return { r: 255, g: 255, b: 255, a: 255 };
                    }

                    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                    const alpha = Number.isFinite(parts[3])
                        ? (parts[3] <= 1 ? parts[3] * 255 : parts[3])
                        : 255;
                    return {
                        r: clamp(parts[0], 0, 255),
                        g: clamp(parts[1], 0, 255),
                        b: clamp(parts[2], 0, 255),
                        a: clamp(alpha, 0, 255)
                    };
                };

                const customLineColour = lineCfg && lineCfg.CustomColours
                    ? (lineCfg.CustomColours.columnline || lineCfg.CustomColours.ColumnLine)
                    : null;
                const lineColour = parseColumnLineColour(lineCfg && lineCfg.ColumnLineColour
                    ? lineCfg.ColumnLineColour
                    : customLineColour);
                const lineRawAlpha = lineColour.a / 255;
                // LegacyColourCompatibility.ApplyWithDoubledAlpha：Alpha 会同时作用于 Drawable.Alpha 与 Colour.Alpha。
                const lineAlpha = lineRawAlpha > 0 ? lineRawAlpha * lineRawAlpha : 0;

                if (lineHeight > 0 && lineAlpha > 0) {
                    ctx.save();
                    ctx.fillStyle = `rgba(${lineColour.r}, ${lineColour.g}, ${lineColour.b}, ${lineAlpha})`;
                    for (let i = 0; i < keys; i++) {
                        const colX = colXCache[i];
                        const colW = colWidths[i] || colWidths[0] || 0;
                        // LegacyManiaSkinConfiguration 初始化时整组填充 2；解析时只覆盖 ini 中实际提供的项。
                        const leftRaw = rawLineWidths[i] == null ? 2 : Number(rawLineWidths[i]);
                        const rightRaw = rawLineWidths[i + 1] == null ? 2 : Number(rawLineWidths[i + 1]);
                        const leftWidth = Number.isFinite(leftRaw) && leftRaw > 0 ? leftRaw * lineWidthScale : 0;
                        const rightWidth = Number.isFinite(rightRaw) && rightRaw > 0 ? rightRaw * lineWidthScale : 0;

                        if (leftWidth > 0) {
                            ctx.fillRect(colX, lineTop, leftWidth, lineHeight);
                        }

                        const showRightLine = rightWidth > 0 && (effectiveLineVersion >= 2.4 || i === keys - 1);
                        if (showRightLine) {
                            const rightLineX = colX + colW - rightWidth + ((i === keys - 1) ? -0.16 * scale768 : 0);
                            ctx.fillRect(rightLineX, lineTop, rightWidth, lineHeight);
                        }
                    }
                    ctx.restore();
                }

                // ---- 2.5 渲染小节线 (BarLine) ----
                // 从这里开始进入 Mania 演奏区：UpsideDown 时整体镜像绘制
                openUpsideDownMirror();
                const blhRes = getManiaSkinConfig(keys, LML.BarLineHeight);
                const barLineHeightRaw = (blhRes && blhRes.value != null && !isNaN(blhRes.value)) ? blhRes.value : 1.2;
                if (barLineHeightRaw > 0) {
                    const cbRes = getManiaSkinConfig(keys, LML.ColourBarline);
                    const cbCol = (cbRes && cbRes.value) ? cbRes.value : { r: 255, g: 255, b: 255, a: 255 };
                    const baseAlpha = ((cbCol.a != null) ? cbCol.a : 255) / 255;

                    if (baseAlpha > 0) {
                        const barLineH = Math.max(1, Math.round(barLineHeightRaw * scale48));
                        const currentMultiplier = Math.max(0.001, getManiaScrollMultiplierAt(currentTime, activeScrollState));
                        const effectiveSpeedFactor = speedFactor * currentMultiplier;
                        const visibleTimeAhead = (hitPos + 40) / effectiveSpeedFactor;
                        const minTime = currentTime - (25 / effectiveSpeedFactor);
                        const maxTime = currentTime + visibleTimeAhead;

                        const barlineYs = getVisibleBarlines(
                            currentTimingPoints,
                            currentTime,
                            minTime,
                            maxTime,
                            isPreviewMode,
                            (time) => hitPos - scrollDistanceAtTime(time),
                            hitPos,
                            false // 演奏区已整体镜像，这里统一按下落坐标系计算
                        );

                        if (barlineYs && barlineYs.length > 0) {
                            ctx.save();
                            for (let i = 0; i < barlineYs.length; i++) {
                                const by = barlineYs[i];
                                let alpha = baseAlpha;
                                if (by > hitPos) {
                                    const fadeOutDist = 20;
                                    const dist = by - hitPos;
                                    alpha = Math.max(0, baseAlpha * (1 - dist / fadeOutDist));
                                }
                                if (alpha <= 0) continue;

                                ctx.fillStyle = `rgba(${cbCol.r}, ${cbCol.g}, ${cbCol.b}, ${alpha})`;
                                for (const segment of stageSegments) {
                                    ctx.fillRect(segment.x, Math.round(by - barLineH / 2), segment.width, barLineH);
                                }
                            }
                            ctx.restore();
                        }
                    }
                }

                // 3. 判定线与打击点贴图 StageHint (HitTarget)
                const sjRes = getManiaSkinConfig(keys, LML.ShowJudgementLine);
                const showLine = sjRes ? sjRes.value : true;

                // 3a. 渲染打击点贴图 StageHint（按轨道或跨整轨渲染，即使 JudgementLine 为 0 亦独立渲染）
                const stageHintGlobal = getManiaSkinImage(keys, LML.HitTargetImage);

                let hasPerColHint = false;
                for (let i = 0; i < keys; i++) {
                    const colHt = getManiaSkinImage(keys, LML.HitTargetImage, i);
                    if (colHt !== stageHintGlobal) {
                        hasPerColHint = true;
                        break;
                    }
                }

                if (hasPerColHint) {
                    for (let i = 0; i < keys; i++) {
                        const colX = colXCache[i];
                        const w = colWidths[i] || colWidths[0];
                        const htImg = getManiaSkinImage(keys, LML.HitTargetImage, i);
                        if (htImg && htImg.width > 0 && htImg.height > 0) {
                            const is2x = !!htImg._is2x;
                            const nativeH = is2x ? htImg.height / 2 : htImg.height;
                            const drawH = nativeH * scale48;
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(colX, hitPos - drawH / 2, w, drawH);
                            ctx.clip();
                            ctx.drawImage(htImg, colX, hitPos - drawH / 2, w, drawH);
                            ctx.restore();
                        }
                    }
                } else if (stageHintGlobal && stageHintGlobal.width > 0 && stageHintGlobal.height > 0) {
                    const is2x = !!stageHintGlobal._is2x;
                    const nativeH = is2x ? stageHintGlobal.height / 2 : stageHintGlobal.height;
                    const drawH = nativeH * scale48;
                    // 对齐 osu! stable 与 lazer 规范 (参考实测图1): mania-stage-hint 贯穿整轨连续显示，即使有轨道间距也保持连续不断开
                    // SplitStages 开启时按左右舞台分别连续绘制，舞台之间的 StageSeparation 保持留空。
                    for (const segment of stageSegments) {
                        ctx.drawImage(stageHintGlobal, segment.x, hitPos - drawH / 2, segment.width, drawH);
                    }
                }

                // 3b. 若 ShowJudgementLine 为 true (配置 1 或默认)，渲染连续贯穿整轨的白色判定横线（即使有轨道间距也保持连续不断开）
                if (showLine) {
                    ctx.fillStyle = '#ffffff';
                    for (const segment of stageSegments) {
                        ctx.fillRect(segment.x, hitPos - 1, segment.width, 2);
                    }
                }

                // 3c. 渲染轨道按键光效 StageLight (mania-stage-light)
                // 依据 skin.ini 中的 LightPosition (默认 413 或 HitPosition) 与 ColourLight 配置
                // 对齐 osu!lazer LegacyColumnBackground: 按下时 FadeIn & Scale(1, 1)，松开时 250ms 内 FadeTo(0) & Scale(1, 0)
                const stageLightLpRes = getManiaSkinConfig(keys, LML.LightPosition);
                const stageLightPosRaw = (stageLightLpRes && stageLightLpRes.value != null && !isNaN(stageLightLpRes.value)) ? stageLightLpRes.value : (hitPos / scale48);
                const stageLightPosY = stageLightPosRaw * scale48;
                const stageLightFpsRes = getManiaSkinConfig(keys, LML.LightFramePerSecond);
                const stageLightFps = (stageLightFpsRes && stageLightFpsRes.value > 0) ? stageLightFpsRes.value : 60;
                const STAGE_LIGHT_FADE_DURATION = STAGE_LIGHT_FADE_DURATION_MS; // osu!lazer LegacyColumnBackground 经典松开动画时长 (ms)
                // 参数面板「预览发光」按钮：在 testLightUntil 到期前把所有轨道视为「按下」。
                // 发光只在按住期间可见，没有这个开关就没法在编辑器里直接看到 ColourLight 的改色效果。
                const stageLightPreviewActive = (performance.now() < testLightUntil);

                // 本帧「真实渲染出来」的按键发光 (StageLight) 矩形（真实屏幕坐标）。
                // 画布交互层据此判断可见光柱的范围：只有按下按键 / 开启预览时才有可见光柱，
                // 才能通过点击光柱本体选中「按键发光位置」。常驻的细手柄由画布交互层单独维护。
                const activeStageLightBoxes = [];

                for (let i = 0; i < keys; i++) {
                    let animAlpha = 0;
                    let animScaleY = 0;

                    if (columnPressed[i] || stageLightPreviewActive) {
                        animAlpha = 1.0;
                        animScaleY = 1.0;
                    } else if (columnLastReleaseTime[i] > -Infinity) {
                        const elapsed = currentTime - columnLastReleaseTime[i];
                        if (elapsed >= 0 && elapsed < STAGE_LIGHT_FADE_DURATION) {
                            const p = elapsed / STAGE_LIGHT_FADE_DURATION;
                            animAlpha = 1.0 - p;
                            animScaleY = 1.0 - p;
                        }
                    }

                    if (animAlpha <= 0 || animScaleY <= 0) continue;

                    const frames = getStageLightFrames(keys, i);
                    if (!frames || frames.length === 0) continue;

                    const frameIdx = (frames.length > 1)
                        ? Math.floor(((currentTime || performance.now()) / 1000 * stageLightFps) % frames.length)
                        : 0;
                    const img = frames[frameIdx];
                    if (!img || img.width <= 0 || img.height <= 0) continue;
                    // 若贴图为 1x1 占位透明图，则无需绘制
                    if (img.width <= 1 || img.height <= 1) continue;

                    const is2x = !!img._is2x;
                    const nativeH = is2x ? img.height / 2 : img.height;
                    const colW = colWidths[i] || colWidths[0];
                    const colX = colXCache[i];

                    // 轨道变宽时进行横向拉伸充满轨道 (drawW = colW)；
                    // 垂直高度保持为 nativeH * scale768，不随轨道宽度等比暴涨；同时随释放动画按 animScaleY 向底端判定线收缩
                    const drawW = colW;
                    const drawH = nativeH * scale768 * animScaleY;
                    const drawX = colX;
                    const drawY = stageLightPosY - drawH;

                    activeStageLightBoxes.push({
                        col: i,
                        x: drawX,
                        y: rectTop(drawY, drawH),
                        w: drawW,
                        h: drawH
                    });

                    const colLight = getManiaColourLight(keys, i);
                    const isWhite = (colLight.r === 255 && colLight.g === 255 && colLight.b === 255);
                    // 对齐 lazer LegacyColourCompatibility.DisallowZeroAlpha：
                    //   `if (colour.A == 0) colour.A = 1;`
                    // 即 alpha=0 会被强制改成「全不透明」，所以 skin.ini 写 `ColourLight1: 255,0,0,0`
                    // 在游戏里是「不透明红光」而不是「看不见」。想彻底隐藏发光请用 StageLight: blank。
                    const rawLightA = (colLight.a != null && !isNaN(colLight.a)) ? colLight.a : 255;
                    const effectiveLightA = (rawLightA === 0) ? 255 : rawLightA;
                    const skinAlpha = effectiveLightA / 255;
                    const finalAlpha = skinAlpha * animAlpha;

                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = finalAlpha;
                    if (!isWhite) {
                        const tinted = getTintedLightCanvas(img, colLight);
                        ctx.drawImage(tinted, drawX, drawY, drawW, drawH);
                    } else {
                        ctx.drawImage(img, drawX, drawY, drawW, drawH);
                    }
                    ctx.restore();
                }

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
                const triggerJudgement = (now, specificLookup = null) => {
                    const defaultScorePosRaw = isUpsideDown ? (480 - DEFAULT_SCORE_POSITION) : DEFAULT_SCORE_POSITION;
                    let scorePosY = (scorePosFromSkin !== null)
                        ? scorePosFromSkin
                        : defaultScorePosRaw * scale48;
                    let scorePosX = startX + totalTrackWidth / 2;

                    let lookup = specificLookup || LML.Hit300g;
                    let isMiss = (lookup === LML.Hit0);

                    let hitFrames = getManiaSkinAnimationFrames(keys, lookup) || null;
                    let hitImg = (hitFrames && hitFrames.length > 0)
                        ? hitFrames[0]
                        : (getManiaSkinImage(keys, lookup) || null);

                    // 若 300g 无独立贴图，回退至 300
                    if (!hitImg && lookup === LML.Hit300g) {
                        hitFrames = getManiaSkinAnimationFrames(keys, LML.Hit300);
                        hitImg = (hitFrames && hitFrames.length > 0) ? hitFrames[0] : getManiaSkinImage(keys, LML.Hit300);
                    }

                    // 对齐 osu!lazer LegacyManiaJudgementPiece: 随机生成 [-5.73°, +5.73°] 的旋转角度
                    const targetRotation = (Math.random() - 0.5) * (11.46 * Math.PI / 180);

                    // 动画时间重叠衔接优化：
                    // 如果前一个动画正在播放，且正处于缩小或持续阶段，有新按键/音符判定要播放时，
                    // 不直接从 0.8 突变打断，而是从当前的缩放大小无缝开始快速放大（把大小再顶回到 1.0），然后继续播放缩小的动画
                    let startScale = 0.80;
                    let startAlpha = 0.0;
                    if (judgements.length > 0) {
                        const prev = judgements[0];
                        const prevElapsed = (prev.hitTime !== undefined) ? (now - prev.hitTime) : ((prev.elapsed !== undefined) ? prev.elapsed : 999);
                        if (prevElapsed < 2) {
                            // 同一瞬间触发的押键（双押/多押音符），继承相同的起始缩放与透明度
                            startScale = (prev.startScale != null) ? prev.startScale : 0.80;
                            startAlpha = (prev.startAlpha != null) ? prev.startAlpha : 0.0;
                        } else {
                            const prevHasSkin = (prev.frames && prev.frames.length > 0) || (prev.img && prev.img.width > 0);
                            const prevMaxLifetime = prevHasSkin ? 220 : (prev.isMiss ? 800 : 550);
                            if (prevElapsed >= 0 && prevElapsed <= prevMaxLifetime) {
                                startScale = getJudgementCurrentScale(prev, prevElapsed);
                                startAlpha = getJudgementCurrentAlpha(prev, prevElapsed);
                            }
                        }
                    }

                    judgements = [{
                        x: scorePosX,
                        y: scorePosY,
                        hitTime: now,
                        img: hitImg,
                        frames: hitFrames,
                        isMiss: isMiss,
                        lookup: lookup,
                        targetRotation: targetRotation,
                        startScale: startScale,
                        startAlpha: startAlpha
                    }];
                };

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

                    const holdHeadImg = getManiaSkinImage(keys, LML.HoldNoteHeadImage, note.column);
                    const holdTailImg = getManiaSkinImage(keys, LML.HoldNoteTailImage, note.column);
                    const holdBodyImg = getManiaSkinImage(keys, LML.HoldNoteBodyImage, note.column);

                    const headDrawHeight = holdHeadImg ? getManiaNoteDrawHeight(keys, note.column, holdHeadImg, w, scale48) : Math.round(20 * scale48);
                    const tailDrawHeight = holdTailImg ? getManiaNoteDrawHeight(keys, note.column, holdTailImg, w, scale48) : Math.round(20 * scale48);

                    // 用户指出及对齐 osu!stable 规范:
                    // 长条头部实际上到达贴图中间才判定/消失，长条身体与尾巴的判定基准比长条头底部高半个长条头高度 (headDrawHeight / 2)。
                    // 因此长条的身体和尾巴基准线向上抬高半个长条头贴图高度，长条头不同高度会使长条与尾巴位置产生相应偏移。
                    const headOffset = headDrawHeight / 2;
                    let tailY = (hitPos - headOffset) - (note.scrollPositionEnd - currentScrollPosition) * speedFactor;
                    let headBottomY;
                    if (currentTime < note.startTime) {
                        headBottomY = (hitPos - headOffset) - (note.scrollPositionStart - currentScrollPosition) * speedFactor;
                        note.holdHeadFrozen = false;
                    } else {
                        headBottomY = hitPos - headOffset;
                        note.holdHeadFrozen = true;
                    }

                    const wholeTop = Math.min(tailY - tailDrawHeight, headBottomY - headDrawHeight);
                    const wholeBottom = Math.max(tailY, headBottomY + headOffset);
                    if (wholeBottom < -100 || wholeTop > canvas.height + 100) continue;

                    const headCenterY = headBottomY;
                    const tailBottomY = tailY;
                    const tailTopY = tailBottomY - tailDrawHeight;
                    const bodyBottom = headBottomY;
                    const bodyTop = Math.min(bodyBottom, tailTopY);
                    const bodyHeight = Math.max(0, bodyBottom - bodyTop);

                    // 5a. 身体 (到达头部判定线 headBottomY 截断)
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

                            const nativeW = holdBodyImg.width || 1;
                            const nativeH = holdBodyImg.height || 1;
                            // osu!stable 规范: 长条身体贴图在垂直方向按轨道列宽 w 保持原生等比缩放 (w / nativeW)，
                            // 贴图宽高比与游戏内保持 1:1，使 Percy LN 超长贴图的淡化过渡区与标准平铺贴图与 stable 物理长度严格一致
                            const scaledNativeH = Math.max(1, nativeH * (w / nativeW));

                            if (style === NOTE_BODY_STYLE.Stretch) {
                                // 0: Stretch (整段拉伸)
                                ctx.drawImage(holdBodyImg, colX, bodyTop, w, bodyHeight);
                            } else {
                                // 1: RepeatFromTail (Cascade from top) / 2: RepeatFromHead (Cascade from bottom)
                                ctx.save();
                                ctx.beginPath();
                                ctx.rect(colX, bodyTop, w, bodyHeight);
                                ctx.clip();

                                if (style === NOTE_BODY_STYLE.RepeatFromTail) {
                                    // 1: Cascade from top - 贴图以 1:1 原生垂直比例从 bodyTop 向下平铺级联，超出 bodyBottom 被 clip 裁切
                                    for (let y = bodyTop; y < bodyBottom; y += scaledNativeH) {
                                        ctx.drawImage(holdBodyImg, colX, y, w, scaledNativeH);
                                    }
                                } else {
                                    // 2: Cascade from bottom - 贴图以 1:1 原生垂直比例从 bodyBottom 向上平铺级联，超出 bodyTop 被 clip 裁切
                                    for (let y = bodyBottom; y > bodyTop; y -= scaledNativeH) {
                                        ctx.drawImage(holdBodyImg, colX, y - scaledNativeH, w, scaledNativeH);
                                    }
                                }
                                ctx.restore();
                            }
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

                const renderKeyImages = () => {
                    const keyAreaHeight = canvas.height - hitPos;

                    for (let i = 0; i < keys; i++) {
                        const colW = colWidths[i] || colWidths[0];
                        const colX = colXCache[i];
                        const isPressed = columnPressed[i];

                        const keyImg = isPressed
                            ? getManiaSkinImage(keys, LML.KeyImageDown, i)
                            : getManiaSkinImage(keys, LML.KeyImage, i);

                        if (keyImg && keyImg.width > 0 && keyImg.height > 0) {
                            const rawColWRes = getManiaSkinConfig(keys, LML.ColumnWidth, i);
                            const rawColW = (rawColWRes && rawColWRes.value > 0) ? rawColWRes.value : 30;

                            const is2x = !!keyImg._is2x;
                            const scaleFactor = is2x ? 3.2 : 1.6;
                            const stableRefW = rawColW * scaleFactor;

                            const drawWidth = colW;
                            let drawHeight;
                            if (Math.abs(keyImg.width - stableRefW) < 1) {
                                drawHeight = drawWidth * keyImg.height / keyImg.width;
                            } else {
                                drawHeight = drawWidth * keyImg.height / stableRefW;
                            }
                            const drawX = colX;
                            const drawY = canvas.height - drawHeight;

                            ctx.drawImage(keyImg, drawX, drawY, drawWidth, drawHeight);
                        } else {
                            const pad = 8;
                            const dia = Math.max(16, Math.min(colW, keyAreaHeight) - pad * 2);
                            const drawX = colX + (colW - dia) / 2;
                            const drawY = canvas.height - dia - pad;
                            const cx = drawX + dia / 2;
                            const cy = drawY + dia / 2;
                            const r = dia / 2;

                            ctx.save();
                            if (isPressed) {
                                const gradFill = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
                                gradFill.addColorStop(0, 'rgba(235, 235, 235, 1)');
                                gradFill.addColorStop(1, 'rgba(180, 180, 180, 1)');
                                ctx.fillStyle = gradFill;
                                ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.fill();
                                ctx.strokeStyle = '#ffffff';
                                ctx.lineWidth = 3;
                                ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
                            } else {
                                ctx.strokeStyle = '#ffffff';
                                ctx.lineWidth = 3;
                                ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
                                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                                ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.fill();
                            }
                            ctx.restore();
                        }
                    }
                };

                const renderNotes = () => {
                    for (let i = 0; i < notesList.length; i++) {
                        let note = notesList[i];
                        let w = colWidths[note.column];
                        let colX = colXCache[note.column];

                        if (!note.isHold) {
                            if (note.hit) continue;
                            let bottomY = hitPos - (note.scrollPositionStart - currentScrollPosition) * speedFactor;
                            if (bottomY > canvas.height + 80 || bottomY < -80) continue;

                            let noteImg = getManiaSkinImage(keys, LML.NoteImage, note.column);
                            const drawHeight = noteImg ? getManiaNoteDrawHeight(keys, note.column, noteImg, w, scale48) : Math.round(20 * scale48);

                            if (canvasEditMode && bottomY <= hitPos + 25) {
                                activeNoteElements.push({
                                    id: `note_${note.column}`,
                                    noteInstanceKey: `note_${note.column}_${note.startTime}`,
                                    name: `第 ${note.column + 1} 轨单键`,
                                    paramKey: `NoteImage${note.column}`,
                                    fallbackParamKey: 'NoteImage',
                                    category: 'Mania',
                                    x: colX,
                                    y: rectTop(bottomY - drawHeight, drawHeight),
                                    w: w,
                                    h: drawHeight,
                                    isTexture: true,
                                    textureName: getManiaNoteTextureName(keys, LML.NoteImage, note.column),
                                    textureKey: LML.NoteImage,
                                    colIndex: note.column,
                                    dragAxis: null,
                                    valFormatter: () => `第 ${note.column + 1} 轨音符`
                                });
                            }

                            if (noteImg) {
                                ctx.drawImage(noteImg, colX, bottomY - drawHeight, w, drawHeight);
                            } else {
                                const r = 4;
                                const nh = Math.round(20 * scale48 / 1.5);
                                ctx.fillStyle = note.column % 2 === 0 ? '#00e5ff' : '#ffffff';
                                roundRect(ctx, colX + 2, bottomY - nh, w - 4, nh, r);
                                ctx.fill();
                            }
                        } else {
                            if (currentTime >= note.endTime) continue;

                            const holdHeadImg = getManiaSkinImage(keys, LML.HoldNoteHeadImage, note.column);
                            const headDrawHeight = holdHeadImg ? getManiaNoteDrawHeight(keys, note.column, holdHeadImg, w, scale48) : Math.round(22 * scale48 / 1.5);

                            let headBottomY;
                            if (currentTime < note.startTime) {
                                headBottomY = hitPos - (note.scrollPositionStart - currentScrollPosition) * speedFactor;
                            } else {
                                headBottomY = hitPos;
                            }

                            if (headBottomY > canvas.height + 80 || headBottomY < -80) continue;

                            if (canvasEditMode && headBottomY <= hitPos + 25) {
                                activeNoteElements.push({
                                    id: `hold_head_${note.column}`,
                                    noteInstanceKey: `hold_head_${note.column}_${note.startTime}`,
                                    name: `第 ${note.column + 1} 轨长条头`,
                                    paramKey: `NoteImage${note.column}H`,
                                    fallbackParamKey: 'HoldNoteHeadImage',
                                    category: 'Mania',
                                    x: colX,
                                    y: rectTop(headBottomY - headDrawHeight, headDrawHeight),
                                    w: w,
                                    h: headDrawHeight,
                                    isTexture: true,
                                    textureName: getManiaNoteTextureName(keys, LML.HoldNoteHeadImage, note.column),
                                    textureKey: LML.HoldNoteHeadImage,
                                    colIndex: note.column,
                                    dragAxis: null,
                                    valFormatter: () => `第 ${note.column + 1} 轨长条头`
                                });
                            }

                            if (holdHeadImg) {
                                ctx.drawImage(holdHeadImg, colX, headBottomY - headDrawHeight, w, headDrawHeight);
                            } else {
                                const r = 4;
                                ctx.fillStyle = '#ffffff';
                                roundRect(ctx, colX + 2, headBottomY - headDrawHeight, w - 4, headDrawHeight, r);
                                ctx.fill();
                                if (note.holdHeadFrozen) {
                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                                    ctx.fillRect(colX + 2, headBottomY - 3, w - 4, 3);
                                }
                            }
                        }
                    }
                };

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

                // 渲染血条（对齐 osu!lazer / stable 规范：位于轨道右侧，逆时针旋转 90 度，底部对齐，满血常驻展示）
                drawHealthDisplay(startX, totalTrackWidth, trailingSpacing, scale768);

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
