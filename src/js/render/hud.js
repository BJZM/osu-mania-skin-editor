// ============================================================================
// hud.js - 分数、准度、连击 HUD 与血条绘制
// 依赖：render/fonts.js、render/textures.js
// ============================================================================


        function drawTopRightHUD(keys, scale768) {
            const hudInteractiveElements = [];
            const maniaCfg = getManiaConfigForKeys(keys);
            const scoreFontPrefix = (maniaCfg && maniaCfg.FontScore) ? maniaCfg.FontScore : (skinFontsConfig.scorePrefix || 'score');

            // 1. 获取基准数字参考贴图（优先 '5'，回退 '0'，对齐 lazer FixedWidthReferenceCharacter）
            const refImg = getSkinFontImage('score', '5', keys) || getSkinFontImage('score', '0', keys);
            let refNativeW = 30;
            let refNativeH = 46;
            if (refImg && refImg.height > 0) {
                const is2x = refImg._is2x || false;
                refNativeW = is2x ? (refImg.width / 2) : refImg.width;
                refNativeH = is2x ? (refImg.height / 2) : refImg.height;
            }

            const rawOverlap = getSkinFontOverlap('score', keys);

            // ---- A. 分数 (Score: "01234567") ----
            const scoreText = "01234567";
            const scoreScale = 0.96 * scale768;
            const scoreSlotW = refNativeW * scoreScale;
            const scoreSlotH = refNativeH * scoreScale;
            const scoreOverlap = rawOverlap * scoreScale;
            const scoreAdvance = scoreSlotW - scoreOverlap;
            const scoreTotalW = (scoreText.length - 1) * scoreAdvance + scoreSlotW;

            const scoreMarginRight = 10 * scale768;
            const scoreMarginTop = 10 * scale768;
            const scoreRightX = canvas.width - scoreMarginRight;
            const scoreLeftX = scoreRightX - scoreTotalW;
            const scoreTopY = scoreMarginTop;

            ctx.save();
            for (let i = 0; i < scoreText.length; i++) {
                const ch = scoreText[i];
                const img = getSkinFontImage('score', ch, keys);
                const slotX = scoreLeftX + i * scoreAdvance;

                let charW = scoreSlotW;
                let charH = scoreSlotH;
                let drawX = slotX;

                if (img) {
                    const is2x = img._is2x || false;
                    const charNativeW = is2x ? (img.width / 2) : img.width;
                    const charNativeH = is2x ? (img.height / 2) : img.height;
                    charW = charNativeW * scoreScale;
                    charH = charNativeH * scoreScale;
                    // FixedWidth 模式下数字在槽内居中
                    drawX = slotX + (scoreSlotW - charW) / 2;
                    ctx.drawImage(img, drawX, scoreTopY, charW, charH);
                } else {
                    ctx.font = `bold ${Math.round(scoreSlotH * 0.8)}px sans-serif`;
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(ch, slotX + scoreSlotW / 2, scoreTopY);
                }

                hudInteractiveElements.push({
                    id: `hud_score_digit_${i}`,
                    name: `右上角分数数字 ${ch}`,
                    paramKey: 'ScorePrefix',
                    category: 'Fonts',
                    x: Math.min(drawX, slotX),
                    y: scoreTopY,
                    w: Math.max(charW, scoreSlotW),
                    h: Math.max(charH, scoreSlotH),
                    isTexture: true,
                    textureName: `${scoreFontPrefix}-${ch}`,
                    textureKey: `${scoreFontPrefix}-${ch}`,
                    dragAxis: null,
                    valFormatter: () => `${scoreFontPrefix}-${ch}`
                });
            }
            ctx.restore();

            // ---- B. 准度 (Accuracy: "98.00%") ----
            // 检查当前皮肤的百分号 (%)：
            // 1. 若皮肤提供 1x1 占位图，代表作者刻意隐藏百分号，准度展示为纯数字 "98.00"
            // 2. 若存在正常贴图或超宽平移垫片，则保留 "%" 字符并按垫片宽度向左推移准度
            const percentImg = getSkinFontImage('score', '%', keys);
            const isPercentHidden = !!(percentImg && percentImg._isBlankPlaceholder);
            const accText = isPercentHidden ? "98.00" : "98.00%";

            const accScale = 0.576 * scale768; // 0.6 * 0.96
            const accDigitSlotW = refNativeW * accScale;
            const accOverlap = rawOverlap * accScale;
            // 对齐游戏内规范：准度右侧与分数右侧严格右对齐
            const accRightX = scoreRightX;
            // 对齐游戏内垂直间隙（分数底部到准度/饼图顶部约 12px）
            const accMarginTop = 6.5 * scale768;
            const accTopY = scoreTopY + scoreSlotH + accMarginTop;
            const accH = refNativeH * accScale;

            // 预先度量准度文本各字符宽度（'.' 与 '%' 排除在 fixedWidth 之外，使用原生宽度）
            const accGlyphs = [];
            let accTotalW = 0;
            for (let i = 0; i < accText.length; i++) {
                const ch = accText[i];
                const img = (ch === '%' && percentImg) ? percentImg : getSkinFontImage('score', ch, keys);
                const isExcluded = (ch === '.' || ch === '%' || ch === ',');

                let nativeW = refNativeW;
                let nativeH = refNativeH;
                if (img) {
                    if (img._isBlankPlaceholder) {
                        nativeW = 0;
                        nativeH = 0;
                    } else {
                        const is2x = img._is2x || false;
                        nativeW = is2x ? (img.width / 2) : img.width;
                        nativeH = is2x ? (img.height / 2) : img.height;
                    }
                }

                const charW = nativeW * accScale;
                const charH = (ch === '%') ? Math.min(nativeH, refNativeH * 1.5) * accScale : nativeH * accScale;
                const slotW = isExcluded ? charW : accDigitSlotW;

                accGlyphs.push({ ch, img, charW, charH, slotW, isExcluded });
                accTotalW += (i < accText.length - 1) ? (slotW - accOverlap) : slotW;
            }

            const accLeftX = accRightX - accTotalW;

            ctx.save();
            let curAccX = accLeftX;
            let firstCharDrawX = accLeftX;
            for (let i = 0; i < accGlyphs.length; i++) {
                const glyph = accGlyphs[i];
                const drawX = glyph.isExcluded ? curAccX : curAccX + (glyph.slotW - glyph.charW) / 2;
                if (i === 0) firstCharDrawX = drawX;

                if (glyph.img && !glyph.img._isBlankPlaceholder) {
                    // 透明垫片本身不会产生可见像素；可见字形则正常绘制。这样既能保留
                    // 超宽透明 score-percent 的位移技巧，也允许在右侧恢复显示百分号。
                    ctx.drawImage(glyph.img, drawX, accTopY, glyph.charW, glyph.charH);
                } else if (!glyph.img && glyph.ch !== '%') {
                    ctx.font = `bold ${Math.round(accH * 0.8)}px sans-serif`;
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(glyph.ch, curAccX, accTopY);
                }

                if (!glyph.img || !glyph.img._isBlankPlaceholder) {
                    const charNameMap = { '.': 'dot', '%': 'percent', ',': 'comma' };
                    const glyphKey = charNameMap[glyph.ch] || glyph.ch;
                    const glyphLabel = glyph.ch === '.' ? '小数点' : (glyph.ch === '%' ? '百分号' : `数字 ${glyph.ch}`);
                    const elemW = Math.max(glyph.charW, glyph.slotW, 10 * scale768);
                    const elemH = Math.max(glyph.charH, accH, 12 * scale768);

                    hudInteractiveElements.push({
                        id: `hud_acc_glyph_${i}`,
                        name: `右上角准度${glyphLabel}`,
                        paramKey: 'ScorePrefix',
                        category: 'Fonts',
                        x: Math.min(drawX, curAccX),
                        y: accTopY,
                        w: elemW,
                        h: elemH,
                        isTexture: true,
                        textureName: `${scoreFontPrefix}-${glyphKey}`,
                        textureKey: `${scoreFontPrefix}-${glyphKey}`,
                        dragAxis: null,
                        valFormatter: () => `${scoreFontPrefix}-${glyphKey}`
                    });
                }

                curAccX += (glyph.slotW - accOverlap);
            }
            ctx.restore();

            // ---- C. 歌曲进度饼图 (Song Progress Pie: 纯代码几何图形对齐 lazer / stable 规范) ----
            let songProgressVal = 0.12; // 默认空闲预览对齐游戏内开局轻量进度（约 12%）
            if (audio && !isNaN(audio.duration) && audio.duration > 0 && !audio.paused) {
                const playbackTime = getPlaybackTimeSeconds();
                songProgressVal = Math.max(0, Math.min(1, playbackTime / audio.duration));
            } else if (ui.progressRange && !isNaN(ui.progressRange.max) && Number(ui.progressRange.max) > 0 && Number(ui.progressRange.value) > 0) {
                songProgressVal = Math.max(0, Math.min(1, Number(ui.progressRange.value) / Number(ui.progressRange.max)));
            }

            const pieDiameter = 33 * scale768;
            const pieRadius = pieDiameter / 2;
            // 间距计算对齐游戏真实测量：饼图右边缘距准度首个字符实际绘制左边缘为 13.5 * scale768（在 1080p 下精确对应 19px）
            const pieGap = 13.5 * scale768;
            const pieCenterX = firstCharDrawX - pieGap - pieRadius;
            const pieCenterY = accTopY + accH / 2;

            ctx.save();
            // 1. 内部动态半透明白色扇形 (0.92 尺寸比例，从 12 点钟 -PI/2 顺时针扫射，alpha: 0.6)
            if (songProgressVal > 0) {
                const innerRadius = (33 * 0.92 * scale768) / 2;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.beginPath();
                ctx.moveTo(pieCenterX, pieCenterY);
                ctx.arc(pieCenterX, pieCenterY, innerRadius, -Math.PI / 2, -Math.PI / 2 + songProgressVal * Math.PI * 2, false);
                ctx.closePath();
                ctx.fill();
            }

            // 2. 外部白色圆环边框 (直径 33px，线宽 2px，带抗锯齿辉光)
            ctx.save();
            ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
            ctx.shadowBlur = 3 * scale768;
            const borderWidth = 2 * scale768;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = borderWidth;
            ctx.beginPath();
            ctx.arc(pieCenterX, pieCenterY, (pieDiameter - borderWidth) / 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // 3. 中心小白圆点 (直径 4px，半径 2px)
            const dotRadius = 2 * scale768;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(pieCenterX, pieCenterY, dotRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();

            hudInteractiveElements.push({
                id: 'hud_progress_pie',
                name: '调整acc水平位置',
                paramKey: 'ScorePercentWidth',
                category: 'Mania',
                x: pieCenterX - pieRadius - 5,
                y: pieCenterY - pieRadius - 5,
                w: pieDiameter + 10,
                h: pieDiameter + 10,
                isTexture: false,
                dragAxis: 'x',
                dragType: 'score_percent_width',
                valFormatter: () => `${getScorePercentPaddingWidth(keys)}px`
            });

            return hudInteractiveElements;
        }

        // 6. 自动加载默认皮肤设定：若皮肤不包含有效血条贴图（缺失或仅为 1x1 占位图），在开启设定时自动回退并渲染默认皮肤血条
        // =========================================================================
        function drawHealthDisplay(startX, totalTrackWidth, trailingSpacing, scale768) {
            // 检查当前导入的皮肤中是否存在血条相关贴图
            // osu! 规范：只要皮肤包含了 scorebar-colour 或 scorebar-bg（无论是否有帧动画，也无论是否是 1x1 透明隐形占位图），
            // 均视为皮肤作者显式自定义了血条（1x1 常见于各类 mania 皮肤以彻底隐去血条），此时绝对禁止回退到默认皮肤！
            let userColourFrames = getSkinAnimationFramesFromStore(skinImageStore, 'scorebar-colour');
            let userColourImg = (userColourFrames && userColourFrames.length > 0) ? userColourFrames[0] : getSkinAnimationFromStore(skinImageStore, 'scorebar-colour');
            let userBgImg = getSkinAnimationFromStore(skinImageStore, 'scorebar-bg');
            let userMarkerImg = getSkinAnimationFromStore(skinImageStore, 'scorebar-marker');

            const hasCustomHealth = !!(userColourImg || (userColourFrames && userColourFrames.length > 0) || userBgImg);

            let bgImg = null;
            let colourImg = null;
            let markerImg = null;

            if (hasCustomHealth) {
                if (userColourFrames && userColourFrames.length > 0) {
                    const fps = 60;
                    const frameIdx = Math.floor((performance.now() / 1000 * fps) % userColourFrames.length);
                    colourImg = userColourFrames[frameIdx] || userColourFrames[0];
                } else {
                    colourImg = userColourImg;
                }
                bgImg = userBgImg;
                markerImg = userMarkerImg;
            } else {
                // 仅当用户皮肤完全没有提供任何血条贴图时，才回退到官方默认皮肤
                const defFrames = getSkinAnimationFramesFromStore(defaultSkinImageStore, 'scorebar-colour');
                if (defFrames && defFrames.length > 0) {
                    const fps = 60;
                    const frameIdx = Math.floor((performance.now() / 1000 * fps) % defFrames.length);
                    colourImg = defFrames[frameIdx] || defFrames[0];
                } else {
                    colourImg = getSkinAnimationFromStore(defaultSkinImageStore, 'scorebar-colour');
                }
                bgImg = getSkinAnimationFromStore(defaultSkinImageStore, 'scorebar-bg');
                markerImg = getSkinAnimationFromStore(defaultSkinImageStore, 'scorebar-marker');
            }

            if (!bgImg && !colourImg) return;

            const bgW = (bgImg && bgImg.width > 0) ? (bgImg._is2x ? bgImg.width / 2 : bgImg.width) : 0;
            const bgH = (bgImg && bgImg.height > 0) ? (bgImg._is2x ? bgImg.height / 2 : bgImg.height) : 0;
            const hasRealBg = (bgImg && bgW > 1 && bgH > 1);

            const isNewStyle = !!markerImg;

            // osu!lazer 槽位硬编码偏移规范（仅在存在实体背景时应用，无背景或 1x1 占位图时偏移归零）：
            // LegacyNewStyleFill: Vector2(7.5f, 7.8f) * 1.6f
            // LegacyOldStyleFill: Vector2(3.0f, 10.0f) * 1.6f
            const fillOffsetX = hasRealBg ? (isNewStyle ? 7.5 : 3.0) * 1.6 : 0;
            const fillOffsetY = hasRealBg ? (isNewStyle ? 7.8 : 10.0) * 1.6 : 0;

            const clrW = (colourImg && colourImg.width > 0) ? (colourImg._is2x ? colourImg.width / 2 : colourImg.width) : 0;
            const clrH = (colourImg && colourImg.height > 0) ? (colourImg._is2x ? colourImg.height / 2 : colourImg.height) : 0;

            // 对齐 mania HUD / Judgement 标准缩放倍率 scale768 * 0.70
            const healthScale = scale768 * 0.70;

            const healthBarX = startX + totalTrackWidth + (trailingSpacing || 0);
            const bottomY = canvas.height;

            ctx.save();
            ctx.translate(healthBarX, bottomY);
            ctx.rotate(-Math.PI / 2);
            ctx.scale(healthScale, healthScale);

            // 1. 渲染背景 scorebar-bg（仅存在实体背景槽时绘制）
            if (hasRealBg) {
                ctx.drawImage(bgImg, 0, 0, bgW, bgH);
            }

            // 2. 渲染颜色条 scorebar-colour（满血常驻展示；1x1 占位图则直接跳过渲染）
            if (colourImg && clrW > 1 && clrH > 1) {
                ctx.drawImage(colourImg, fillOffsetX, fillOffsetY, clrW, clrH);
            }

            ctx.restore();
        }
