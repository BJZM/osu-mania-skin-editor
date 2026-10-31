// ============================================================================
// frame-playfield.js - Mania 轨道背景、分界线、小节线与判定线绘制
// 从 render/frame.js 按帧内职责拆分；共享数据通过 context 显式传入。
// ============================================================================

        function renderFramePlayfield(context) {
            const {
                ctx, keys, colWidths, colSpacings, colXCache, stageSegments,
                startX, totalTrackWidth, stageSplitAfter, canvas, isUpsideDown, hitPos,
                openUpsideDownMirror, currentTime, activeScrollState, speedFactor,
                scrollDistanceAtTime, currentTimingPoints, isPreviewMode, scale48,
                scale768, globalSkinVersion, getManiaConfigForKeys,
                getManiaSkinConfig, getManiaSkinImage, getVisibleBarlines
            } = context;
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

            // 舞台侧图属于演奏区前景，不能继承背景或故事板残留的透明度/混合模式。
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.filter = 'none';
            for (const segment of stageSegments) {
                if (stageLeftWidth > 0) {
                    ctx.drawImage(stageLeftImg, segment.x - stageLeftWidth, 0, stageLeftWidth, canvas.height);
                }
                if (stageRightWidth > 0) {
                    ctx.drawImage(stageRightImg, segment.x + segment.width, 0, stageRightWidth, canvas.height);
                }
            }
            ctx.restore();

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

            // 3b. 若 ShowJudgementLine 为 true (配置 1 或默认)，渲染白色判定横线。
            // KeyImage 在后续帧步骤里画在判定线之上，用普通 source-over 叠上去：
            // 不透明像素盖住判定线，alpha=0 的透明区域仍能看到下面的判定线。
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

            return {
                showLine, stageLightLpRes, stageLightPosY, stageLightFps,
                stageLightFadeDuration: STAGE_LIGHT_FADE_DURATION,
                stageLightPreviewActive
            };
        }
